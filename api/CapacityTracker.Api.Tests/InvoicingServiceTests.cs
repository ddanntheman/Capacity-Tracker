using System;
using System.Collections.Generic;
using System.Linq;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class InvoicingServiceTests
{
    private static readonly DateOnly Period = new(2026, 7, 1);
    private static readonly DateOnly Week1 = new(2026, 7, 6); // Monday
    private static readonly DateOnly Week2 = new(2026, 7, 13);
    private static readonly DateOnly Week3 = new(2026, 7, 20);

    private static List<RateCardEntry> RateCard() =>
    [
        new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = new DateOnly(2026, 1, 1), CostRate = 100, BillRate = 250 },
    ];

    private static PricingPlan Plan(PricingModel model = PricingModel.RoleBased)
    {
        var plan = new PricingPlan
        {
            PricingPlanId = Guid.NewGuid(),
            ProjectId = Guid.NewGuid(),
            StartDate = Week1,
            EndDate = Week3.AddDays(4),
            PricingModel = model,
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

    private static LineActual Actual(Guid lineId, DateOnly week, decimal hours) => new()
    {
        LineActualId = Guid.NewGuid(),
        PlanLineItemId = lineId,
        WeekStart = week,
        Hours = hours,
        EnteredAtUtc = DateTime.UtcNow,
    };

    [Fact]
    public void HourlyWork_InvoicesHoursAtContractRate()
    {
        var plan = Plan();
        var lineId = plan.LineItems.First().PlanLineItemId;
        var dto = InvoicingService.Compute(plan, RateCard(),
            [Actual(lineId, Week1, 12)], plan.PricingModel, true, 0, 0, null, Period, [Period]);

        // Week 1 uses the charged actual; weeks 2/3 fall back to forecast.
        Assert.Equal(32, dto.TotalHours);
        Assert.Equal(32 * 250, dto.InvoiceAmount);
        Assert.Equal("hours", dto.InvoiceBasis);
        var line = Assert.Single(dto.Lines);
        Assert.True(line.Weeks.Single(w => w.WeekStart == Week1).FromActuals);
        Assert.False(line.Weeks.Single(w => w.WeekStart == Week2).FromActuals);
    }

    [Fact]
    public void FixedFee_InvoicesFromScheduleNotHours()
    {
        var plan = Plan(PricingModel.FixedFee);
        var dto = InvoicingService.Compute(plan, RateCard(),
            [], plan.PricingModel, true, 12000, 0, null, Period, [Period]);

        Assert.Equal(12000, dto.InvoiceAmount);
        Assert.Equal("schedule", dto.InvoiceBasis);
        Assert.Equal(30, dto.TotalHours);
    }

    [Fact]
    public void EffectiveDatedRateChange_AppliesMidPeriodWithoutDuplicateRows()
    {
        var plan = Plan();
        var rateCard = RateCard();
        rateCard.Add(new RateCardEntry { Rank = "Manager", Geography = "US", EffectiveFrom = Week2, CostRate = 110, BillRate = 300 });

        var dto = InvoicingService.Compute(plan, rateCard, [], plan.PricingModel, true, 0, 0, null, Period, [Period]);

        var line = Assert.Single(dto.Lines);
        Assert.Equal(10 * 250 + 10 * 300 + 10 * 300, line.Amount);
    }

    [Fact]
    public void Reconciliation_ReportsExpectedVsChargedAndNetFees()
    {
        var plan = Plan();
        var lineId = plan.LineItems.First().PlanLineItemId;
        var dto = InvoicingService.Compute(plan, RateCard(),
            [Actual(lineId, Week1, 8)], plan.PricingModel, true, 0, 500, null, Period, [Period]);

        var recon = Assert.Single(dto.Reconciliation);
        Assert.Equal(30, recon.ExpectedHours);
        Assert.Equal(8, recon.ChargedHours);
        Assert.Equal(-22, recon.HoursVariance);
        Assert.Equal(8 * 250, dto.GrossFeesAtStandard);
        Assert.Equal(500, dto.RecoverableExpenses);
        Assert.Equal(dto.InvoiceAmount - 500, dto.NetFees);
    }

    [Fact]
    public void CapturedInvoice_ReportsVarianceVsForecast()
    {
        var plan = Plan();
        var record = new InvoiceRecord { InvoicedAmount = 7000, InvoiceDate = new DateOnly(2026, 8, 5) };
        var dto = InvoicingService.Compute(plan, RateCard(), [], plan.PricingModel, true, 0, 0, record, Period, [Period]);

        Assert.Equal(7000, dto.InvoicedAmount);
        Assert.Equal(7000 - dto.InvoiceAmount, dto.InvoiceVariance);
    }

    [Fact]
    public void SubcontractorLines_ExcludedFromInternalReconciliation()
    {
        var plan = Plan();
        plan.LineItems.Add(new PlanLineItem
        {
            PlanLineItemId = Guid.NewGuid(),
            RoleTitle = "Sub Developer",
            Organization = LineItemOrganization.Subcontractor,
            ClientRate = 200,
            WeekHours = [new PlanWeekHours { WeekStart = Week1, Hours = 10 }],
        });

        var dto = InvoicingService.Compute(plan, RateCard(), [], plan.PricingModel, true, 0, 0, null, Period, [Period]);

        Assert.Equal(2, dto.Lines.Count);
        Assert.Single(dto.Reconciliation);
        Assert.Equal(30 * 250 + 10 * 200, dto.InvoiceAmount);
    }
}
