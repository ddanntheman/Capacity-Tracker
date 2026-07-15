using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

/// <summary>
/// Firm-level Net Revenue / Net Fees rollups derived live from engagement
/// revenue phasing, captured invoices, and recoverable expenses, with
/// finance-maintained monthly targets (RU-01..06).
/// </summary>
public class RollupsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("GetFirmRollup")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "rollups")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var from = ParsePeriod(req.Query["from"]) ?? new DateOnly(today.Year, 1, 1);
        var to = ParsePeriod(req.Query["to"]) ?? new DateOnly(today.Year, 12, 1);
        if (to < from)
        {
            return new BadRequestObjectResult(new { error = "'to' must not be before 'from'." });
        }

        var plans = await db.PricingPlans.AsNoTracking()
            .Include(p => p.Project)
            .Include(p => p.MdOwner)
            .Where(p => p.Status == PlanStatus.ActivePursuit || p.Status == PlanStatus.ClosedWon)
            .ToListAsync();
        var planIds = plans.Select(p => p.PricingPlanId).ToList();
        var projectIds = plans.Select(p => p.ProjectId).ToList();

        var phases = await db.RevenuePhases.AsNoTracking()
            .Where(r => planIds.Contains(r.PricingPlanId) && r.PeriodStart >= from && r.PeriodStart <= to)
            .ToListAsync();
        var invoices = await db.InvoiceRecords.AsNoTracking()
            .Where(i => projectIds.Contains(i.ProjectId) && i.PeriodStart >= from && i.PeriodStart <= to)
            .ToListAsync();
        var expenses = await db.RecoverableExpenseEntries.AsNoTracking()
            .Where(e => projectIds.Contains(e.ProjectId) && e.PeriodStart >= from && e.PeriodStart <= to)
            .ToListAsync();
        var targets = await db.FirmTargets.AsNoTracking()
            .Where(t => t.PeriodStart >= from && t.PeriodStart <= to)
            .ToDictionaryAsync(t => t.PeriodStart);

        var phasesByPlan = phases.GroupBy(p => p.PricingPlanId).ToDictionary(g => g.Key, g => g.ToList());
        var invoicesByProject = invoices.GroupBy(i => i.ProjectId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(i => i.PeriodStart, i => i.InvoicedAmount));
        var expensesByMonth = expenses.GroupBy(e => e.PeriodStart).ToDictionary(g => g.Key, g => g.Sum(e => e.Amount));

        var months = new List<DateOnly>();
        for (var m = from; m <= to; m = m.AddMonths(1))
        {
            months.Add(m);
        }

        var engagements = new List<RollupEngagementDto>();
        foreach (var plan in plans.OrderBy(p => p.Project?.ClientName).ThenBy(p => p.Project?.ProjectName))
        {
            phasesByPlan.TryGetValue(plan.PricingPlanId, out var planPhases);
            invoicesByProject.TryGetValue(plan.ProjectId, out var planInvoices);
            var byMonthLayer = (planPhases ?? [])
                .GroupBy(p => (p.PeriodStart, p.Layer))
                .ToDictionary(g => g.Key, g => g.Sum(p => p.Amount));

            var rows = months.Select(m => new RollupEngagementMonthDto(
                m,
                byMonthLayer.GetValueOrDefault((m, RevenueLayer.OriginalPlan)),
                byMonthLayer.GetValueOrDefault((m, RevenueLayer.Forecast)),
                planInvoices?.GetValueOrDefault(m) ?? 0m)).ToList();
            if (rows.All(r => r.OriginalPlan == 0 && r.Forecast == 0 && r.Actual == 0))
            {
                continue;
            }

            var project = plan.Project;
            engagements.Add(new RollupEngagementDto(
                plan.ProjectId,
                plan.PricingPlanId,
                project?.ClientName ?? "",
                project?.ProjectName ?? "",
                // Engagements awaiting an official finance code get a stable
                // placeholder code (RU-06).
                project?.JobCode ?? $"PENDING-{plan.ProjectId.ToString()[..8].ToUpperInvariant()}",
                string.IsNullOrWhiteSpace(project?.JobCode),
                plan.MdOwner?.DisplayName,
                project?.EngagementType,
                plan.Practice,
                PricingPlansFunctions.StatusName(plan.Status),
                rows,
                rows.Sum(r => r.OriginalPlan),
                rows.Sum(r => r.Forecast),
                rows.Sum(r => r.Actual)));
        }

        var monthDtos = months.Select(m =>
        {
            var original = engagements.Sum(e => e.Months.First(r => r.PeriodStart == m).OriginalPlan);
            var forecast = engagements.Sum(e => e.Months.First(r => r.PeriodStart == m).Forecast);
            var actual = engagements.Sum(e => e.Months.First(r => r.PeriodStart == m).Actual);
            var monthExpenses = expensesByMonth.GetValueOrDefault(m);
            targets.TryGetValue(m, out var target);
            return new RollupMonthDto(
                m,
                original,
                forecast,
                actual,
                forecast - monthExpenses,
                actual - monthExpenses,
                target?.RevenueTarget,
                target?.NetFeesTarget);
        }).ToList();

        return new OkObjectResult(new FirmRollupDto(from, to, monthDtos, engagements));
    }

    [Function("ListFirmTargets")]
    public async Task<IActionResult> ListTargets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "rollups/targets")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var targets = await db.FirmTargets.AsNoTracking().OrderBy(t => t.PeriodStart).ToListAsync();
        return new OkObjectResult(targets.Select(FirmTargetDto.From).ToList());
    }

    [Function("UpsertFirmTargets")]
    public async Task<IActionResult> UpsertTargets(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "rollups/targets")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertFirmTargetsRequest>();
        if (body?.Targets is null || body.Targets.Count == 0)
        {
            return new BadRequestObjectResult(new { error = "Targets are required." });
        }

        if (body.Targets.Any(t => t.RevenueTarget < 0 || t.NetFeesTarget < 0))
        {
            return new BadRequestObjectResult(new { error = "Targets must be non-negative." });
        }

        var now = DateTime.UtcNow;
        foreach (var entry in body.Targets)
        {
            var period = new DateOnly(entry.PeriodStart.Year, entry.PeriodStart.Month, 1);
            var existing = await db.FirmTargets.FirstOrDefaultAsync(t => t.PeriodStart == period);
            var previous = existing is null ? null : $"{existing.RevenueTarget:C0} / {existing.NetFeesTarget:C0}";
            if (existing is null)
            {
                existing = new FirmTarget { FirmTargetId = Guid.NewGuid(), PeriodStart = period };
                db.FirmTargets.Add(existing);
            }

            if (existing.RevenueTarget == entry.RevenueTarget && existing.NetFeesTarget == entry.NetFeesTarget)
            {
                continue;
            }

            existing.RevenueTarget = entry.RevenueTarget;
            existing.NetFeesTarget = entry.NetFeesTarget;
            existing.UpdatedAtUtc = now;
            existing.UpdatedBy = result.User!.Email;
            audit.Record(nameof(FirmTarget), existing.FirmTargetId.ToString(),
                $"target {period:yyyy-MM}", previous,
                $"{existing.RevenueTarget:C0} / {existing.NetFeesTarget:C0}", result.User!.Oid);
        }

        await db.SaveChangesAsync();
        var targets = await db.FirmTargets.AsNoTracking().OrderBy(t => t.PeriodStart).ToListAsync();
        return new OkObjectResult(targets.Select(FirmTargetDto.From).ToList());
    }

    [Function("DeleteFirmTarget")]
    public async Task<IActionResult> DeleteTarget(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "rollups/targets/{period}")] HttpRequest req, string period)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var periodStart = ParsePeriod(period);
        if (periodStart is null)
        {
            return new BadRequestObjectResult(new { error = "Period must be formatted as YYYY-MM." });
        }

        var existing = await db.FirmTargets.FirstOrDefaultAsync(t => t.PeriodStart == periodStart);
        if (existing is null)
        {
            return new NotFoundObjectResult(new { error = "No target exists for this period." });
        }

        db.FirmTargets.Remove(existing);
        audit.Record(nameof(FirmTarget), existing.FirmTargetId.ToString(),
            $"target {periodStart:yyyy-MM}",
            $"{existing.RevenueTarget:C0} / {existing.NetFeesTarget:C0}", "deleted", result.User!.Oid);
        await db.SaveChangesAsync();

        var targets = await db.FirmTargets.AsNoTracking().OrderBy(t => t.PeriodStart).ToListAsync();
        return new OkObjectResult(targets.Select(FirmTargetDto.From).ToList());
    }

    private static DateOnly? ParsePeriod(string? value) =>
        !string.IsNullOrWhiteSpace(value) && DateOnly.TryParse($"{value}-01", out var parsed)
            ? parsed
            : null;
}
