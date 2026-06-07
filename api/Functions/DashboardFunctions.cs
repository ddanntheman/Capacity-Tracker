using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class DashboardFunctions(CapacityDbContext db, RequestAuthorizer auth)
{
    private const int HoursPerWeek = 40;

    /// <summary>Current-week capacity summary (Leadership only).</summary>
    [Function("DashboardSummary")]
    public async Task<IActionResult> Summary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/summary")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();

        var activePeople = await db.People.CountAsync(p => p.IsActive);
        var perPerson = await db.Allocations
            .Where(a => a.WeekStart == weekStart)
            .GroupBy(a => a.PersonId)
            .Select(g => g.Sum(a => a.PercentAllocated))
            .ToListAsync();

        var totalAllocatedPercent = perPerson.Sum();
        var availableHours = activePeople * HoursPerWeek;
        var allocatedHours = Math.Round(totalAllocatedPercent / 100.0 * HoursPerWeek, 1);
        var utilizationRate = availableHours == 0 ? 0 : Math.Round((double)allocatedHours / availableHours * 100, 1);

        return new OkObjectResult(new
        {
            weekStart = weekStart.ToString("yyyy-MM-dd"),
            peopleCount = activePeople,
            availableHours,
            allocatedHours,
            utilizationRate,
            fullyAllocated = perPerson.Count(t => t == 100),
            overAllocated = perPerson.Count(t => t > 100),
            underutilized = activePeople - perPerson.Count(t => t >= 100),
        });
    }

    /// <summary>Forward-looking utilization for the next N weeks (Leadership only).</summary>
    [Function("DashboardUtilization")]
    public async Task<IActionResult> Utilization(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/utilization")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();
        var weeks = int.TryParse(req.Query["weeks"], out var n) ? Math.Clamp(n, 1, 26) : 6;
        var end = weekStart.AddDays(7 * weeks);

        var activePeople = await db.People.CountAsync(p => p.IsActive);
        var capacity = activePeople * 100.0;

        var rows = await db.Allocations
            .Where(a => a.WeekStart >= weekStart && a.WeekStart < end)
            .ToListAsync();

        var byWeek = Enumerable.Range(0, weeks).Select(i =>
        {
            var ws = weekStart.AddDays(7 * i);
            var total = rows.Where(a => a.WeekStart == ws).Sum(a => a.PercentAllocated);
            return new
            {
                weekStart = ws.ToString("yyyy-MM-dd"),
                allocatedPercent = total,
                utilizationRate = capacity == 0 ? 0 : Math.Round(total / capacity * 100, 1),
            };
        }).ToList();

        var projectIds = rows.Select(a => a.ProjectId).Distinct().ToList();
        var projectNames = await db.Projects.Where(p => projectIds.Contains(p.ProjectId))
            .ToDictionaryAsync(p => p.ProjectId, p => $"{p.ClientName} — {p.ProjectName}");

        var byProject = rows.GroupBy(a => a.ProjectId)
            .Select(g => new
            {
                projectId = g.Key,
                projectName = projectNames.TryGetValue(g.Key, out var name) ? name : g.Key.ToString(),
                allocatedPercent = g.Sum(a => a.PercentAllocated),
            })
            .OrderByDescending(x => x.allocatedPercent)
            .ToList();

        return new OkObjectResult(new { byWeek, byProject, peopleCount = activePeople });
    }

    /// <summary>Drill-down: a single person's allocations across the visible range.</summary>
    [Function("DashboardPerson")]
    public async Task<IActionResult> Person(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/person/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();
        var weeks = int.TryParse(req.Query["weeks"], out var n) ? Math.Clamp(n, 1, 26) : 6;
        var end = weekStart.AddDays(7 * weeks);

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null) return new NotFoundResult();

        var allocations = await db.Allocations.AsNoTracking()
            .Where(a => a.PersonId == id && a.WeekStart >= weekStart && a.WeekStart < end)
            .Join(db.Projects, a => a.ProjectId, p => p.ProjectId, (a, p) => new
            {
                a.AllocationId,
                a.ProjectId,
                projectName = $"{p.ClientName} — {p.ProjectName}",
                weekStart = a.WeekStart.ToString("yyyy-MM-dd"),
                a.PercentAllocated,
            })
            .ToListAsync();

        return new OkObjectResult(new { person.PersonId, person.DisplayName, allocations });
    }
}
