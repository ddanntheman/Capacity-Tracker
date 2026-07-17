using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class SprintKDeliveryEtc : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "ChangeOrders",
            columns: table => new
            {
                ChangeOrderId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Title = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                Notes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                DeltaHours = table.Column<decimal>(type: "decimal(9,2)", precision: 9, scale: 2, nullable: false),
                DeltaFees = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                Status = table.Column<int>(type: "int", nullable: false),
                EngagementDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                CreatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                ApprovedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                ApprovedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_ChangeOrders", x => x.ChangeOrderId);
                table.ForeignKey(
                    name: "FK_ChangeOrders_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "EtcOverrides",
            columns: table => new
            {
                EtcOverrideId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Hours = table.Column<decimal>(type: "decimal(9,2)", precision: 9, scale: 2, nullable: false),
                Fees = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                Justification = table.Column<string>(type: "nvarchar(2000)", maxLength: 2000, nullable: false),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                CreatedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                ClearedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                ClearedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_EtcOverrides", x => x.EtcOverrideId);
                table.ForeignKey(
                    name: "FK_EtcOverrides_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "LineActuals",
            columns: table => new
            {
                LineActualId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PlanLineItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                Hours = table.Column<decimal>(type: "decimal(6,2)", precision: 6, scale: 2, nullable: false),
                HardCost = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                Source = table.Column<int>(type: "int", nullable: false),
                EnteredAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                EnteredBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_LineActuals", x => x.LineActualId);
                table.ForeignKey(
                    name: "FK_LineActuals_PlanLineItems_PlanLineItemId",
                    column: x => x.PlanLineItemId,
                    principalTable: "PlanLineItems",
                    principalColumn: "PlanLineItemId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "RecoverableExpenseEntries",
            columns: table => new
            {
                RecoverableExpenseEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                Vendor = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                Amount = table.Column<decimal>(type: "decimal(12,2)", precision: 12, scale: 2, nullable: false),
                Notes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                EnteredAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                EnteredBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_RecoverableExpenseEntries", x => x.RecoverableExpenseEntryId);
                table.ForeignKey(
                    name: "FK_RecoverableExpenseEntries_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_ChangeOrders_ProjectId",
            table: "ChangeOrders",
            column: "ProjectId");

        migrationBuilder.CreateIndex(
            name: "IX_EtcOverrides_ProjectId",
            table: "EtcOverrides",
            column: "ProjectId");

        migrationBuilder.CreateIndex(
            name: "IX_LineActuals_PlanLineItemId_WeekStart",
            table: "LineActuals",
            columns: ["PlanLineItemId", "WeekStart"],
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_RecoverableExpenseEntries_ProjectId_PeriodStart",
            table: "RecoverableExpenseEntries",
            columns: ["ProjectId", "PeriodStart"]);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "ChangeOrders");

        migrationBuilder.DropTable(
            name: "EtcOverrides");

        migrationBuilder.DropTable(
            name: "LineActuals");

        migrationBuilder.DropTable(
            name: "RecoverableExpenseEntries");
    }
}
