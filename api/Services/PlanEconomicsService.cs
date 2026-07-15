using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Computes week-by-week and total deal economics for a pricing plan from its
/// hours grid, the effective-dated rate card, and the plan's pricing model
/// (PR-08/09), plus the Andersen/SAP standard-rate metrics view (PR-10) and
/// inline validation errors (PR-11).
/// </summary>
public static class PlanEconomicsService
{
    public static PlanEconomicsDto Compute(PricingPlan plan, IReadOnlyList<RateCardEntry> rateCard)
    {
        var errors = new List<string>();
        if (plan.EndDate < plan.StartDate)
        {
            errors.Add("End date is before start date.");
        }

        var feeBased = plan.PricingModel is PricingModel.FixedFee or PricingModel.Milestone or PricingModel.Outcome;
        if (plan.PricingModel == PricingModel.BlendedRate && (plan.BlendedRate is null or <= 0))
        {
            errors.Add("Blended rate pricing requires a non-zero blended rate.");
        }

        if (feeBased && (plan.FixedFee is null or <= 0))
        {
            errors.Add($"{plan.PricingModel} pricing requires a non-zero total fee.");
        }

        var windowStart = WeekHelper.WeekStartOf(plan.StartDate);
        var windowEnd = WeekHelper.WeekStartOf(plan.EndDate);

        var lines = new List<PlanLineEconomicsDto>();
        var weekly = new SortedDictionary<DateOnly, (decimal Hours, decimal Fees, decimal Cost)>();
        decimal totalHours = 0, hourlyFees = 0, internalCost = 0, subCost = 0, grossFeesAtStandard = 0, billableHours = 0;

        foreach (var line in plan.LineItems.OrderBy(l => l.SortOrder).ThenBy(l => l.RoleTitle))
        {
            var label = line.Person?.DisplayName ?? line.RoleTitle;
            decimal lineHours = 0, lineFees = 0, lineCost = 0;
            decimal? sampleCostRate = null, sampleClientRate = null;

            var isInternal = line.Organization == LineItemOrganization.Internal;
            if (!isInternal && line.CostRateOverride is null)
            {
                errors.Add($"{label}: subcontractor line is missing a cost rate.");
            }

            foreach (var wh in line.WeekHours.Where(w => w.Hours > 0).OrderBy(w => w.WeekStart))
            {
                if (wh.WeekStart < windowStart || wh.WeekStart > windowEnd)
                {
                    errors.Add($"{label}: hours entered for week {wh.WeekStart:yyyy-MM-dd} outside the engagement window.");
                }

                var standard = isInternal ? Resolve(rateCard, line.Rank, line.Geography, wh.WeekStart) : null;
                if (isInternal && standard is null)
                {
                    errors.Add($"{label}: no rate card match for {line.Rank ?? "?"} / {line.Geography ?? "?"} effective {wh.WeekStart:yyyy-MM-dd}.");
                }

                var costRate = isInternal ? (line.CostRateOverride ?? standard?.CostRate ?? 0) : (line.CostRateOverride ?? 0);
                var clientRate = plan.PricingModel switch
                {
                    PricingModel.BlendedRate => plan.BlendedRate ?? 0,
                    PricingModel.RoleBased => line.ClientRate ?? line.BillRateOverride ?? standard?.BillRate ?? 0,
                    _ => 0m,
                };
                if (plan.PricingModel == PricingModel.RoleBased && clientRate <= 0)
                {
                    errors.Add($"{label}: client rate is zero for week {wh.WeekStart:yyyy-MM-dd}.");
                }

                sampleCostRate ??= costRate;
                sampleClientRate ??= feeBased ? null : clientRate;

                var fees = feeBased ? 0 : wh.Hours * clientRate;
                var cost = wh.Hours * costRate;
                lineHours += wh.Hours;
                lineFees += fees;
                lineCost += cost;

                if (isInternal)
                {
                    billableHours += wh.Hours;
                    grossFeesAtStandard += wh.Hours * (standard?.BillRate ?? 0);
                }

                weekly[wh.WeekStart] = weekly.TryGetValue(wh.WeekStart, out var w)
                    ? (w.Hours + wh.Hours, w.Fees + fees, w.Cost + cost)
                    : (wh.Hours, fees, cost);
            }

            totalHours += lineHours;
            hourlyFees += lineFees;
            if (isInternal)
            {
                internalCost += lineCost;
            }
            else
            {
                subCost += lineCost;
            }

            lines.Add(new PlanLineEconomicsDto(
                line.PlanLineItemId, line.RoleTitle, line.Person?.DisplayName,
                line.Organization.ToString().ToLowerInvariant(),
                lineHours, sampleCostRate, sampleClientRate, lineFees, lineCost, lineFees - lineCost));
        }

        // Fee-based plans spread the total fee across weeks proportional to hours.
        var laborFees = feeBased ? (plan.FixedFee ?? 0) : hourlyFees;
        if (feeBased && totalHours > 0)
        {
            var perHour = laborFees / totalHours;
            foreach (var key in weekly.Keys.ToList())
            {
                var (Hours, Fees, Cost) = weekly[key];
                weekly[key] = (Hours, Hours * perHour, Cost);
            }

            lines = lines
                .Select(l => l with { Fees = l.TotalHours * perHour, Margin = l.TotalHours * perHour - l.Cost })
                .ToList();
        }

        var weeks = new List<PlanWeekEconomicsDto>();
        decimal cumHours = 0;
        foreach (var (weekStart, w) in weekly)
        {
            cumHours += w.Hours;
            weeks.Add(new PlanWeekEconomicsDto(weekStart, w.Hours, cumHours, w.Fees, w.Cost, w.Fees - w.Cost));
        }

        var totalCost = internalCost + subCost;
        var tcv = laborFees + plan.TechnologyFees;
        var grossProfit = laborFees - totalCost;
        var netFees = laborFees - plan.RecoverableExpenses;
        return new PlanEconomicsDto(
            TotalHours: totalHours,
            LaborFees: laborFees,
            TechnologyFees: plan.TechnologyFees,
            Tcv: tcv,
            JobRph: totalHours > 0 ? Math.Round(laborFees / totalHours, 2) : null,
            InternalCost: internalCost,
            SubcontractorCost: subCost,
            GrossProfit: grossProfit,
            JobMarginPct: laborFees > 0 ? Math.Round(grossProfit / laborFees * 100, 1) : null,
            GrossFeesAtStandard: grossFeesAtStandard,
            RecoverableExpenses: plan.RecoverableExpenses,
            NetFees: netFees,
            FeeAdjustment: netFees - grossFeesAtStandard,
            RecoveryPct: grossFeesAtStandard > 0 ? Math.Round(netFees / grossFeesAtStandard * 100, 1) : null,
            BillableHours: billableHours,
            InternalRph: billableHours > 0 ? Math.Round(netFees / billableHours, 2) : null,
            InternalMarginPct: netFees > 0 ? Math.Round((netFees - internalCost) / netFees * 100, 1) : null,
            Lines: lines,
            Weeks: weeks,
            ValidationErrors: errors.Distinct().ToList());
    }

    /// <summary>Latest entry for rank/geography effective on or before the week.</summary>
    public static RateCardEntry? Resolve(IReadOnlyList<RateCardEntry> rateCard, string? rank, string? geography, DateOnly week) =>
        rateCard
            .Where(r => string.Equals(r.Rank, rank, StringComparison.OrdinalIgnoreCase)
                && string.Equals(r.Geography, geography, StringComparison.OrdinalIgnoreCase)
                && r.EffectiveFrom <= week)
            .OrderByDescending(r => r.EffectiveFrom)
            .FirstOrDefault();
}
