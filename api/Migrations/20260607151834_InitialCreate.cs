using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations;

/// <inheritdoc />
public partial class InitialCreate : Migration
{
    /// <inheritdoc />
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.CreateTable(
            name: "AuditLogs",
            columns: table => new
            {
                AuditLogId = table.Column<long>(type: "bigint", nullable: false)
                    .Annotation("SqlServer:Identity", "1, 1"),
                EntityType = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                EntityId = table.Column<string>(type: "nvarchar(64)", maxLength: 64, nullable: false),
                FieldChanged = table.Column<string>(type: "nvarchar(128)", maxLength: 128, nullable: false),
                OldValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                NewValue = table.Column<string>(type: "nvarchar(max)", nullable: true),
                ChangedBy = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ChangedAt = table.Column<DateTime>(type: "datetime2", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_AuditLogs", x => x.AuditLogId);
            });

        migrationBuilder.CreateTable(
            name: "People",
            columns: table => new
            {
                PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                DisplayName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                Email = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                JobTitle = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: true),
                ManagerId = table.Column<Guid>(type: "uniqueidentifier", nullable: true),
                IsActive = table.Column<bool>(type: "bit", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_People", x => x.PersonId);
                table.ForeignKey(
                    name: "FK_People_People_ManagerId",
                    column: x => x.ManagerId,
                    principalTable: "People",
                    principalColumn: "PersonId");
            });

        migrationBuilder.CreateTable(
            name: "Projects",
            columns: table => new
            {
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ClientName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                ProjectName = table.Column<string>(type: "nvarchar(256)", maxLength: 256, nullable: false),
                StartDate = table.Column<DateOnly>(type: "date", nullable: false),
                EndDate = table.Column<DateOnly>(type: "date", nullable: true),
                Status = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Projects", x => x.ProjectId);
            });

        migrationBuilder.CreateTable(
            name: "Allocations",
            columns: table => new
            {
                AllocationId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                PersonId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                ProjectId = table.Column<Guid>(type: "uniqueidentifier", nullable: false),
                WeekStart = table.Column<DateOnly>(type: "date", nullable: false),
                PercentAllocated = table.Column<int>(type: "int", nullable: false)
            },
            constraints: table =>
            {
                table.PrimaryKey("PK_Allocations", x => x.AllocationId);
                table.ForeignKey(
                    name: "FK_Allocations_People_PersonId",
                    column: x => x.PersonId,
                    principalTable: "People",
                    principalColumn: "PersonId",
                    onDelete: ReferentialAction.Cascade);
                table.ForeignKey(
                    name: "FK_Allocations_Projects_ProjectId",
                    column: x => x.ProjectId,
                    principalTable: "Projects",
                    principalColumn: "ProjectId",
                    onDelete: ReferentialAction.Cascade);
            });

        migrationBuilder.CreateIndex(
            name: "IX_Allocations_PersonId_ProjectId_WeekStart",
            table: "Allocations",
            columns: ["PersonId", "ProjectId", "WeekStart"],
            unique: true);

        migrationBuilder.CreateIndex(
            name: "IX_Allocations_ProjectId",
            table: "Allocations",
            column: "ProjectId");

        migrationBuilder.CreateIndex(
            name: "IX_Allocations_WeekStart",
            table: "Allocations",
            column: "WeekStart");

        migrationBuilder.CreateIndex(
            name: "IX_AuditLogs_ChangedAt",
            table: "AuditLogs",
            column: "ChangedAt");

        migrationBuilder.CreateIndex(
            name: "IX_AuditLogs_EntityType_EntityId",
            table: "AuditLogs",
            columns: ["EntityType", "EntityId"]);

        migrationBuilder.CreateIndex(
            name: "IX_People_Email",
            table: "People",
            column: "Email");

        migrationBuilder.CreateIndex(
            name: "IX_People_ManagerId",
            table: "People",
            column: "ManagerId");
    }

    /// <inheritdoc />
    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(
            name: "Allocations");

        migrationBuilder.DropTable(
            name: "AuditLogs");

        migrationBuilder.DropTable(
            name: "People");

        migrationBuilder.DropTable(
            name: "Projects");
    }
}
