using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Proposes monthly revenue phasing for a pricing plan (RS-05/06). T&amp;M and
/// role-based plans phase from weekly fees; fee-based plans have their fee
/// already spread across weeks proportional to hours by the economics service.
/// Technology/other fees are spread evenly across the engagement months, and
/// the final month absorbs rounding so the phasing sums exactly to TCV.
/// </summary>
public static class RevenuePhasingService
{
    public static List<RevenuePhaseDto> ProposeMonthly(PricingPlan plan, PlanEconomicsDto economics)
    {
        var months = MonthsBetween(plan.StartDate, plan.EndDate);
        if (months.Count == 0)
        {
            return [];
        }

        var byMonth = months.ToDictionary(m => m, _ => 0m);
        foreach (var week in economics.Weeks)
        {
            var month = new DateOnly(week.WeekStart.Year, week.WeekStart.Month, 1);
            if (!byMonth.ContainsKey(month))
            {
                // Weeks straddling the window edge phase into the nearest engagement month.
                month = month < months[0] ? months[0] : months[^1];
            }

            byMonth[month] += week.Fees;
        }

        // If there are no weekly fees at all (e.g. fee-based with no hours yet),
        // spread the TCV evenly across the months.
        if (byMonth.Values.All(v => v == 0) && economics.Tcv > 0)
        {
            var even = Math.Round(economics.Tcv / months.Count, 2);
            foreach (var m in months)
            {
                byMonth[m] = even;
            }
        }
        else if (economics.TechnologyFees != 0)
        {
            var perMonth = Math.Round(economics.TechnologyFees / months.Count, 2);
            foreach (var m in months)
            {
                byMonth[m] += perMonth;
            }
        }

        // Round each month first, then absorb the residual in the final month
        // so the phasing sums exactly to TCV (CW-03).
        foreach (var m in months)
        {
            byMonth[m] = Math.Round(byMonth[m], 2);
        }

        var drift = economics.Tcv - byMonth.Values.Sum();
        if (drift != 0)
        {
            byMonth[months[^1]] += drift;
        }

        return [.. months.Select(m => new RevenuePhaseDto(m, byMonth[m], true))];
    }

    public static List<DateOnly> MonthsBetween(DateOnly start, DateOnly end)
    {
        var months = new List<DateOnly>();
        for (var m = new DateOnly(start.Year, start.Month, 1); m <= end; m = m.AddMonths(1))
        {
            months.Add(m);
        }

        return months;
    }
}
