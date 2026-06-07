using Xunit;
using System;
using CapacityTracker.Api.Services;

namespace CapacityTracker.Api.Tests;

public class WeekHelperTests
{
    [Theory]
    [InlineData(2026, 6, 1, 2026, 6, 1)] // Monday -> Monday
    [InlineData(2026, 6, 2, 2026, 6, 1)] // Tuesday -> Monday
    [InlineData(2026, 6, 3, 2026, 6, 1)] // Wednesday -> Monday
    [InlineData(2026, 6, 4, 2026, 6, 1)] // Thursday -> Monday
    [InlineData(2026, 6, 5, 2026, 6, 1)] // Friday -> Monday
    [InlineData(2026, 6, 6, 2026, 6, 1)] // Saturday -> Monday
    [InlineData(2026, 6, 7, 2026, 6, 1)] // Sunday -> Monday
    public void WeekStartOf_ShouldReturnMondayOfWeek(
        int inputYear, int inputMonth, int inputDay,
        int expectedYear, int expectedMonth, int expectedDay)
    {
        // Arrange
        var inputDate = new DateOnly(inputYear, inputMonth, inputDay);
        var expectedDate = new DateOnly(expectedYear, expectedMonth, expectedDay);

        // Act
        var result = WeekHelper.WeekStartOf(inputDate);

        // Assert
        Assert.Equal(expectedDate, result);
    }

    [Fact]
    public void CurrentWeekStart_ShouldReturnMonday()
    {
        // Act
        var result = WeekHelper.CurrentWeekStart();

        // Assert
        Assert.Equal(DayOfWeek.Monday, result.DayOfWeek);
    }
}
