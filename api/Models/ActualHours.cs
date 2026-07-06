namespace CapacityTracker.Api.Models;

/// <summary>
/// Actual chargeable hours recorded for a person in the month beginning
/// <see cref="Month"/> (always the first of a month).
/// </summary>
public class ActualHours
{
    public Guid ActualHoursId { get; set; }

    public Guid PersonId { get; set; }
    public Person? Person { get; set; }

    public DateOnly Month { get; set; }

    public decimal ChargeableHours { get; set; }
}
