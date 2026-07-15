namespace CapacityTracker.Api.Models;

public enum RevenueLayer
{
    /// <summary>Immutable phasing locked at win conversion (CW-02/03).</summary>
    OriginalPlan = 0,

    /// <summary>Editable monthly revenue forecast (RS-05/06/07).</summary>
    Forecast = 1,
}

/// <summary>One month of revenue phasing for a pricing plan, per layer.</summary>
public class RevenuePhase
{
    public Guid RevenuePhaseId { get; set; }

    public Guid PricingPlanId { get; set; }
    public PricingPlan? Plan { get; set; }

    public RevenueLayer Layer { get; set; }

    /// <summary>First day of the calendar month.</summary>
    public DateOnly PeriodStart { get; set; }

    public decimal Amount { get; set; }

    /// <summary>True while the phasing is a system proposal not yet confirmed by the EM.</summary>
    public bool IsInferred { get; set; }
}

public enum DocumentKind
{
    TaskOrder = 0,
    ChangeOrder = 1,
    Other = 2,
}

/// <summary>An uploaded contract document (Task Order, change order) on an engagement (RS-01).</summary>
public class EngagementDocument
{
    public Guid EngagementDocumentId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public DocumentKind Kind { get; set; }
    public string FileName { get; set; } = string.Empty;
    public string ContentType { get; set; } = string.Empty;
    public byte[] Content { get; set; } = [];
    public long SizeBytes { get; set; }

    public DateTime UploadedAtUtc { get; set; }
    public string? UploadedBy { get; set; }
}

/// <summary>
/// The confirmed revenue setup for a won engagement (RS-02/03/04): fee
/// structure, TCV, and invoice schedule that drive the revenue forecast.
/// Values are proposed by the system from the plan/Task Order and take effect
/// only after explicit EM confirmation.
/// </summary>
public class RevenueSetup
{
    public Guid RevenueSetupId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public PricingModel FeeStructure { get; set; }
    public decimal Tcv { get; set; }
    public decimal? ContractRph { get; set; }

    /// <summary>Invoice frequency, e.g. monthly, milestone, quarterly.</summary>
    public string? InvoiceFrequency { get; set; }

    /// <summary>Invoice schedule / milestone / payment-term notes.</summary>
    public string? InvoiceScheduleNotes { get; set; }

    /// <summary>True while the values are a system proposal, not from the signed contract.</summary>
    public bool IsInferred { get; set; }

    public bool Confirmed { get; set; }
    public string? ConfirmedBy { get; set; }
    public DateTime? ConfirmedAtUtc { get; set; }

    public DateTime UpdatedAtUtc { get; set; }
}
