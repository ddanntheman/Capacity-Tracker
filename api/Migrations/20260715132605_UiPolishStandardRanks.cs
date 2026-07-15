using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class UiPolishStandardRanks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "StandardRanks",
                columns: table => new
                {
                    StandardRankId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                    SortOrder = table.Column<int>(type: "int", nullable: false),
                    DefaultUtilizationTarget = table.Column<int>(type: "int", nullable: true),
                    IsArchived = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_StandardRanks", x => x.StandardRankId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_StandardRanks_Name",
                table: "StandardRanks",
                column: "Name",
                unique: true);

            // Seed the firm's standard ranks (previously hard-coded in the web app).
            var seed = new (string Name, int SortOrder, int? Target)[]
            {
                ("Analyst", 1, 85),
                ("Associate", 2, 85),
                ("Senior Associate", 3, 85),
                ("Consultant", 4, 85),
                ("Senior Consultant", 5, 80),
                ("Manager", 6, 80),
                ("Senior Manager", 7, 65),
                ("Director", 8, 40),
                ("Managing Director", 9, 20),
                ("Partner", 10, 20),
            };
            foreach (var (name, sortOrder, target) in seed)
            {
                migrationBuilder.InsertData(
                    table: "StandardRanks",
                    columns: new[] { "StandardRankId", "Name", "SortOrder", "DefaultUtilizationTarget", "IsArchived" },
                    values: new object?[] { Guid.NewGuid(), name, sortOrder, target, false });
            }
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "StandardRanks");
        }
    }
}
