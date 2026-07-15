namespace CapacityTracker.Api.Models;

/// <summary>
/// A firm-defined standard rank (career level). People and plan lines reference a rank by <see cref="Name"/>.
/// </summary>
public class StandardRank
{
    public Guid StandardRankId { get; set; }
    public string Name { get; set; } = string.Empty;

    /// <summary>Position in the seniority ladder (lower = more junior).</summary>
    public int SortOrder { get; set; }

    /// <summary>Default billable utilization target (%) applied to new people at this rank.</summary>
    public int? DefaultUtilizationTarget { get; set; }

    public bool IsArchived { get; set; }
}
