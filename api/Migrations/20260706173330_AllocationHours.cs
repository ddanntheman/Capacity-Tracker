using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class AllocationHours : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(
            name: "Hours",
            table: "Allocations",
            type: "decimal(6,2)",
            precision: 6,
            scale: 2,
            nullable: false,
            defaultValue: 0m);

        migrationBuilder.Sql(
            "UPDATE a SET a.Hours = CAST(a.PercentAllocated AS decimal(6,2)) / 100.0 * COALESCE(p.WeeklyCapacityHours, 40) " +
            "FROM Allocations a LEFT JOIN People p ON p.PersonId = a.PersonId;");

        migrationBuilder.DropColumn(
            name: "PercentAllocated",
            table: "Allocations");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<int>(
            name: "PercentAllocated",
            table: "Allocations",
            type: "int",
            nullable: false,
            defaultValue: 0);

        migrationBuilder.Sql(
            "UPDATE a SET a.PercentAllocated = CAST(ROUND(a.Hours * 100.0 / COALESCE(NULLIF(p.WeeklyCapacityHours, 0), 40), 0) AS int) " +
            "FROM Allocations a LEFT JOIN People p ON p.PersonId = a.PersonId;");

        migrationBuilder.DropColumn(
            name: "Hours",
            table: "Allocations");
    }
}
