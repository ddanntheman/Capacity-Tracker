namespace CapacityTracker.Api.Models;

public enum ActualSource
{
    Manual = 0,
    WipUpload = 1,
    Subcontractor = 2,
}

/// <summary>
/// Actual hours charged by one delivery-team line in a week (DT-02/02a/02b).
/// Stored as its own layer: entering actuals never touches the forecast
/// (plan week hours) or the Original Plan baseline (DT-03).
/// </summary>
public class LineActual
{
    public Guid LineActualId { get; set; }

    public Guid PlanLineItemId { get; set; }
    public PlanLineItem? LineItem { get; set; }

    /// <summary>Monday of the week the hours were charged.</summary>
    public DateOnly WeekStart { get; set; }

    public decimal Hours { get; set; }

    /// <summary>Subcontractor labor recorded as hard cost in the WIP report (DT-02b).</summary>
    public decimal HardCost { get; set; }

    public ActualSource Source { get; set; }

    public DateTime EnteredAtUtc { get; set; }
    public string? EnteredBy { get; set; }
}

public enum ChangeOrderStatus
{
    Draft = 0,
    Approved = 1,
}

/// <summary>
/// A contractual amendment to a won engagement (DT-01b). Approved change
/// orders form the amended baseline (Original Plan + approved deltas) that
/// EAC and variance report against; the original baseline stays preserved.
/// </summary>
public class ChangeOrder
{
    public Guid ChangeOrderId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public string Title { get; set; } = string.Empty;
    public string? Notes { get; set; }

    public decimal DeltaHours { get; set; }
    public decimal DeltaFees { get; set; }

    public ChangeOrderStatus Status { get; set; } = ChangeOrderStatus.Draft;

    public Guid? EngagementDocumentId { get; set; }

    public DateTime CreatedAtUtc { get; set; }
    public string? CreatedBy { get; set; }
    public DateTime? ApprovedAtUtc { get; set; }
    public string? ApprovedBy { get; set; }
}

/// <summary>An actual recoverable expense (e.g. a subcontractor invoice) for a billing period (DT-04).</summary>
public class RecoverableExpenseEntry
{
    public Guid RecoverableExpenseEntryId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    /// <summary>First day of the billing month.</summary>
    public DateOnly PeriodStart { get; set; }

    public string Vendor { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? Notes { get; set; }

    public DateTime EnteredAtUtc { get; set; }
    public string? EnteredBy { get; set; }
}

/// <summary>
/// A manual ETC override at engagement level with required justification
/// (ETC-03/04). The latest uncleared row is the active override; cleared rows
/// are kept for history.
/// </summary>
public class EtcOverride
{
    public Guid EtcOverrideId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public decimal Hours { get; set; }
    public decimal Fees { get; set; }

    public string Justification { get; set; } = string.Empty;

    public DateTime CreatedAtUtc { get; set; }
    public string? CreatedBy { get; set; }
    public DateTime? ClearedAtUtc { get; set; }
    public string? ClearedBy { get; set; }
}
