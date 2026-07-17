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
/// Delivery tracking for won engagements: actuals by resource/week, WIP report
/// upload, change orders, recoverable expenses, and ETC/EAC with manual
/// override (DT-01..07, ETC-01..05).
/// </summary>
public class DeliveryFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    /// <summary>Actuals older than this many days trigger the stale flag (DT-07).</summary>
    private const int StaleActualsDays = 14;

    [Function("GetProjectDelivery")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/delivery")] HttpRequest req, Guid id)
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

        return new OkObjectResult(await BuildDto(plan));
    }

    [Function("SaveProjectActuals")]
    public async Task<IActionResult> SaveActuals(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "projects/{id:guid}/delivery/actuals")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<SaveLineActualsRequest>();
        if (body?.Entries is null || body.Entries.Count == 0)
        {
            return new BadRequestObjectResult(new { error = "Entries are required." });
        }

        if (body.Entries.Any(e => e.Hours < 0 || e.Hours > 168 || e.HardCost is < 0))
        {
            return new BadRequestObjectResult(new { error = "Hours must be between 0 and 168 and hard cost non-negative." });
        }

        var plan = await LoadPlan(id, track: true);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        var lineIds = plan.LineItems.Select(l => l.PlanLineItemId).ToHashSet();
        if (body.Entries.Any(e => !lineIds.Contains(e.PlanLineItemId)))
        {
            return new BadRequestObjectResult(new { error = "Entry references a line item outside this engagement." });
        }

        await UpsertActuals(body.Entries.Select(e => (
            e.PlanLineItemId,
            WeekHelper.WeekStartOf(e.WeekStart),
            e.Hours,
            e.HardCost ?? 0m,
            ActualSource.Manual)), result.User!);

        await db.SaveChangesAsync();
        return new OkObjectResult(await BuildDto(await LoadPlan(id) ?? plan));
    }

    [Function("UploadWipReport")]
    public async Task<IActionResult> UploadWip(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/delivery/wip")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<WipUploadRequest>();
        if (string.IsNullOrWhiteSpace(body?.Csv))
        {
            return new BadRequestObjectResult(new { error = "Csv content is required." });
        }

        var plan = await LoadPlan(id, track: true);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan found for this project." });
        }

        // Rows map to team line items by resource name (named person or role
        // title); unmatched rows are surfaced for EM review (DT-02a).
        var byLabel = new Dictionary<string, PlanLineItem>(StringComparer.OrdinalIgnoreCase);
        foreach (var line in plan.LineItems)
        {
            if (line.Person?.DisplayName is string name)
            {
                byLabel[name.Trim()] = line;
            }

            byLabel.TryAdd(line.RoleTitle.Trim(), line);
        }

        var unmatched = new List<string>();
        var entries = new List<(Guid, DateOnly, decimal, decimal, ActualSource)>();
        var rows = body.Csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        foreach (var (row, index) in rows.Select((r, i) => (r, i)))
        {
            var cells = row.Split(',', StringSplitOptions.TrimEntries);
            if (index == 0 && cells.Length >= 3 && !DateOnly.TryParse(cells[1], out _))
            {
                continue; // header row
            }

            if (cells.Length < 3
                || !DateOnly.TryParse(cells[1], out var week)
                || !decimal.TryParse(cells[2], out var hours)
                || hours < 0)
            {
                unmatched.Add(row);
                continue;
            }

            var hardCost = cells.Length >= 4 && decimal.TryParse(cells[3], out var cost) ? cost : 0m;
            if (!byLabel.TryGetValue(cells[0], out var line))
            {
                unmatched.Add(row);
                continue;
            }

            entries.Add((line.PlanLineItemId, WeekHelper.WeekStartOf(week), hours, hardCost, ActualSource.WipUpload));
        }

        await UpsertActuals(entries, result.User!);
        await db.SaveChangesAsync();
        return new OkObjectResult(new WipUploadResultDto(entries.Count, unmatched.Count, unmatched));
    }

    [Function("CreateChangeOrder")]
    public async Task<IActionResult> CreateChangeOrder(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/change-orders")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertChangeOrderRequest>();
        if (string.IsNullOrWhiteSpace(body?.Title))
        {
            return new BadRequestObjectResult(new { error = "Title is required." });
        }

        if (!await db.Projects.AnyAsync(p => p.ProjectId == id))
        {
            return new NotFoundResult();
        }

        var order = new ChangeOrder
        {
            ChangeOrderId = Guid.NewGuid(),
            ProjectId = id,
            Title = body.Title.Trim(),
            Notes = body.Notes,
            DeltaHours = body.DeltaHours,
            DeltaFees = body.DeltaFees,
            EngagementDocumentId = body.EngagementDocumentId,
            Status = ChangeOrderStatus.Draft,
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = result.User!.Email,
        };
        db.ChangeOrders.Add(order);
        audit.Record(nameof(ChangeOrder), order.ChangeOrderId.ToString(), "created", null,
            $"{order.Title} ({order.DeltaHours:0.##}h / {order.DeltaFees:C0})", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ChangeOrderDto.From(order));
    }

    [Function("ApproveChangeOrder")]
    public async Task<IActionResult> ApproveChangeOrder(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/change-orders/{orderId:guid}/approve")] HttpRequest req, Guid id, Guid orderId)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var order = await db.ChangeOrders.FirstOrDefaultAsync(c => c.ChangeOrderId == orderId && c.ProjectId == id);
        if (order is null)
        {
            return new NotFoundResult();
        }

        if (order.Status == ChangeOrderStatus.Approved)
        {
            return new BadRequestObjectResult(new { error = "Change order is already approved." });
        }

        order.Status = ChangeOrderStatus.Approved;
        order.ApprovedAtUtc = DateTime.UtcNow;
        order.ApprovedBy = result.User!.Email;
        audit.Record(nameof(ChangeOrder), orderId.ToString(), "status", "draft", "approved", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ChangeOrderDto.From(order));
    }

    [Function("DeleteChangeOrder")]
    public async Task<IActionResult> DeleteChangeOrder(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "projects/{id:guid}/change-orders/{orderId:guid}")] HttpRequest req, Guid id, Guid orderId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var order = await db.ChangeOrders.FirstOrDefaultAsync(c => c.ChangeOrderId == orderId && c.ProjectId == id);
        if (order is null)
        {
            return new NotFoundResult();
        }

        if (order.Status == ChangeOrderStatus.Approved)
        {
            return new BadRequestObjectResult(new { error = "An approved change order cannot be deleted; it is part of the amended baseline." });
        }

        db.ChangeOrders.Remove(order);
        audit.Record(nameof(ChangeOrder), orderId.ToString(), "deleted", order.Title, null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    [Function("CreateRecoverableExpense")]
    public async Task<IActionResult> CreateExpense(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/expenses")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertRecoverableExpenseRequest>();
        if (string.IsNullOrWhiteSpace(body?.Vendor) || body.PeriodStart == default)
        {
            return new BadRequestObjectResult(new { error = "Vendor and PeriodStart are required." });
        }

        if (!await db.Projects.AnyAsync(p => p.ProjectId == id))
        {
            return new NotFoundResult();
        }

        var entry = new RecoverableExpenseEntry
        {
            RecoverableExpenseEntryId = Guid.NewGuid(),
            ProjectId = id,
            PeriodStart = new DateOnly(body.PeriodStart.Year, body.PeriodStart.Month, 1),
            Vendor = body.Vendor.Trim(),
            Amount = body.Amount,
            Notes = body.Notes,
            EnteredAtUtc = DateTime.UtcNow,
            EnteredBy = result.User!.Email,
        };
        db.RecoverableExpenseEntries.Add(entry);
        audit.Record(nameof(RecoverableExpenseEntry), entry.RecoverableExpenseEntryId.ToString(), "created",
            null, $"{entry.Vendor} {entry.Amount:C0} ({entry.PeriodStart:yyyy-MM})", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(RecoverableExpenseDto.From(entry));
    }

    [Function("DeleteRecoverableExpense")]
    public async Task<IActionResult> DeleteExpense(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "projects/{id:guid}/expenses/{expenseId:guid}")] HttpRequest req, Guid id, Guid expenseId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var entry = await db.RecoverableExpenseEntries
            .FirstOrDefaultAsync(r => r.RecoverableExpenseEntryId == expenseId && r.ProjectId == id);
        if (entry is null)
        {
            return new NotFoundResult();
        }

        db.RecoverableExpenseEntries.Remove(entry);
        audit.Record(nameof(RecoverableExpenseEntry), expenseId.ToString(), "deleted",
            $"{entry.Vendor} {entry.Amount:C0}", null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    [Function("SetEtcOverride")]
    public async Task<IActionResult> SetOverride(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "projects/{id:guid}/etc-override")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<SetEtcOverrideRequest>();
        if (string.IsNullOrWhiteSpace(body?.Justification))
        {
            return new BadRequestObjectResult(new { error = "A justification note is required for a manual ETC override." });
        }

        if (body.Hours < 0 || body.Fees < 0)
        {
            return new BadRequestObjectResult(new { error = "Override hours and fees must be non-negative." });
        }

        if (!await db.Projects.AnyAsync(p => p.ProjectId == id))
        {
            return new NotFoundResult();
        }

        var now = DateTime.UtcNow;
        var previous = await ActiveOverride(id);
        if (previous is not null)
        {
            previous.ClearedAtUtc = now;
            previous.ClearedBy = result.User!.Email;
        }

        var entry = new EtcOverride
        {
            EtcOverrideId = Guid.NewGuid(),
            ProjectId = id,
            Hours = body.Hours,
            Fees = body.Fees,
            Justification = body.Justification.Trim(),
            CreatedAtUtc = now,
            CreatedBy = result.User!.Email,
        };
        db.EtcOverrides.Add(entry);
        audit.Record(nameof(EtcOverride), entry.EtcOverrideId.ToString(), "set",
            previous is null ? null : $"{previous.Hours:0.##}h / {previous.Fees:C0}",
            $"{entry.Hours:0.##}h / {entry.Fees:C0}: {entry.Justification}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(EtcOverrideDto.From(entry));
    }

    [Function("ClearEtcOverride")]
    public async Task<IActionResult> ClearOverride(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "projects/{id:guid}/etc-override")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var active = await ActiveOverride(id);
        if (active is null)
        {
            return new NotFoundObjectResult(new { error = "No active ETC override." });
        }

        active.ClearedAtUtc = DateTime.UtcNow;
        active.ClearedBy = result.User!.Email;
        audit.Record(nameof(EtcOverride), active.EtcOverrideId.ToString(), "cleared",
            $"{active.Hours:0.##}h / {active.Fees:C0}", null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    // ---- Helpers ----

    private async Task UpsertActuals(
        IEnumerable<(Guid LineId, DateOnly WeekStart, decimal Hours, decimal HardCost, ActualSource Source)> entries,
        CurrentUser user)
    {
        var list = entries.ToList();
        var lineIds = list.Select(e => e.LineId).Distinct().ToList();
        var existing = await db.LineActuals
            .Where(a => lineIds.Contains(a.PlanLineItemId))
            .ToListAsync();
        var byKey = existing.ToDictionary(a => (a.PlanLineItemId, a.WeekStart));
        var now = DateTime.UtcNow;

        foreach (var (LineId, WeekStart, Hours, HardCost, Source) in list)
        {
            if (byKey.TryGetValue((LineId, WeekStart), out var row))
            {
                if (row.Hours == Hours && row.HardCost == HardCost)
                {
                    continue;
                }

                audit.Record(nameof(LineActual), row.LineActualId.ToString(),
                    $"actuals {WeekStart:yyyy-MM-dd}",
                    $"{row.Hours:0.##}h / {row.HardCost:C0}",
                    $"{Hours:0.##}h / {HardCost:C0}", user.Oid);
                row.Hours = Hours;
                row.HardCost = HardCost;
                row.Source = Source;
                row.EnteredAtUtc = now;
                row.EnteredBy = user.Email;
            }
            else
            {
                var created = new LineActual
                {
                    LineActualId = Guid.NewGuid(),
                    PlanLineItemId = LineId,
                    WeekStart = WeekStart,
                    Hours = Hours,
                    HardCost = HardCost,
                    Source = Source,
                    EnteredAtUtc = now,
                    EnteredBy = user.Email,
                };
                db.LineActuals.Add(created);
                audit.Record(nameof(LineActual), created.LineActualId.ToString(),
                    $"actuals {WeekStart:yyyy-MM-dd}", null,
                    $"{Hours:0.##}h / {HardCost:C0}", user.Oid);
            }
        }
    }

    private Task<PricingPlan?> LoadPlan(Guid projectId, bool track = false)
    {
        var query = db.PricingPlans
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .Where(p => p.ProjectId == projectId);
        return (track ? query : query.AsNoTracking()).FirstOrDefaultAsync();
    }

    private Task<EtcOverride?> ActiveOverride(Guid projectId) => db.EtcOverrides
        .Where(o => o.ProjectId == projectId && o.ClearedAtUtc == null)
        .OrderByDescending(o => o.CreatedAtUtc)
        .FirstOrDefaultAsync();

    private async Task<ProjectDeliveryDto> BuildDto(PricingPlan plan)
    {
        var lineIds = plan.LineItems.Select(l => l.PlanLineItemId).ToList();
        var actuals = await db.LineActuals.AsNoTracking()
            .Where(a => lineIds.Contains(a.PlanLineItemId))
            .ToListAsync();
        var changeOrders = await db.ChangeOrders.AsNoTracking()
            .Where(c => c.ProjectId == plan.ProjectId)
            .OrderBy(c => c.CreatedAtUtc)
            .ToListAsync();
        var expenses = await db.RecoverableExpenseEntries.AsNoTracking()
            .Where(r => r.ProjectId == plan.ProjectId)
            .OrderBy(r => r.PeriodStart)
            .ToListAsync();
        var activeOverride = await ActiveOverride(plan.ProjectId);
        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var baselineHours = await db.ProjectBaselineLines
            .Where(l => l.ProjectId == plan.ProjectId)
            .SumAsync(l => (decimal?)l.Hours) ?? 0m;
        var originalTcv = await db.RevenuePhases
            .Where(r => r.PricingPlanId == plan.PricingPlanId && r.Layer == RevenueLayer.OriginalPlan)
            .SumAsync(r => (decimal?)r.Amount) ?? 0m;

        var currentWeek = WeekHelper.CurrentWeekStart();
        var etc = EtcService.Compute(plan, rateCard, actuals, changeOrders, activeOverride,
            baselineHours, originalTcv, currentWeek);

        var actualsByLine = actuals.GroupBy(a => a.PlanLineItemId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(a => a.WeekStart));

        var lines = plan.LineItems
            .OrderBy(l => l.SortOrder).ThenBy(l => l.RoleTitle)
            .Select(line =>
            {
                actualsByLine.TryGetValue(line.PlanLineItemId, out var byWeek);
                var weekStarts = line.WeekHours.Select(w => w.WeekStart)
                    .Concat(byWeek?.Keys ?? Enumerable.Empty<DateOnly>())
                    .Distinct()
                    .OrderBy(w => w);
                var forecastByWeek = line.WeekHours.ToDictionary(w => w.WeekStart, w => w.Hours);
                var weeks = weekStarts.Select(week =>
                {
                    var actual = byWeek is not null && byWeek.TryGetValue(week, out var a) ? a : null;
                    return new DeliveryWeekDto(
                        week,
                        forecastByWeek.TryGetValue(week, out var f) ? f : 0m,
                        actual?.Hours,
                        actual?.HardCost,
                        actual?.Source.ToString().ToLowerInvariant());
                }).ToList();
                return new DeliveryLineDto(
                    line.PlanLineItemId,
                    line.Person?.DisplayName ?? line.RoleTitle,
                    line.Organization.ToString().ToLowerInvariant(),
                    line.PersonId is not null,
                    weeks);
            })
            .ToList();

        // DT-07: a won, in-flight engagement is stale when no actuals were
        // entered within the cadence window.
        var lastEntry = actuals.Count > 0 ? actuals.Max(a => a.EnteredAtUtc) : (DateTime?)null;
        var inFlight = plan.Status == PlanStatus.ClosedWon
            && plan.StartDate <= DateOnly.FromDateTime(DateTime.UtcNow);
        var stale = inFlight
            && (lastEntry is null || lastEntry < DateTime.UtcNow.AddDays(-StaleActualsDays));

        // DT-05: months in a won engagement's forecast with zero recognized revenue.
        var zeroMonths = new List<DateOnly>();
        if (plan.Status == PlanStatus.ClosedWon)
        {
            var forecast = await db.RevenuePhases.AsNoTracking()
                .Where(r => r.PricingPlanId == plan.PricingPlanId && r.Layer == RevenueLayer.Forecast)
                .ToListAsync();
            var byMonth = forecast.GroupBy(r => r.PeriodStart)
                .ToDictionary(g => g.Key, g => g.Sum(r => r.Amount));
            var month = new DateOnly(plan.StartDate.Year, plan.StartDate.Month, 1);
            var last = new DateOnly(plan.EndDate.Year, plan.EndDate.Month, 1);
            for (; month <= last; month = month.AddMonths(1))
            {
                if (!byMonth.TryGetValue(month, out var amount) || amount == 0)
                {
                    zeroMonths.Add(month);
                }
            }
        }

        return new ProjectDeliveryDto(
            plan.ProjectId,
            plan.PricingPlanId,
            PricingPlansFunctions.StatusName(plan.Status),
            plan.StartDate,
            plan.EndDate,
            lines,
            etc,
            activeOverride is null ? null : EtcOverrideDto.From(activeOverride),
            [.. changeOrders.Select(ChangeOrderDto.From)],
            [.. expenses.Select(RecoverableExpenseDto.From)],
            stale,
            lastEntry,
            zeroMonths);
    }
}
