namespace CapacityTracker.Api.Models;

/// <summary>
/// Actual invoiced amount captured per engagement billing period (INV-04).
/// </summary>
public class InvoiceRecord
{
    public Guid InvoiceRecordId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>First day of the billing month.</summary>
    public DateOnly PeriodStart { get; set; }

    public decimal InvoicedAmount { get; set; }
    public DateOnly? InvoiceDate { get; set; }
    public string? Notes { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}

/// <summary>
/// Finance-maintained firm-level monthly revenue and net-fee targets (RU-04).
/// </summary>
public class FirmTarget
{
    public Guid FirmTargetId { get; set; }

    /// <summary>First day of the target month.</summary>
    public DateOnly PeriodStart { get; set; }

    public decimal RevenueTarget { get; set; }
    public decimal NetFeesTarget { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
    public string? UpdatedBy { get; set; }
}
