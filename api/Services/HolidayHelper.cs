namespace CapacityTracker.Api.Services;

/// <summary>
/// US federal holidays and holiday-adjusted weekly capacity. A weekday
/// observed holiday removes 8 hours from that week's capacity.
/// </summary>
public static class HolidayHelper
{
    /// <summary>Observed US federal holiday dates for a calendar year.</summary>
    public static IReadOnlyList<DateOnly> FederalHolidays(int year) =>
    [
        Observed(new DateOnly(year, 1, 1)),        // New Year's Day
        NthWeekday(year, 1, DayOfWeek.Monday, 3),  // MLK Day
        NthWeekday(year, 2, DayOfWeek.Monday, 3),  // Presidents' Day
        LastWeekday(year, 5, DayOfWeek.Monday),    // Memorial Day
        Observed(new DateOnly(year, 6, 19)),       // Juneteenth
        Observed(new DateOnly(year, 7, 4)),        // Independence Day
        NthWeekday(year, 9, DayOfWeek.Monday, 1),  // Labor Day
        NthWeekday(year, 10, DayOfWeek.Monday, 2), // Columbus Day
        Observed(new DateOnly(year, 11, 11)),      // Veterans Day
        NthWeekday(year, 11, DayOfWeek.Thursday, 4), // Thanksgiving
        Observed(new DateOnly(year, 12, 25)),      // Christmas Day
    ];

    /// <summary>Number of observed federal holidays falling Mon-Fri of the given week.</summary>
    public static int HolidaysInWeek(DateOnly weekStart)
    {
        var friday = weekStart.AddDays(4);
        var years = weekStart.Year == friday.Year ? new[] { weekStart.Year } : new[] { weekStart.Year, friday.Year };
        return years
            .SelectMany(FederalHolidays)
            .Count(h => h >= weekStart && h <= friday);
    }

    /// <summary>Weekly capacity reduced by 8h per federal holiday, floored at 0.</summary>
    public static int CapacityForWeek(DateOnly weekStart, int weeklyCapacityHours) =>
        Math.Max(0, weeklyCapacityHours - 8 * HolidaysInWeek(weekStart));

    private static DateOnly Observed(DateOnly date) => date.DayOfWeek switch
    {
        DayOfWeek.Saturday => date.AddDays(-1),
        DayOfWeek.Sunday => date.AddDays(1),
        _ => date,
    };

    private static DateOnly NthWeekday(int year, int month, DayOfWeek day, int n)
    {
        var first = new DateOnly(year, month, 1);
        var offset = ((int)day - (int)first.DayOfWeek + 7) % 7;
        return first.AddDays(offset + 7 * (n - 1));
    }

    private static DateOnly LastWeekday(int year, int month, DayOfWeek day)
    {
        var last = new DateOnly(year, month, DateTime.DaysInMonth(year, month));
        var offset = ((int)last.DayOfWeek - (int)day + 7) % 7;
        return last.AddDays(-offset);
    }
}
