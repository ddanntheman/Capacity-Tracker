namespace CapacityTracker.Api.Models;

public enum PlanStatus
{
    Draft = 0,
    ActivePursuit = 1,
    ClosedWon = 2,
    ClosedLost = 3,
}

public enum PricingModel
{
    BlendedRate = 0,
    RoleBased = 1,
    FixedFee = 2,
    Milestone = 3,
    Outcome = 4,
}

/// <summary>
/// A pricing plan for a pursuit. The weekly hours grid on its line items is
/// the base input for level of effort, fees, cost, and the revenue forecast.
/// Named internal line items on an active pursuit auto-book pipeline hours.
/// </summary>
public class PricingPlan
{
    public Guid PricingPlanId { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public Guid? MdOwnerId { get; set; }
    public Person? MdOwner { get; set; }

    public string? Practice { get; set; }

    public PlanStatus Status { get; set; } = PlanStatus.Draft;

    public DateOnly StartDate { get; set; }
    public DateOnly EndDate { get; set; }

    public PricingModel PricingModel { get; set; } = PricingModel.RoleBased;

    /// <summary>Client rate per hour when PricingModel is BlendedRate.</summary>
    public decimal? BlendedRate { get; set; }

    /// <summary>Total fee when PricingModel is FixedFee/Milestone/Outcome.</summary>
    public decimal? FixedFee { get; set; }

    public decimal TechnologyFees { get; set; }

    public decimal RecoverableExpenses { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAtUtc { get; set; }
    public DateTime UpdatedAtUtc { get; set; }

    /// <summary>Set by the authorized win conversion (CW-01/02).</summary>
    public DateTime? WonAtUtc { get; set; }

    public string? WonBy { get; set; }

    public ICollection<PlanLineItem> LineItems { get; set; } = [];
}

public enum LineItemOrganization
{
    Internal = 0,
    Subcontractor = 1,
}

/// <summary>
/// A delivery-team line on a pricing plan: a role at a level/geography, either
/// a named resource or an unnamed placeholder, internal AC or subcontractor.
/// </summary>
public class PlanLineItem
{
    public Guid PlanLineItemId { get; set; }

    public Guid PricingPlanId { get; set; }
    public PricingPlan? Plan { get; set; }

    public string RoleTitle { get; set; } = string.Empty;
    public string? Rank { get; set; }
    public string? Geography { get; set; }

    public LineItemOrganization Organization { get; set; }
    public string? SubcontractorFirm { get; set; }

    /// <summary>Named AC resource; null for unnamed placeholder roles.</summary>
    public Guid? PersonId { get; set; }
    public Person? Person { get; set; }

    /// <summary>Manually entered cost rate; required for subcontractor lines.</summary>
    public decimal? CostRateOverride { get; set; }

    /// <summary>Manually entered bill rate (subcontractor client rate).</summary>
    public decimal? BillRateOverride { get; set; }

    /// <summary>Client-facing rate when the plan uses role-based pricing.</summary>
    public decimal? ClientRate { get; set; }

    public int SortOrder { get; set; }

    public ICollection<PlanWeekHours> WeekHours { get; set; } = [];
}

/// <summary>Hours for one line item in the week beginning WeekStart (Monday).</summary>
public class PlanWeekHours
{
    public Guid PlanWeekHoursId { get; set; }

    public Guid PlanLineItemId { get; set; }
    public PlanLineItem? LineItem { get; set; }

    public DateOnly WeekStart { get; set; }
    public decimal Hours { get; set; }
}
