namespace CapacityTracker.Api.Models;

/// <summary>
/// A locked snapshot of one person-week booking taken when a pipeline project
/// is won. Person name is denormalized so the baseline survives merges/removals.
/// </summary>
public class ProjectBaselineLine
{
    public Guid ProjectBaselineLineId { get; set; }
    public Guid ProjectId { get; set; }
    public Project? Project { get; set; }
    public Guid PersonId { get; set; }
    public string PersonName { get; set; } = string.Empty;
    public bool IsPlaceholder { get; set; }
    public DateOnly WeekStart { get; set; }
    public decimal Hours { get; set; }
}
