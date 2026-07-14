namespace CapacityTracker.Api.Models;

/// <summary>
/// A consultant. PersonId is the user's Entra object id (OID), auto-provisioned
/// on first sign-in.
/// </summary>
public class Person
{
    public Guid PersonId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// <summary>Job title (e.g. "Senior Consultant"), not the application role.</summary>
    public string? JobTitle { get; set; }

    public Guid? ManagerId { get; set; }
    public Person? Manager { get; set; }

    /// <summary>Career level (e.g. "Senior Consultant", "Director", "Partner").</summary>
    public string? Rank { get; set; }

    /// <summary>Practice or department (e.g. "Cyber", "M&amp;A Advisory").</summary>
    public string? Practice { get; set; }

    public string? Location { get; set; }
    public string? Phone { get; set; }
    public DateOnly? StartDate { get; set; }

    /// <summary>Fully-loaded internal hourly cost. Leadership-only.</summary>
    public decimal? CostRate { get; set; }

    /// <summary>Standard client-facing hourly bill rate. Leadership-only.</summary>
    public decimal? BillRate { get; set; }

    /// <summary>Target billable utilization as a percentage (0-100).</summary>
    public int? UtilizationTarget { get; set; }

    /// <summary>Standard working hours per week.</summary>
    public int WeeklyCapacityHours { get; set; } = 40;

    /// <summary>Comma-separated skill tags.</summary>
    public string? Skills { get; set; }

    public string? Notes { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>
    /// An unnamed role to be staffed later (e.g. "TBD — Senior Consultant").
    /// Placeholders hold project bookings but are excluded from capacity and
    /// utilization rollups; staffing one merges it into a named person.
    /// </summary>
    public bool IsPlaceholder { get; set; }

    public ICollection<Allocation> Allocations { get; set; } = [];
}
