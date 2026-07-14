using Xunit;
using System;
using CapacityTracker.Api.Services;

namespace CapacityTracker.Api.Tests;

public class HolidayHelperTests
{
    [Theory]
    [InlineData(2026, 8, 3, 0)]   // ordinary week, no holidays
    [InlineData(2026, 6, 15, 1)]  // Juneteenth (Fri 2026-06-19)
    [InlineData(2026, 8, 31, 0)]  // Labor Day falls in the following week
    public void HolidaysInWeek_CountsObservedWeekdayHolidays(int y, int m, int d, int expected)
    {
        Assert.Equal(expected, HolidayHelper.HolidaysInWeek(new DateOnly(y, m, d)));
    }

    [Fact]
    public void HolidaysInWeek_LaborDayWeek()
    {
        Assert.Equal(1, HolidayHelper.HolidaysInWeek(new DateOnly(2026, 9, 7)));
    }

    [Fact]
    public void HolidaysInWeek_ObservedSaturdayHolidayShiftsToFriday()
    {
        // Independence Day 2026 is a Saturday, observed Friday 2026-07-03.
        Assert.Equal(1, HolidayHelper.HolidaysInWeek(new DateOnly(2026, 6, 29)));
    }

    [Fact]
    public void HolidaysInWeek_CrossYearWeekCountsBothYears()
    {
        // Week of Mon 2025-12-29 spans into 2026: New Year's Day (Thu 2026-01-01).
        Assert.Equal(1, HolidayHelper.HolidaysInWeek(new DateOnly(2025, 12, 29)));
    }

    [Fact]
    public void HolidaysInWeek_ThanksgivingWeek()
    {
        Assert.Equal(1, HolidayHelper.HolidaysInWeek(new DateOnly(2026, 11, 23)));
    }

    [Theory]
    [InlineData(40, 32)] // full-time, one holiday
    [InlineData(20, 12)] // part-time, one holiday
    [InlineData(4, 0)]   // floor at zero
    public void CapacityForWeek_ReducesByEightPerHoliday(int weekly, int expected)
    {
        // Christmas 2026 observed Friday 2026-12-25.
        Assert.Equal(expected, HolidayHelper.CapacityForWeek(new DateOnly(2026, 12, 21), weekly));
    }

    [Fact]
    public void CapacityForWeek_OrdinaryWeekUnchanged()
    {
        Assert.Equal(40, HolidayHelper.CapacityForWeek(new DateOnly(2026, 8, 3), 40));
    }

    [Fact]
    public void FederalHolidays_HasElevenPerYear()
    {
        Assert.Equal(11, HolidayHelper.FederalHolidays(2026).Count);
    }
}
