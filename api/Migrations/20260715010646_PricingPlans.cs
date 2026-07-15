using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class PricingPlans : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.AddColumn<Guid>(
            name: "PlanLineItemId",
            table: "Allocations",
            type: "uniqueidentifier",
            nullable: true);

        migrationBuilder.CreateTable(
            name: "PricingPlans",
            columns: table => new
            {
                PricingPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                MdOwnerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                Practice = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                Status = table.Column<int>(type: "int", nullable: false),
                StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                EndDate = table.Column<DateOnly>(type: "date", nullable: false),
                PricingModel = table.Column<int>(type: "int", nullable: false),
                BlendedRate = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                FixedFee = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: true),
                TechnologyFees = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                RecoverableExpenses = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                Notes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                CreatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PricingPlans", x => x.PricingPlanId);
                table.ForeignKey(
                    name: "FK_PricingPlans_People_MdOwnerId",
                    column: x => x.MdOwnerId,
                    principalTable: "People",
                    principalColumn: "PersonId");
                table.ForeignKey(
                    name: "FK_PricingPlans_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "RateCardEntries",
            columns: table => new
            {
                RateCardEntryId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                Rank = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                Geography = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                EffectiveFrom = table.Column<DateOnly>(type: "date", nullable: false),
                CostRate = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                BillRate = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_RateCardEntries", x => x.RateCardEntryId);
            });

        migrationBuilder.CreateTable(
            name: "PlanLineItems",
            columns: table => new
            {
                PlanLineItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PricingPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                RoleTitle = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                Rank = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                Geography = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                Organization = table.Column<int>(type: "int", nullable: false),
                SubcontractorFirm = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                CostRateOverride = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                BillRateOverride = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                ClientRate = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                SortOrder = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PlanLineItems", x => x.PlanLineItemId);
                table.ForeignKey(
                    name: "FK_PlanLineItems_People_PersonId",
                    column: x => x.PersonId,
                    principalTable: "People",
                    principalColumn: "PersonId");
                table.ForeignKey(
                    name: "FK_PlanLineItems_PricingPlans_PricingPlanId",
                    column: x => x.PricingPlanId,
                    principalTable: "PricingPlans",
                    principalColumn: "PricingPlanId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateTable(
            name: "PlanWeekHours",
            columns: table => new
            {
                PlanWeekHoursId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PlanLineItemId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                Hours = table.Column<decimal>(type: "decimal(6,2)", precision: 6, scale: 2, nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_PlanWeekHours", x => x.PlanWeekHoursId);
                table.ForeignKey(
                    name: "FK_PlanWeekHours_PlanLineItems_PlanLineItemId",
                    column: x => x.PlanLineItemId,
                    principalTable: "PlanLineItems",
                    principalColumn: "PlanLineItemId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_PlanLineItems_PersonId",
            table: "PlanLineItems",
            column: "PersonId");

        migrationBuilder.CreateIndex(
            name: "IX_PlanLineItems_PricingPlanId",
            table: "PlanLineItems",
            column: "PricingPlanId");

        migrationBuilder.CreateIndex(
            name: "IX_PlanWeekHours_PlanLineItemId_WeekStart",
            table: "PlanWeekHours",
            columns: ["PlanLineItemId", "WeekStart"],
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_PricingPlans_MdOwnerId",
            table: "PricingPlans",
            column: "MdOwnerId");

        migrationBuilder.CreateIndex(
            name: "IX_PricingPlans_ProjectId",
            table: "PricingPlans",
            column: "ProjectId");

        migrationBuilder.CreateIndex(
            name: "IX_RateCardEntries_Rank_Geography_EffectiveFrom",
            table: "RateCardEntries",
            columns: ["Rank", "Geography", "EffectiveFrom"],
            unique: true);
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "PlanWeekHours");

        migrationBuilder.DropTable(
            name: "RateCardEntries");

        migrationBuilder.DropTable(
            name: "PlanLineItems");

        migrationBuilder.DropTable(
            name: "PricingPlans");

        migrationBuilder.DropColumn(
            name: "PlanLineItemId",
            table: "Allocations");
    }
}
