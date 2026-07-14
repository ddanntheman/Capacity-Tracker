using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CapacityTracker.Api.Migrations
{
    /// <inheritdoc />
    public partial class ProfileDepthFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Certifications",
                table: "People",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "IndustryExperience",
                table: "People",
                type: "nvarchar(max)",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "StaffingPreferences",
                table: "People",
                type: "nvarchar(max)",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Certifications",
                table: "People");

            migrationBuilder.DropColumn(
                name: "IndustryExperience",
                table: "People");

            migrationBuilder.DropColumn(
                name: "StaffingPreferences",
                table: "People");
        }
    }
}
