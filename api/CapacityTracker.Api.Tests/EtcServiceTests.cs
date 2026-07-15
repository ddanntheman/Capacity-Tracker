using System;
using System.Collections.Generic;
using System.Linq;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class EtcServiceTests
{
    private static readonly DateOnly Week1 = new(2026, 7, 6); // Monday
    private static readonly DateOnly Week2 = new(2026, 7, 13);
    private static readonly DateOnly Week3 = new(2026, 7, 20);

    private static List<RateCardEntry> RateCard() =>
    [
        new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = new DateOnly(2026, 1, 1), CostRate = 100, BillRate = 250 },
    ];

    private static PricingPlan Plan()
    {
        var plan = new PricingPlan
        {
            PricingPlanId = Guid.NewGuid(),
            StartDate = Week1,
            EndDate = Week3.AddDays(4),
            PricingModel = PricingModel.RoleBased,
            Status = PlanStatus.ClosedWon,
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
                new PlanWeekHours { WeekStart = Week1, Hours = 10 },
                new PlanWeekHours { WeekStart = Week2, Hours = 10 },
                new PlanWeekHours { WeekStart = Week3, Hours = 10 },
            ],
        });
        return plan;
    }

    private static LineActual Actual(Guid lineId, DateOnly week, decimal hours, decimal hardCost = 0) => new()
    {
        LineActualId = Guid.NewGuid(),
        PlanLineItemId = lineId,
        WeekStart = week,
        Hours = hours,
        HardCost = hardCost,
        EnteredAtUtc = DateTime.UtcNow,
    };

    [Fact]
    public void NoActuals_EtcIsFullForecastAndEacEqualsPlan()
    {
        var plan = Plan();
        var etc = EtcService.Compute(plan, RateCard(), [], [], null, 30, 7500, Week1);

        Assert.Equal(0, etc.ActualHours);
        Assert.Equal(30, etc.DerivedEtcHours);
        Assert.Equal(30 * 250, etc.DerivedEtcFees);
        Assert.Equal(30, etc.EacHours);
        Assert.Equal(7500, etc.EacFees);
        Assert.Equal(0, etc.HoursVariance);
        Assert.False(etc.HoursOverrun);
        Assert.False(etc.FeeOverrun);
    }

    [Fact]
    public void ActualsReplacePastWeeks_EtcOnlyCountsWeeksAfterLastActual()
    {
        var plan = Plan();
        var lineId = plan.LineItems.First().PlanLineItemId;
        var actuals = new List<LineActual> { Actual(lineId, Week1, 14) };

        var etc = EtcService.Compute(plan, RateCard(), actuals, [], null, 30, 7500, Week2);

        Assert.Equal(14, etc.ActualHours);
        Assert.Equal(14 * 250, etc.ActualFees);
        // Weeks 2 and 3 remain; week 1's forecast is superseded by the actual.
        Assert.Equal(20, etc.DerivedEtcHours);
        Assert.Equal(34, etc.EacHours);
        Assert.Equal(34 * 250, etc.EacFees);
        Assert.Equal(4, etc.HoursVariance);
        Assert.True(etc.HoursOverrun);
        Assert.True(etc.FeeOverrun);
    }

    [Fact]
    public void ActualsDoNotMutateForecastOrBaselineInputs()
    {
        var plan = Plan();
        var lineId = plan.LineItems.First().PlanLineItemId;
        EtcService.Compute(plan, RateCard(), [Actual(lineId, Week1, 40)], [], null, 30, 7500, Week2);

        Assert.Equal(30, plan.LineItems.First().WeekHours.Sum(w => w.Hours));
    }

    [Fact]
    public void Override_ReplacesDerivedEtcInEacButKeepsDerivedVisible()
    {
        var plan = Plan();
        var lineId = plan.LineItems.First().PlanLineItemId;
        var over = new EtcOverride { Hours = 5, Fees = 1000, Justification = "Scope descoped" };

        var etc = EtcService.Compute(plan, RateCard(), [Actual(lineId, Week1, 10)], [], over, 30, 7500, Week2);

        Assert.Equal(20, etc.DerivedEtcHours);
        Assert.Equal(5, etc.OverrideEtcHours);
        Assert.Equal(15, etc.EacHours);
        Assert.Equal(10 * 250 + 1000, etc.EacFees);
    }

    [Fact]
    public void ApprovedChangeOrders_AmendTheBaselinePosition()
    {
        var plan = Plan();
        var orders = new List<ChangeOrder>
        {
            new() { Status = ChangeOrderStatus.Approved, DeltaHours = 10, DeltaFees = 2500 },
            new() { Status = ChangeOrderStatus.Draft, DeltaHours = 99, DeltaFees = 9999 },
        };

        var etc = EtcService.Compute(plan, RateCard(), [], orders, null, 30, 7500, Week1);

        Assert.Equal(40, etc.AmendedBaselineHours);
        Assert.Equal(10000, etc.AmendedTcv);
        Assert.Equal(-10, etc.HoursVariance);
        Assert.False(etc.HoursOverrun);
    }

    [Fact]
    public void SubcontractorHardCost_CountsTowardCostNotFees()
    {
        var plan = Plan();
        var sub = new PlanLineItem
        {
            PlanLineItemId = Guid.NewGuid(),
            RoleTitle = "Sub Developer",
            Organization = LineItemOrganization.Subcontractor,
            ClientRate = 200,
            CostRateOverride = 150,
            WeekHours = [new PlanWeekHours { WeekStart = Week1, Hours = 10 }],
        };
        plan.LineItems.Add(sub);

        var noCost = EtcService.Compute(plan, RateCard(),
            [Actual(sub.PlanLineItemId, Week1, 10)], [], null, 40, 9500, Week1);
        var withCost = EtcService.Compute(plan, RateCard(),
            [Actual(sub.PlanLineItemId, Week1, 10, hardCost: 2000)], [], null, 40, 9500, Week1);

        Assert.Equal(noCost.EacFees, withCost.EacFees);
        Assert.True(withCost.ActualCost > noCost.ActualCost);
    }
}
