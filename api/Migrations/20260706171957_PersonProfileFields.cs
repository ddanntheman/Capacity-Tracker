using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class PersonProfileFields : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<decimal>(
            name: "BillRate",
            table: "People",
            type: "decimal(10,2)",
            precision: 10,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<decimal>(
            name: "CostRate",
            table: "People",
            type: "decimal(10,2)",
            precision: 10,
            scale: 2,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Location",
            table: "People",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Notes",
            table: "People",
            type: "nvarchar(4000)",
            maxLength: 4000,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Phone",
            table: "People",
            type: "nvarchar(32)",
            maxLength: 32,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Practice",
            table: "People",
            type: "nvarchar(128)",
            maxLength: 128,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Rank",
            table: "People",
            type: "nvarchar(64)",
            maxLength: 64,
            nullable: true);

        migrationBuilder.AddColumn<string>(
            name: "Skills",
            table: "People",
            type: "nvarchar(1024)",
            maxLength: 1024,
            nullable: true);

        migrationBuilder.AddColumn<DateOnly>(
            name: "StartDate",
            table: "People",
            type: "date",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "UtilizationTarget",
            table: "People",
            type: "int",
            nullable: true);

        migrationBuilder.AddColumn<int>(
            name: "WeeklyCapacityHours",
            table: "People",
            type: "int",
            nullable: false,
            defaultValue: 0);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropColumn(
            name: "BillRate",
            table: "People");

        migrationBuilder.DropColumn(
            name: "CostRate",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Location",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Notes",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Phone",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Practice",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Rank",
            table: "People");

        migrationBuilder.DropColumn(
            name: "Skills",
            table: "People");

        migrationBuilder.DropColumn(
            name: "StartDate",
            table: "People");

        migrationBuilder.DropColumn(
            name: "UtilizationTarget",
            table: "People");

        migrationBuilder.DropColumn(
            name: "WeeklyCapacityHours",
            table: "People");
    }
}
