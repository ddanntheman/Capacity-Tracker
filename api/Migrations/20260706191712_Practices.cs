using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class Practices : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "Practices",
            columns: table => new
            {
                PracticeId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Name = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                LeadId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                DefaultUtilizationTarget = table.Column<int>(type: "int", nullable: true),
                IsArchived = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Practices", x => x.PracticeId);
                table.ForeignKey(
                    name: "FK_Practices_People_LeadId",
                    column: x => x.LeadId,
                    principalTable: "People",
                    principalColumn: "PersonId");
            });

        migrationBuilder.CreateIndex(
            name: "IX_Practices_LeadId",
            table: "Practices",
            column: "LeadId");

        migrationBuilder.CreateIndex(
            name: "IX_Practices_Name",
            table: "Practices",
            column: "Name",
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Practices");
    }
}
