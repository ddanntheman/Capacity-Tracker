using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Xunit;

namespace CapacityTracker.Api.Tests;

public class TaskOrderExtractionServiceTests
{
    [Fact]
    public void ExtractsFixedFeeTcvRateAndFrequency()
    {
        var text = """
            TASK ORDER 7 — Data Platform Modernization
            This engagement is priced on a fixed fee basis.
            Total Contract Value: $250,000.
            The blended rate is $225/hour for all consulting staff.
            Fees will be invoiced monthly in arrears, net 30.
            """;

        var result = TaskOrderExtractionService.Extract(text);

        Assert.Equal(PricingModel.FixedFee, result.FeeStructure);
        Assert.Equal(250_000m, result.Tcv);
        Assert.Equal(225m, result.ContractRph);
        Assert.Equal("monthly", result.InvoiceFrequency);
        Assert.Equal(4, result.Evidence.Count);
    }

    [Fact]
    public void ExtractsTimeAndMaterialsWithNotToExceed()
    {
        var text = "Services are provided on a time and materials basis, not-to-exceed $1.5 million. Client will be billed quarterly.";
        var result = TaskOrderExtractionService.Extract(text);

        Assert.Equal(PricingModel.RoleBased, result.FeeStructure);
        Assert.Equal(1_500_000m, result.Tcv);
        Assert.Equal("quarterly", result.InvoiceFrequency);
        Assert.Null(result.ContractRph);
    }

    [Fact]
    public void ExtractsThousandShorthandAndMilestoneBilling()
    {
        var text = "Milestone-based engagement. Total fees: 80k. Invoices are issued upon milestone acceptance.";
        var result = TaskOrderExtractionService.Extract(text);

        Assert.Equal(PricingModel.Milestone, result.FeeStructure);
        Assert.Equal(80_000m, result.Tcv);
        Assert.Equal("milestone", result.InvoiceFrequency);
    }

    [Fact]
    public void NoRecognizableTermsYieldsEmptyResult()
    {
        var result = TaskOrderExtractionService.Extract("Meeting notes from the kickoff. Attendees: Amanda, Drew.");

        Assert.False(result.HasAnyField);
        Assert.Empty(result.Evidence);
    }

    [Fact]
    public void ExtractableOnlyForTextLikeDocuments()
    {
        Assert.True(TaskOrderExtractionService.IsExtractable(new EngagementDocument { FileName = "to.md", ContentType = "application/octet-stream" }));
        Assert.True(TaskOrderExtractionService.IsExtractable(new EngagementDocument { FileName = "to.bin", ContentType = "text/plain" }));
        Assert.False(TaskOrderExtractionService.IsExtractable(new EngagementDocument { FileName = "to.pdf", ContentType = "application/pdf" }));
    }
}
