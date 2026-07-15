using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class SprintJWinConversionRevenue : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "WonAtUtc",
                table: "PricingPlans",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "WonBy",
                table: "PricingPlans",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "EngagementDocuments",
                columns: table => new
                {
                    EngagementDocumentId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Kind = table.Column<int>(type: "int", nullable: false),
                    FileName = table.Column<string>(type: "nvarchar(512)", maxLength: 512, nullable: false),
                    ContentType = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Content = table.Column<byte[]>(type: "varbinary(max)", nullable: false),
                    SizeBytes = table.Column<long>(type: "bigint", nullable: false),
                    UploadedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false),
                    UploadedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EngagementDocuments", x => x.EngagementDocumentId);
                    table.ForeignKey(
                        name: "FK_EngagementDocuments_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "ProjectId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RevenuePhases",
                columns: table => new
                {
                    RevenuePhaseId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PricingPlanId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Layer = table.Column<int>(type: "int", nullable: false),
                    PeriodStart = table.Column<DateOnly>(type: "date", nullable: false),
                    Amount = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                    IsInferred = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RevenuePhases", x => x.RevenuePhaseId);
                    table.ForeignKey(
                        name: "FK_RevenuePhases_PricingPlans_PricingPlanId",
                        column: x => x.PricingPlanId,
                        principalTable: "PricingPlans",
                        principalColumn: "PricingPlanId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "RevenueSetups",
                columns: table => new
                {
                    RevenueSetupId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    FeeStructure = table.Column<int>(type: "int", nullable: false),
                    Tcv = table.Column<decimal>(type: "decimal(14,2)", precision: 14, scale: 2, nullable: false),
                    ContractRph = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    InvoiceFrequency = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: true),
                    InvoiceScheduleNotes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true),
                    IsInferred = table.Column<bool>(type: "bit", nullable: false),
                    Confirmed = table.Column<bool>(type: "bit", nullable: false),
                    ConfirmedBy = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    ConfirmedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: true),
                    UpdatedAtUtc = table.Column<DateTime>(type: "datetime2", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RevenueSetups", x => x.RevenueSetupId);
                    table.ForeignKey(
                        name: "FK_RevenueSetups_Projects_ProjectId",
                        column: x => x.ProjectId,
                        principalTable: "Projects",
                        principalColumn: "ProjectId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EngagementDocuments_ProjectId",
                table: "EngagementDocuments",
                column: "ProjectId");

            migrationBuilder.CreateIndex(
                name: "IX_RevenuePhases_PricingPlanId_Layer_PeriodStart",
                table: "RevenuePhases",
                columns: new[] { "PricingPlanId", "Layer", "PeriodStart" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_RevenueSetups_ProjectId",
                table: "RevenueSetups",
                column: "ProjectId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "EngagementDocuments");

            migrationBuilder.DropTable(
                name: "RevenuePhases");

            migrationBuilder.DropTable(
                name: "RevenueSetups");

            migrationBuilder.DropColumn(
                name: "WonAtUtc",
                table: "PricingPlans");

            migrationBuilder.DropColumn(
                name: "WonBy",
                table: "PricingPlans");
        }
    }
}
