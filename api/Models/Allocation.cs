namespace CapacityTracker.Api.Models;

/// <summary>
/// Weekly-grain allocation linking a Person to a Project for the week beginning
/// <see cref="WeekStart"/> (always a Monday, UTC date) with booked hours.
/// </summary>
public class Allocation
{
    public Guid AllocationId { get; set; }

    public Guid PersonId { get; set; }
    public Person? Person { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public DateOnly WeekStart { get; set; }

    public decimal Hours { get; set; }

    /// <summary>
    /// Set when this booking is managed by a pricing-plan line item; such rows
    /// are replaced wholesale whenever the plan's hours grid changes.
    /// </summary>
    public Guid? PlanLineItemId { get; set; }
}
