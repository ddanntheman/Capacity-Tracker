using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Snapshots a project's staffing plan as the locked, immutable Original Plan
/// baseline when a pursuit is won (CW-01/02).
/// </summary>
public class BaselineService(CapacityDbContext db, AuditService audit)
{
    /// <summary>Locks the current allocations as the baseline. Caller must SaveChanges.</summary>
    public async Task LockBaseline(Project project, CurrentUser user)
    {
        var lines = await db.Allocations.AsNoTracking()
            .Where(a => a.ProjectId == project.ProjectId && a.Hours > 0)
            .Join(db.People.AsNoTracking(), a => a.PersonId, p => p.PersonId, (a, p) => new ProjectBaselineLine
            {
                ProjectBaselineLineId = Guid.NewGuid(),
                ProjectId = project.ProjectId,
                PersonId = a.PersonId,
                PersonName = p.DisplayName,
                IsPlaceholder = p.IsPlaceholder,
                WeekStart = a.WeekStart,
                Hours = a.Hours,
            })
            .ToListAsync();

        db.ProjectBaselineLines.AddRange(lines);
        project.BaselineLockedAtUtc = DateTime.UtcNow;
        project.BaselineLockedBy = user.Email;
        audit.Record(nameof(Project), project.ProjectId.ToString(), "baselineLocked", null,
            $"{lines.Count} plan line(s), {lines.Sum(l => l.Hours)}h", user.Oid);
    }
}
