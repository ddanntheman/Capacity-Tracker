namespace CapacityTracker.Api.Services;

public static class WeekHelper
{
    /// <summary>Monday (UTC) of the week containing today.</summary>
    public static DateOnly CurrentWeekStart() => WeekStartOf(DateOnly.FromDateTime(DateTime.UtcNow));

    /// <summary>Monday (UTC) of the week containing the given date.</summary>
    public static DateOnly WeekStartOf(DateOnly date)
    {
        int diff = ((int)date.DayOfWeek + 6) % 7; // Monday = 0
        return date.AddDays(-diff);
    }
}
