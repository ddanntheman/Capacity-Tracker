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
/// Firm-wide delivery health across Closed/Won engagements: stale actuals
/// (DT-07), zero-revenue accrual violations (DT-05), and EAC-vs-baseline
/// alerts surfaced to project leads, MD owners, and leadership (ETC-05).
/// </summary>
public class DeliveryHealthFunctions(CapacityDbContext db, RequestAuthorizer auth)
{
    /// <summary>Actuals older than this many days trigger the stale flag (DT-07).</summary>
    private const int StaleActualsDays = 14;

    [Function("GetDeliveryHealth")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "delivery/health")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plans = await db.PricingPlans.AsNoTracking()
            .Include(p => p.Project)
            .Include(p => p.MdOwner)
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .Where(p => p.Status == PlanStatus.ClosedWon)
            .ToListAsync();
        if (plans.Count == 0)
        {
            return new OkObjectResult(new List<DeliveryHealthDto>());
        }

        var projectIds = plans.Select(p => p.ProjectId).ToList();
        var planIds = plans.Select(p => p.PricingPlanId).ToList();
        var lineIds = plans.SelectMany(p => p.LineItems).Select(l => l.PlanLineItemId).ToList();

        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var actuals = await db.LineActuals.AsNoTracking()
            .Where(a => lineIds.Contains(a.PlanLineItemId))
            .ToListAsync();
        var changeOrders = await db.ChangeOrders.AsNoTracking()
            .Where(c => projectIds.Contains(c.ProjectId))
            .ToListAsync();
        var overrides = await db.EtcOverrides.AsNoTracking()
            .Where(o => projectIds.Contains(o.ProjectId) && o.ClearedAtUtc == null)
            .ToListAsync();
        var baselineHours = await db.ProjectBaselineLines.AsNoTracking()
            .Where(l => projectIds.Contains(l.ProjectId))
            .GroupBy(l => l.ProjectId)
            .Select(g => new { ProjectId = g.Key, Hours = g.Sum(l => l.Hours) })
            .ToDictionaryAsync(x => x.ProjectId, x => x.Hours);
        var phases = await db.RevenuePhases.AsNoTracking()
            .Where(r => planIds.Contains(r.PricingPlanId))
            .ToListAsync();

        var lineToPlan = plans
            .SelectMany(p => p.LineItems.Select(l => (l.PlanLineItemId, p.PricingPlanId)))
            .ToDictionary(x => x.PlanLineItemId, x => x.PricingPlanId);
        var actualsByPlan = actuals
            .GroupBy(a => lineToPlan[a.PlanLineItemId])
            .ToDictionary(g => g.Key, g => g.ToList());
        var changeOrdersByProject = changeOrders.GroupBy(c => c.ProjectId)
            .ToDictionary(g => g.Key, g => g.ToList());
        var overridesByProject = overrides
            .GroupBy(o => o.ProjectId)
            .ToDictionary(g => g.Key, g => g.OrderByDescending(o => o.CreatedAtUtc).First());
        var phasesByPlan = phases.GroupBy(r => r.PricingPlanId)
            .ToDictionary(g => g.Key, g => g.ToList());

        var now = DateTime.UtcNow;
        var today = DateOnly.FromDateTime(now);
        var currentMonth = new DateOnly(today.Year, today.Month, 1);
        var currentWeek = WeekHelper.CurrentWeekStart();

        var rows = new List<DeliveryHealthDto>();
        foreach (var plan in plans.OrderBy(p => p.Project?.ClientName).ThenBy(p => p.Project?.ProjectName))
        {
            actualsByPlan.TryGetValue(plan.PricingPlanId, out var planActuals);
            planActuals ??= [];
            changeOrdersByProject.TryGetValue(plan.ProjectId, out var planChangeOrders);
            overridesByProject.TryGetValue(plan.ProjectId, out var activeOverride);
            phasesByPlan.TryGetValue(plan.PricingPlanId, out var planPhases);
            planPhases ??= [];

            var originalTcv = planPhases
                .Where(r => r.Layer == RevenueLayer.OriginalPlan)
                .Sum(r => r.Amount);
            var etc = EtcService.Compute(plan, rateCard, planActuals, planChangeOrders ?? [],
                activeOverride, baselineHours.GetValueOrDefault(plan.ProjectId), originalTcv, currentWeek);

            var lastEntry = planActuals.Count > 0 ? planActuals.Max(a => a.EnteredAtUtc) : (DateTime?)null;
            var inFlight = plan.StartDate <= today;
            var stale = inFlight
                && (lastEntry is null || lastEntry < now.AddDays(-StaleActualsDays));

            // DT-05: past/current months in the active window with zero forecast revenue.
            var forecastByMonth = planPhases
                .Where(r => r.Layer == RevenueLayer.Forecast)
                .GroupBy(r => r.PeriodStart)
                .ToDictionary(g => g.Key, g => g.Sum(r => r.Amount));
            var zeroMonths = new List<DateOnly>();
            var month = new DateOnly(plan.StartDate.Year, plan.StartDate.Month, 1);
            var last = new DateOnly(plan.EndDate.Year, plan.EndDate.Month, 1);
            for (; month <= last; month = month.AddMonths(1))
            {
                if (!forecastByMonth.TryGetValue(month, out var amount) || amount == 0)
                {
                    zeroMonths.Add(month);
                }
            }

            var pastZeroMonths = zeroMonths.Count(m => m <= currentMonth);

            var status = etc.HoursOverrun || etc.FeeOverrun || etc.MarginErosion
                ? "red"
                : stale || pastZeroMonths > 0
                    ? "yellow"
                    : "green";

            rows.Add(new DeliveryHealthDto(
                plan.ProjectId,
                plan.PricingPlanId,
                plan.Project?.ClientName ?? "",
                plan.Project?.ProjectName ?? "",
                plan.MdOwner?.DisplayName,
                plan.Practice,
                plan.StartDate,
                plan.EndDate,
                status,
                stale,
                lastEntry,
                zeroMonths,
                pastZeroMonths,
                etc.EacHours,
                etc.AmendedBaselineHours,
                etc.HoursVariance,
                etc.EacFees,
                etc.AmendedTcv,
                etc.FeesVariance,
                etc.EacMarginPct,
                etc.HoursOverrun,
                etc.FeeOverrun,
                etc.MarginErosion,
                activeOverride is not null));
        }

        return new OkObjectResult(rows);
    }
}
