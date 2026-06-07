using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class AuditFunctions(CapacityDbContext db, RequestAuthorizer auth)
{
    /// <summary>Append-only audit log, filterable by date range and entity (Leadership only).</summary>
    [Function("ListAuditLog")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "audit")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;

        var query = db.AuditLogs.AsNoTracking().AsQueryable();

        if (DateTime.TryParse(req.Query["from"], out var from))
        {
            var fromUtc = DateTime.SpecifyKind(from, DateTimeKind.Utc);
            query = query.Where(a => a.ChangedAt >= fromUtc);
        }
        if (DateTime.TryParse(req.Query["to"], out var to))
        {
            var toUtc = DateTime.SpecifyKind(to, DateTimeKind.Utc);
            query = query.Where(a => a.ChangedAt <= toUtc);
        }
        if (!string.IsNullOrWhiteSpace(req.Query["entityType"]))
        {
            var et = req.Query["entityType"].ToString();
            query = query.Where(a => a.EntityType == et);
        }
        if (!string.IsNullOrWhiteSpace(req.Query["entityId"]))
        {
            var id = req.Query["entityId"].ToString();
            query = query.Where(a => a.EntityId == id);
        }

        var take = int.TryParse(req.Query["take"], out var t) ? Math.Clamp(t, 1, 500) : 200;

        var rows = await query
            .OrderByDescending(a => a.ChangedAt)
            .Take(take)
            .Select(a => new
            {
                a.AuditLogId,
                a.EntityType,
                a.EntityId,
                a.FieldChanged,
                a.OldValue,
                a.NewValue,
                a.ChangedBy,
                changedAt = a.ChangedAt,
            })
            .ToListAsync();

        return new OkObjectResult(rows);
    }
}
