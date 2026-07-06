using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class AllocationHours : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "PercentAllocated",
                table: "Allocations");

            migrationBuilder.AddColumn<decimal>(
                name: "Hours",
                table: "Allocations",
                type: "decimal(6,2)",
                precision: 6,
                scale: 2,
                nullable: false,
                defaultValue: 0m);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Hours",
                table: "Allocations");

            migrationBuilder.AddColumn<int>(
                name: "PercentAllocated",
                table: "Allocations",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }
    }
}
