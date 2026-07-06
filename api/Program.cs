using Azure.Monitor.OpenTelemetry.Exporter;
using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Services;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.Builder;
using Microsoft.Azure.Functions.Worker.OpenTelemetry;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using OpenTelemetry;

var builder = FunctionsApplication.CreateBuilder(args);

builder.ConfigureFunctionsWebApplication();

var otel = builder.Services.AddOpenTelemetry()
    .UseFunctionsWorkerDefaults();

// Only wire the Azure Monitor exporter when a connection string is configured
// (it is in Azure via App Insights, but absent for local development).
if (!string.IsNullOrWhiteSpace(builder.Configuration["APPLICATIONINSIGHTS_CONNECTION_STRING"]))
{
    otel.UseAzureMonitorExporter();
}

var connectionString =
    builder.Configuration["SqlConnectionString"]
    ?? builder.Configuration.GetConnectionString("Sql")
    ?? throw new InvalidOperationException("SqlConnectionString is not configured.");

builder.Services.AddDbContext<CapacityDbContext>(options =>
    options.UseSqlServer(connectionString, sql => sql.EnableRetryOnFailure()));

builder.Services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
builder.Services.AddScoped<RequestAuthorizer>();
builder.Services.AddScoped<AuditService>();

builder.Build().Run();
