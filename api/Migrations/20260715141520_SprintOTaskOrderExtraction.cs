using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class SprintOTaskOrderExtraction : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "TaskOrderExtractions",
            columns: table => new
            {
                TaskOrderExtractionId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                EngagementDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                FileName = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                FeeStructure = table.Column<int>(type: "int", nullable: true),
                Tcv = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: true),
                ContractRph = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                InvoiceFrequency = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                Evidence = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                CreatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                AppliedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                AppliedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_TaskOrderExtractions", x => x.TaskOrderExtractionId);
                table.ForeignKey(
                    name: "FK_TaskOrderExtractions_EngagementDocuments_EngagementDocumentId",
                    column: x => x.EngagementDocumentId,
                    principalTable: "EngagementDocuments",
                    principalColumn: "EngagementDocumentId");
                table.ForeignKey(
                    name: "FK_TaskOrderExtractions_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_TaskOrderExtractions_EngagementDocumentId",
            table: "TaskOrderExtractions",
            column: "EngagementDocumentId");

        migrationBuilder.CreateIndex(
            name: "IX_TaskOrderExtractions_ProjectId",
            table: "TaskOrderExtractions",
            column: "ProjectId");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "TaskOrderExtractions");
    }
}
