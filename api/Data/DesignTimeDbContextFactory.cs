using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace CapacityTracker.Api.Data;

/// <summary>
/// Lets `dotnet ef migrations` build the context without starting the Functions
/// host. The connection string is only used for design-time scaffolding; runtime
/// configuration comes from app settings / Key Vault.
/// </summary>
public class DesignTimeDbContextFactory : IDesignTimeDbContextFactory<CapacityDbContext>
{
    public CapacityDbContext CreateDbContext(string[] args)
    {
        var connectionString = Environment.GetEnvironmentVariable("SqlConnectionString")
            ?? "Server=localhost,1433;Database=capacity;User Id=sa;Password=Your_password123;TrustServerCertificate=true;";

        var options = new DbContextOptionsBuilder<CapacityDbContext>()
            .UseSqlServer(connectionString, sql => sql.MigrationsAssembly(typeof(CapacityDbContext).Assembly.GetName().Name))
            .Options;

        return new CapacityDbContext(options);
    }
}
