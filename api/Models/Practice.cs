namespace CapacityTracker.Api.Models;

/// <summary>
/// A practice (department). People link to a practice by <see cref="Name"/>.
/// </summary>
public class Practice
{
    public Guid PracticeId { get; set; }
    public string Name { get; set; } = string.Empty;

    public Guid? LeadId { get; set; }
    public Person? Lead { get; set; }

    /// <summary>Default utilization target (%) applied to new members without an explicit target.</summary>
    public int? DefaultUtilizationTarget { get; set; }

    public bool IsArchived { get; set; }
}
