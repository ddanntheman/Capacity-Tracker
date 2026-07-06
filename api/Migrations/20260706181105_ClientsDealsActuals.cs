using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class ClientsDealsActuals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "DealValue",
                table: "Projects",
                type: "decimal(12,2)",
                precision: 12,
                scale: 2,
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "DeliveryLeadId",
                table: "Projects",
                type: "uniqueidentifier",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "EngagementType",
                table: "Projects",
                type: "nvarchar(64)",
                maxLength: 64,
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Notes",
                table: "Projects",
                type: "nvarchar(4000)",
                maxLength: 4000,
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "WinProbability",
                table: "Projects",
                type: "int",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "Actuals",
                columns: table => new
                {
                    ActualHoursId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Month = table.Column<DateOnly>(type: "date", nullable: false),
                    ChargeableHours = table.Column<decimal>(type: "decimal(7,2)", precision: 7, scale: 2, nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Actuals", x => x.ActualHoursId);
                    table.ForeignKey(
                        name: "FK_Actuals_People_PersonId",
                        column: x => x.PersonId,
                        principalTable: "People",
                        principalColumn: "PersonId",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "Clients",
                columns: table => new
                {
                    ClientId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                    Name = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                    Industry = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: true),
                    RelationshipPartner = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                    Notes = table.Column<string>(type: "nvarchar(4000)", maxLength: 4000, nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Clients", x => x.ClientId);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Projects_DeliveryLeadId",
                table: "Projects",
                column: "DeliveryLeadId");

            migrationBuilder.CreateIndex(
                name: "IX_Actuals_PersonId_Month",
                table: "Actuals",
                columns: new[] { "PersonId", "Month" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_Clients_Name",
                table: "Clients",
                column: "Name",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_Projects_People_DeliveryLeadId",
                table: "Projects",
                column: "DeliveryLeadId",
                principalTable: "People",
                principalColumn: "PersonId");

            // Seed client records from existing project client names.
            migrationBuilder.Sql(
                "INSERT INTO [Clients] ([ClientId], [Name]) SELECT NEWID(), [ClientName] FROM (SELECT DISTINCT [ClientName] FROM [Projects]) d;");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_Projects_People_DeliveryLeadId",
                table: "Projects");

            migrationBuilder.DropTable(
                name: "Actuals");

            migrationBuilder.DropTable(
                name: "Clients");

            migrationBuilder.DropIndex(
                name: "IX_Projects_DeliveryLeadId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "DealValue",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "DeliveryLeadId",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "EngagementType",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "Notes",
                table: "Projects");

            migrationBuilder.DropColumn(
                name: "WinProbability",
                table: "Projects");
        }
    }
}
