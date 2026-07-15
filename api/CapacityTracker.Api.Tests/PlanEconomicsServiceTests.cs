using System;
using System.Collections.Generic;
using System.Linq;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class PlanEconomicsServiceTests
{
    private static readonly DateOnly Week1 = new(2026, 7, 6); // Monday
    private static readonly DateOnly Week2 = new(2026, 7, 13);

    private static List<RateCardEntry> RateCard() =>
    [
        new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = new DateOnly(2026, 1, 1), CostRate = 100, BillRate = 250 },
        new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = Week2, CostRate = 110, BillRate = 275 },
    ];

    private static PricingPlan Plan(PricingModel model = PricingModel.RoleBased) => new()
    {
        PricingPlanId = Guid.NewGuid(),
        StartDate = Week1,
        EndDate = Week2.AddDays(4),
        PricingModel = model,
    };

    private static PlanLineItem InternalLine(decimal week1Hours, decimal week2Hours) => new()
    {
        PlanLineItemId = Guid.NewGuid(),
        RoleTitle = "Engagement Manager",
        Rank = "Manager",
        Geography = "US",
        Organization = LineItemOrganization.Internal,
        WeekHours =
        [
            new PlanWeekHours { WeekStart = Week1, Hours = week1Hours },
            new PlanWeekHours { WeekStart = Week2, Hours = week2Hours },
        ],
    };

    [Fact]
    public void Resolve_PicksLatestEffectiveEntryOnOrBeforeWeek()
    {
        var card = RateCard();
        Assert.Equal(250, PlanEconomicsService.Resolve(card, "Manager", "US", Week1)!.BillRate);
        Assert.Equal(275, PlanEconomicsService.Resolve(card, "Manager", "US", Week2)!.BillRate);
        Assert.Null(PlanEconomicsService.Resolve(card, "Manager", "US", new DateOnly(2025, 12, 1)));
        Assert.Null(PlanEconomicsService.Resolve(card, "Director", "US", Week1));
    }

    [Fact]
    public void RoleBased_UsesEffectiveDatedRatesPerWeek()
    {
        var plan = Plan();
        plan.LineItems.Add(InternalLine(10, 10));

        var econ = PlanEconomicsService.Compute(plan, RateCard());

        Assert.Empty(econ.ValidationErrors);
        Assert.Equal(20, econ.TotalHours);
        Assert.Equal(10 * 250 + 10 * 275, econ.LaborFees);
        Assert.Equal(10 * 100 + 10 * 110, econ.InternalCost);
        Assert.Equal(econ.LaborFees, econ.GrossFeesAtStandard);
        Assert.Equal(20, econ.BillableHours);
        Assert.Equal(2, econ.Weeks.Count);
        Assert.Equal(20, econ.Weeks[^1].CumulativeHours);
    }

    [Fact]
    public void BlendedRate_UsesPlanRateForFees()
    {
        var plan = Plan(PricingModel.BlendedRate);
        plan.BlendedRate = 300;
        plan.LineItems.Add(InternalLine(10, 0));

        var econ = PlanEconomicsService.Compute(plan, RateCard());

        Assert.Empty(econ.ValidationErrors);
        Assert.Equal(3000, econ.LaborFees);
        Assert.Equal(1000, econ.InternalCost);
    }

    [Fact]
    public void FixedFee_SpreadsFeeProportionalToHours()
    {
        var plan = Plan(PricingModel.FixedFee);
        plan.FixedFee = 10000;
        plan.TechnologyFees = 500;
        plan.LineItems.Add(InternalLine(30, 10));

        var econ = PlanEconomicsService.Compute(plan, RateCard());

        Assert.Empty(econ.ValidationErrors);
        Assert.Equal(10000, econ.LaborFees);
        Assert.Equal(10500, econ.Tcv);
        Assert.Equal(7500, econ.Weeks[0].Fees);
        Assert.Equal(2500, econ.Weeks[1].Fees);
    }

    [Fact]
    public void Subcontractor_RequiresCostRate_AndDoesNotCountBillableHours()
    {
        var plan = Plan();
        plan.LineItems.Add(new PlanLineItem
        {
            PlanLineItemId = Guid.NewGuid(),
            RoleTitle = "Sub Dev",
            Organization = LineItemOrganization.Subcontractor,
            ClientRate = 200,
            WeekHours = [new PlanWeekHours { WeekStart = Week1, Hours = 10 }],
        });

        var econ = PlanEconomicsService.Compute(plan, RateCard());

        Assert.Contains(econ.ValidationErrors, e => e.Contains("missing a cost rate"));
        Assert.Equal(0, econ.BillableHours);
        Assert.Equal(2000, econ.LaborFees);
        Assert.Equal(0, econ.InternalCost);
    }

    [Fact]
    public void Validation_FlagsMissingRateMatchAndOutOfWindowHours()
    {
        var plan = Plan();
        var line = InternalLine(10, 0);
        line.Rank = "Director"; // no rate card entry
        line.WeekHours.Add(new PlanWeekHours { WeekStart = Week2.AddDays(14), Hours = 5 });
        plan.LineItems.Add(line);

        var econ = PlanEconomicsService.Compute(plan, RateCard());

        Assert.Contains(econ.ValidationErrors, e => e.Contains("no rate card match"));
        Assert.Contains(econ.ValidationErrors, e => e.Contains("outside the engagement window"));
        Assert.Contains(econ.ValidationErrors, e => e.Contains("client rate is zero"));
    }
}
