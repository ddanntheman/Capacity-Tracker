namespace CapacityTracker.Api.Models;

/// <summary>
/// Weekly-grain allocation linking a Person to a Project for the week beginning
/// <see cref="WeekStart"/> (always a Monday, UTC date) with a percentage 0-100.
/// </summary>
public class Allocation
{
    public Guid AllocationId { get; set; }

    public Guid PersonId { get; set; }
    public Person? Person { get; set; }

    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }

    public DateOnly WeekStart { get; set; }

    public int PercentAllocated { get; set; }
}
