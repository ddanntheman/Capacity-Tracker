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
/// Billing-period invoicing: client-facing invoice hours table at contract
/// pricing, internal SAP reconciliation, and actual-invoice capture with
/// variance (INV-01..06).
/// </summary>
public class InvoicingFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("GetProjectInvoicing")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/invoicing")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        var periods = AvailablePeriods(plan);
        var current = periods.Where(p => p <= Today()).Cast<DateOnly?>().LastOrDefault();
        var period = ParsePeriod(req.Query["period"]) ?? current ?? periods.FirstOrDefault();
        if (period == default)
        {
            return new BadRequestObjectResult(new { error = "Engagement has no billing periods." });
        }

        return new OkObjectResult(await BuildPeriod(plan, period, periods));
    }

    [Function("CaptureProjectInvoice")]
    public async Task<IActionResult> Capture(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "projects/{id:guid}/invoicing/{period}")] HttpRequest req, Guid id, string period)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var periodStart = ParsePeriod(period);
        if (periodStart is null)
        {
            return new BadRequestObjectResult(new { error = "Period must be formatted as YYYY-MM." });
        }

        var body = await req.ReadFromJsonAsync<CaptureInvoiceRequest>();
        if (body is null || body.InvoicedAmount < 0)
        {
            return new BadRequestObjectResult(new { error = "A non-negative invoiced amount is required." });
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        var record = await db.InvoiceRecords
            .FirstOrDefaultAsync(r => r.ProjectId == id && r.PeriodStart == periodStart);
        var previous = record is null ? null : $"{record.InvoicedAmount:C0} on {record.InvoiceDate:yyyy-MM-dd}";
        if (record is null)
        {
            record = new InvoiceRecord
            {
                InvoiceRecordId = Guid.NewGuid(),
                ProjectId = id,
                PeriodStart = periodStart.Value,
            };
            db.InvoiceRecords.Add(record);
        }

        record.InvoicedAmount = body.InvoicedAmount;
        record.InvoiceDate = body.InvoiceDate;
        record.Notes = body.Notes;
        record.UpdatedAtUtc = DateTime.UtcNow;
        record.UpdatedBy = result.User!.Email;
        audit.Record(nameof(InvoiceRecord), record.InvoiceRecordId.ToString(),
            $"invoice {periodStart:yyyy-MM}", previous,
            $"{record.InvoicedAmount:C0} on {record.InvoiceDate:yyyy-MM-dd}", result.User!.Oid);
        await db.SaveChangesAsync();

        return new OkObjectResult(await BuildPeriod(plan, periodStart.Value, AvailablePeriods(plan)));
    }

    [Function("DeleteProjectInvoice")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "projects/{id:guid}/invoicing/{period}")] HttpRequest req, Guid id, string period)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var periodStart = ParsePeriod(period);
        if (periodStart is null)
        {
            return new BadRequestObjectResult(new { error = "Period must be formatted as YYYY-MM." });
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        var record = await db.InvoiceRecords
            .FirstOrDefaultAsync(r => r.ProjectId == id && r.PeriodStart == periodStart);
        if (record is null)
        {
            return new NotFoundObjectResult(new { error = "No invoice captured for this period." });
        }

        db.InvoiceRecords.Remove(record);
        audit.Record(nameof(InvoiceRecord), record.InvoiceRecordId.ToString(),
            $"invoice {periodStart:yyyy-MM}",
            $"{record.InvoicedAmount:C0} on {record.InvoiceDate:yyyy-MM-dd}", "deleted", result.User!.Oid);
        await db.SaveChangesAsync();

        return new OkObjectResult(await BuildPeriod(plan, periodStart.Value, AvailablePeriods(plan)));
    }

    [Function("GetInvoiceVarianceReport")]
    public async Task<IActionResult> Variance(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/invoicing-variance")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        var periods = AvailablePeriods(plan);
        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var lineIds = plan.LineItems.Select(l => l.PlanLineItemId).ToList();
        var actuals = await db.LineActuals.AsNoTracking()
            .Where(a => lineIds.Contains(a.PlanLineItemId))
            .ToListAsync();
        var setup = await db.RevenueSetups.AsNoTracking().FirstOrDefaultAsync(s => s.ProjectId == plan.ProjectId);
        var feeStructure = setup?.FeeStructure ?? plan.PricingModel;
        var scheduled = await db.RevenuePhases.AsNoTracking()
            .Where(r => r.PricingPlanId == plan.PricingPlanId && r.Layer == RevenueLayer.Forecast)
            .GroupBy(r => r.PeriodStart)
            .Select(g => new { Period = g.Key, Amount = g.Sum(r => r.Amount) })
            .ToDictionaryAsync(g => g.Period, g => g.Amount);
        var records = await db.InvoiceRecords.AsNoTracking()
            .Where(r => r.ProjectId == id)
            .ToListAsync();

        var forecasts = periods
            .Select(p => (p, InvoicingService.Compute(plan, rateCard, actuals, feeStructure,
                setup?.Confirmed ?? false, scheduled.GetValueOrDefault(p), 0, null, p, periods).InvoiceAmount))
            .ToList();

        return new OkObjectResult(InvoiceVarianceService.Compute(id, feeStructure, forecasts, records));
    }

    // ---- Helpers ----

    private async Task<InvoicePeriodDto> BuildPeriod(PricingPlan plan, DateOnly period, List<DateOnly> periods)
    {
        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var lineIds = plan.LineItems.Select(l => l.PlanLineItemId).ToList();
        var actuals = await db.LineActuals.AsNoTracking()
            .Where(a => lineIds.Contains(a.PlanLineItemId))
            .ToListAsync();
        var setup = await db.RevenueSetups.AsNoTracking().FirstOrDefaultAsync(s => s.ProjectId == plan.ProjectId);
        var expenses = await db.RecoverableExpenseEntries.AsNoTracking()
            .Where(r => r.ProjectId == plan.ProjectId && r.PeriodStart == period)
            .SumAsync(r => (decimal?)r.Amount) ?? 0m;
        var record = await db.InvoiceRecords.AsNoTracking()
            .FirstOrDefaultAsync(r => r.ProjectId == plan.ProjectId && r.PeriodStart == period);

        var feeStructure = setup?.FeeStructure ?? plan.PricingModel;
        var scheduledAmount = await db.RevenuePhases.AsNoTracking()
            .Where(r => r.PricingPlanId == plan.PricingPlanId && r.Layer == RevenueLayer.Forecast && r.PeriodStart == period)
            .SumAsync(r => (decimal?)r.Amount) ?? 0m;

        return InvoicingService.Compute(plan, rateCard, actuals, feeStructure, setup?.Confirmed ?? false,
            scheduledAmount, expenses, record, period, periods);
    }

    private Task<PricingPlan?> LoadPlan(Guid projectId) => db.PricingPlans.AsNoTracking()
        .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
        .Include(p => p.LineItems).ThenInclude(l => l.Person)
        .FirstOrDefaultAsync(p => p.ProjectId == projectId);

    private static List<DateOnly> AvailablePeriods(PricingPlan plan)
    {
        var periods = new List<DateOnly>();
        var month = new DateOnly(plan.StartDate.Year, plan.StartDate.Month, 1);
        var last = new DateOnly(plan.EndDate.Year, plan.EndDate.Month, 1);
        for (; month <= last; month = month.AddMonths(1))
        {
            periods.Add(month);
        }

        return periods;
    }

    private static DateOnly Today() => DateOnly.FromDateTime(DateTime.UtcNow);

    private static DateOnly? ParsePeriod(string? value) =>
        !string.IsNullOrWhiteSpace(value) && DateOnly.TryParse($"{value}-01", out var parsed)
            ? parsed
            : null;
}
