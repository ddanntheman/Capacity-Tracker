using System;
using System.Collections.Generic;
using System.Linq;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class InvoiceVarianceServiceTests
{
    private static readonly Guid ProjectId = Guid.NewGuid();
    private static readonly DateOnly Jul = new(2026, 7, 1);
    private static readonly DateOnly Aug = new(2026, 8, 1);
    private static readonly DateOnly Sep = new(2026, 9, 1);

    private static InvoiceRecord Record(DateOnly period, decimal amount) => new()
    {
        InvoiceRecordId = Guid.NewGuid(),
        ProjectId = ProjectId,
        PeriodStart = period,
        InvoicedAmount = amount,
        InvoiceDate = period.AddMonths(1).AddDays(4),
    };

    [Fact]
    public void CapturedPeriods_ComputeVarianceAndPct()
    {
        var report = InvoiceVarianceService.Compute(ProjectId, PricingModel.RoleBased,
            [(Jul, 10000m), (Aug, 8000m)],
            [Record(Jul, 9000), Record(Aug, 8500)]);

        Assert.Equal(-1000, report.Rows[0].Variance);
        Assert.Equal(-10.0m, report.Rows[0].VariancePct);
        Assert.Equal(500, report.Rows[1].Variance);
        Assert.Equal(6.2m, report.Rows[1].VariancePct);
        Assert.Equal(18000, report.TotalForecast);
        Assert.Equal(17500, report.TotalInvoiced);
        Assert.Equal(-500, report.TotalVariance);
    }

    [Fact]
    public void UncapturedPeriods_DoNotCountTowardCumulativeVariance()
    {
        var report = InvoiceVarianceService.Compute(ProjectId, PricingModel.RoleBased,
            [(Jul, 10000m), (Aug, 8000m), (Sep, 6000m)],
            [Record(Jul, 9500)]);

        var aug = report.Rows.Single(r => r.PeriodStart == Aug);
        Assert.Null(aug.InvoicedAmount);
        Assert.Null(aug.Variance);
        Assert.Equal(18000, aug.CumulativeForecast);
        Assert.Equal(9500, aug.CumulativeInvoiced);
        Assert.Equal(-500, aug.CumulativeVariance);
        Assert.Equal(-500, report.TotalVariance);
    }

    [Fact]
    public void ZeroForecast_HasNoVariancePct()
    {
        var report = InvoiceVarianceService.Compute(ProjectId, PricingModel.FixedFee,
            [(Jul, 0m)], [Record(Jul, 1000)]);

        Assert.Equal(1000, report.Rows[0].Variance);
        Assert.Null(report.Rows[0].VariancePct);
    }

    [Fact]
    public void RowsAreOrderedByPeriod()
    {
        var report = InvoiceVarianceService.Compute(ProjectId, PricingModel.RoleBased,
            [(Sep, 1m), (Jul, 1m), (Aug, 1m)], []);

        Assert.Equal([Jul, Aug, Sep], report.Rows.Select(r => r.PeriodStart));
    }
}
