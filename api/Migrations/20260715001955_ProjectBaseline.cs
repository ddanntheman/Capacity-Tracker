using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProjectBaseline : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "BaselineLockedAtUtc",
                table: "Projects",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "BaselineLockedBy",
                table: "Projects",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "ProjectBaselineLines",
                columns: table => new
                {
                    ProjectBaselineLineId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PersonName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    IsPlaceholder = table.Column<bool>(type: "bit", nullable: false),
                    WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Hours = table.Column<decimal>(type: "decimal(6,2)", precision: 6, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ProjectBaselineLines", x => x.ProjectBaselineLineId);
                    table.ForeignKey(
                        name: "FK_ProjectBaselineLines_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "ProjectId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_ProjectBaselineLines_ProjectId",
                table: "ProjectBaselineLines",
                column: "ProjectId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "ProjectBaselineLines");

            migrationBuilder.DropColumn(
                name: "BaselineLockedAtUtc",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "BaselineLockedBy",
                table: "Projects");
        }
    }
}
