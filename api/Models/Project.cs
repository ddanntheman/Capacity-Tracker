namespace CapacityTracker.Api.Models;

public enum ProjectStatus
{
    Active = 0,
    Pipeline = 1,
    Closed = 2,
}

public class Project
{
    public Guid ProjectId { get; set; }
    public string ClientName { get; set; } = string.Empty;
    public string ProjectName { get; set; } = string.Empty;
    public DateOnly StartDate { get; set; }
    public DateOnly? EndDate { get; set; }
    public ProjectStatus Status { get; set; } = ProjectStatus.Pipeline;

    public ICollection<Allocation> Allocations { get; set; } = [];
}
