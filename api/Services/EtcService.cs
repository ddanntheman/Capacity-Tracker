using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Derives ETC and EAC for a won engagement (ETC-01/02/04, ETC-05 flags).
/// ETC = forecast hours in weeks after the last actualized week, priced at each
/// line's effective fee/cost rate from plan economics. EAC = actuals to date +
/// ETC (or the active manual override). Variances report against the amended
/// contractual position: Original Plan baseline + approved change orders.
/// </summary>
public static class EtcService
{
    /// <summary>Margin-erosion tolerance in percentage points below plan margin (ETC-05).</summary>
    public const decimal MarginTolerancePts = 5m;

    public static EtcSummaryDto Compute(
        PricingPlan plan,
        IReadOnlyList<RateCardEntry> rateCard,
        IReadOnlyList<LineActual> actuals,
        IReadOnlyList<ChangeOrder> changeOrders,
        EtcOverride? activeOverride,
        decimal baselineHours,
        decimal originalTcv,
        DateOnly currentWeek)
    {
        var economics = PlanEconomicsService.Compute(plan, rateCard);
        var lineEconomics = economics.Lines.ToDictionary(l => l.PlanLineItemId);
        var actualsByLine = actuals.GroupBy(a => a.PlanLineItemId)
            .ToDictionary(g => g.Key, g => g.ToList());

        // Weeks strictly after the last actualized week are "remaining"; before
        // any actuals are entered, everything from the current week on remains.
        var lastActualWeek = actuals.Count > 0 ? actuals.Max(a => a.WeekStart) : currentWeek.AddDays(-7);

        decimal actualHours = 0, actualFees = 0, actualCost = 0, actualHardCost = 0;
        decimal etcHours = 0, etcFees = 0, etcCost = 0;
        var lines = new List<EtcLineDto>();

        foreach (var line in plan.LineItems.OrderBy(l => l.SortOrder).ThenBy(l => l.RoleTitle))
        {
            lineEconomics.TryGetValue(line.PlanLineItemId, out var econ);
            var forecastHours = line.WeekHours.Sum(w => w.Hours);
            var feeRate = econ is { TotalHours: > 0 } ? econ.Fees / econ.TotalHours : 0m;
            var costRate = econ is { TotalHours: > 0 } ? econ.Cost / econ.TotalHours : 0m;

            decimal lineActualHours = 0, lineHardCost = 0;
            if (actualsByLine.TryGetValue(line.PlanLineItemId, out var lineActuals))
            {
                lineActualHours = lineActuals.Sum(a => a.Hours);
                lineHardCost = lineActuals.Sum(a => a.HardCost);
            }

            var lineEtcHours = line.WeekHours
                .Where(w => w.WeekStart > lastActualWeek)
                .Sum(w => w.Hours);

            actualHours += lineActualHours;
            actualFees += lineActualHours * feeRate;
            actualCost += lineActualHours * costRate + lineHardCost;
            actualHardCost += lineHardCost;
            etcHours += lineEtcHours;
            etcFees += lineEtcHours * feeRate;
            etcCost += lineEtcHours * costRate;

            var label = line.Person?.DisplayName ?? line.RoleTitle;
            lines.Add(new EtcLineDto(
                line.PlanLineItemId,
                label,
                line.Organization.ToString().ToLowerInvariant(),
                forecastHours,
                lineActualHours,
                lineHardCost,
                lineEtcHours,
                lineActualHours + lineEtcHours));
        }

        var effectiveEtcHours = activeOverride?.Hours ?? etcHours;
        var effectiveEtcFees = activeOverride?.Fees ?? etcFees;

        var eacHours = actualHours + effectiveEtcHours;
        var eacFees = actualFees + effectiveEtcFees + plan.TechnologyFees;
        // Override affects fees, not cost; EAC cost stays derived.
        var eacCost = actualCost + etcCost;
        decimal? eacMarginPct = eacFees != 0 ? Math.Round((eacFees - eacCost) / eacFees * 100, 2) : null;

        var approved = changeOrders.Where(c => c.Status == ChangeOrderStatus.Approved).ToList();
        var coHours = approved.Sum(c => c.DeltaHours);
        var coFees = approved.Sum(c => c.DeltaFees);
        var amendedHours = baselineHours + coHours;
        var amendedTcv = originalTcv + coFees;

        var hoursOverrun = amendedHours > 0 && eacHours > amendedHours;
        var feeOverrun = amendedTcv > 0 && eacFees > amendedTcv;
        var marginErosion = economics.JobMarginPct is decimal planMargin
            && eacMarginPct is decimal eacMargin
            && eacMargin < planMargin - MarginTolerancePts;

        return new EtcSummaryDto(
            Math.Round(actualHours, 2),
            Math.Round(actualFees, 2),
            Math.Round(actualCost, 2),
            Math.Round(etcHours, 2),
            Math.Round(etcFees, 2),
            Math.Round(etcCost, 2),
            activeOverride?.Hours,
            activeOverride?.Fees,
            Math.Round(eacHours, 2),
            Math.Round(eacFees, 2),
            Math.Round(eacCost, 2),
            eacMarginPct,
            baselineHours,
            originalTcv,
            coHours,
            coFees,
            amendedHours,
            amendedTcv,
            Math.Round(eacHours - amendedHours, 2),
            Math.Round(eacFees - amendedTcv, 2),
            hoursOverrun,
            feeOverrun,
            marginErosion,
            lines);
    }
}
