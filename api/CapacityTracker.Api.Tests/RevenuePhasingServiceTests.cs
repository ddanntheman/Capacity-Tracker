using System;
using System.Linq;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class RevenuePhasingServiceTests
{
    private static readonly DateOnly JulWeek = new(2026, 7, 6); // Monday
    private static readonly DateOnly AugWeek = new(2026, 8, 3);

    private static PricingPlan Plan(PricingModel model = PricingModel.RoleBased, decimal techFees = 0)
    {
        var plan = new PricingPlan
        {
            PricingPlanId = Guid.NewGuid(),
            StartDate = JulWeek,
            EndDate = AugWeek.AddDays(4),
            PricingModel = model,
            TechnologyFees = techFees,
        };
        plan.LineItems.Add(new PlanLineItem
        {
            PlanLineItemId = Guid.NewGuid(),
            RoleTitle = "Engagement Manager",
            Rank = "Manager",
            Geography = "US",
            Organization = LineItemOrganization.Internal,
            WeekHours =
            [
                new PlanWeekHours { WeekStart = JulWeek, Hours = 10 },
                new PlanWeekHours { WeekStart = AugWeek, Hours = 10 },
            ],
        });
        return plan;
    }

    private static RateCardEntry[] RateCard() =>
    [
        new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = new DateOnly(2026, 1, 1), CostRate = 100, BillRate = 250 },
    ];

    [Fact]
    public void MonthsBetween_CoversEngagementWindow()
    {
        var months = RevenuePhasingService.MonthsBetween(new DateOnly(2026, 7, 15), new DateOnly(2026, 9, 2));
        Assert.Equal([new DateOnly(2026, 7, 1), new DateOnly(2026, 8, 1), new DateOnly(2026, 9, 1)], months);
    }

    [Fact]
    public void Proposal_PhasesWeeklyFeesIntoMonths_AndTiesToTcv()
    {
        var plan = Plan();
        var econ = PlanEconomicsService.Compute(plan, RateCard());
        var phases = RevenuePhasingService.ProposeMonthly(plan, econ);

        Assert.Equal(2, phases.Count);
        Assert.Equal(new DateOnly(2026, 7, 1), phases[0].PeriodStart);
        Assert.Equal(2500, phases[0].Amount);
        Assert.Equal(2500, phases[1].Amount);
        Assert.Equal(econ.Tcv, phases.Sum(p => p.Amount));
        Assert.All(phases, p => Assert.True(p.IsInferred));
    }

    [Fact]
    public void Proposal_SpreadsTechnologyFees_AndAbsorbsRoundingInFinalMonth()
    {
        var plan = Plan(techFees: 1000);
        var econ = PlanEconomicsService.Compute(plan, RateCard());
        var phases = RevenuePhasingService.ProposeMonthly(plan, econ);

        Assert.Equal(econ.Tcv, phases.Sum(p => p.Amount));
        Assert.Equal(3000, phases[0].Amount); // 2500 labor + 500 tech
    }

    [Fact]
    public void Proposal_FeeBasedWithoutHours_SpreadsTcvEvenly()
    {
        var plan = new PricingPlan
        {
            PricingPlanId = Guid.NewGuid(),
            StartDate = new DateOnly(2026, 7, 1),
            EndDate = new DateOnly(2026, 9, 30),
            PricingModel = PricingModel.FixedFee,
            FixedFee = 90000,
        };
        var econ = PlanEconomicsService.Compute(plan, RateCard());
        var phases = RevenuePhasingService.ProposeMonthly(plan, econ);

        Assert.Equal(3, phases.Count);
        Assert.Equal(econ.Tcv, phases.Sum(p => p.Amount));
        Assert.Equal(30000, phases[0].Amount);
    }
}
