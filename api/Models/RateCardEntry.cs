namespace CapacityTracker.Api.Models;

/// <summary>
/// Effective-dated standard cost and bill rates for internal resources, keyed
/// by level/rank and geography. The applicable entry for a week is the one
/// with the latest EffectiveFrom on or before the week start.
/// </summary>
public class RateCardEntry
{
    public Guid RateCardEntryId { get; set; }
    public string Rank { get; set; } = string.Empty;
    public string Geography { get; set; } = string.Empty;
    public DateOnly EffectiveFrom { get; set; }
    public decimal CostRate { get; set; }
    public decimal BillRate { get; set; }
}
