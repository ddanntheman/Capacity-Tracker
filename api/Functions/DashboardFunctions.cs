using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class DashboardFunctions(CapacityDbContext db, RequestAuthorizer auth)
{
    /// <summary>Current-week capacity summary (Leadership only).</summary>
    [Function("DashboardSummary")]
    public async Task<IActionResult> Summary(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/summary")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();

        var people = await db.People.AsNoTracking()
            .Where(p => p.IsActive && !p.IsPlaceholder)
            .Select(p => new { p.PersonId, p.WeeklyCapacityHours })
            .ToListAsync();
        var perPerson = await db.Allocations
            .Where(a => a.WeekStart == weekStart)
            .GroupBy(a => a.PersonId)
            .Select(g => new { PersonId = g.Key, Hours = g.Sum(a => a.Hours) })
            .ToDictionaryAsync(x => x.PersonId, x => x.Hours);

        var peopleIds = people.Select(p => p.PersonId).ToHashSet();
        var availableHours = people.Sum(p => HolidayHelper.CapacityForWeek(weekStart, p.WeeklyCapacityHours));
        var allocatedHours = perPerson.Where(kv => peopleIds.Contains(kv.Key)).Sum(kv => kv.Value);
        var utilizationRate = availableHours == 0 ? 0 : Math.Round((double)allocatedHours / availableHours * 100, 1);
        var totals = people.Select(p => new
        {
            booked = perPerson.TryGetValue(p.PersonId, out var h) ? h : 0,
            capacity = HolidayHelper.CapacityForWeek(weekStart, p.WeeklyCapacityHours),
        }).ToList();

        return new OkObjectResult(new
        {
            weekStart = weekStart.ToString("yyyy-MM-dd"),
            peopleCount = people.Count,
            availableHours,
            allocatedHours,
            utilizationRate,
            fullyAllocated = totals.Count(t => t.booked == t.capacity),
            overAllocated = totals.Count(t => t.booked > t.capacity),
            underutilized = totals.Count(t => t.booked < t.capacity),
        });
    }

    /// <summary>Forward-looking utilization for the next N weeks (Leadership only).</summary>
    [Function("DashboardUtilization")]
    public async Task<IActionResult> Utilization(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/utilization")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();
        var weeks = int.TryParse(req.Query["weeks"], out var n) ? Math.Clamp(n, 1, 26) : 6;
        var end = weekStart.AddDays(7 * weeks);

        var activePeople = await db.People.Where(p => p.IsActive && !p.IsPlaceholder).ToListAsync();
        var activeIds = activePeople.Select(p => p.PersonId).ToHashSet();

        var rows = (await db.Allocations
            .Where(a => a.WeekStart >= weekStart && a.WeekStart < end)
            .ToListAsync())
            .Where(a => activeIds.Contains(a.PersonId))
            .ToList();

        var byWeek = Enumerable.Range(0, weeks).Select(i =>
        {
            var ws = weekStart.AddDays(7 * i);
            var total = rows.Where(a => a.WeekStart == ws).Sum(a => a.Hours);
            var capacity = (double)activePeople.Sum(p => HolidayHelper.CapacityForWeek(ws, p.WeeklyCapacityHours));
            return new
            {
                weekStart = ws.ToString("yyyy-MM-dd"),
                allocatedHours = total,
                utilizationRate = capacity == 0 ? 0 : Math.Round((double)total / capacity * 100, 1),
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
                allocatedHours = g.Sum(a => a.Hours),
            })
            .OrderByDescending(x => x.allocatedHours)
            .ToList();

        return new OkObjectResult(new { byWeek, byProject, peopleCount = activePeople.Count });
    }

    /// <summary>Drill-down: a single person's allocations across the visible range.</summary>
    [Function("DashboardPerson")]
    public async Task<IActionResult> Person(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "dashboard/person/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var weekStart = DateOnly.TryParse(req.Query["weekStart"], out var w) ? w : WeekHelper.CurrentWeekStart();
        var weeks = int.TryParse(req.Query["weeks"], out var n) ? Math.Clamp(n, 1, 26) : 6;
        var end = weekStart.AddDays(7 * weeks);

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null)
        {
            return new NotFoundResult();
        }

        var allocations = await db.Allocations.AsNoTracking()
            .Where(a => a.PersonId == id && a.WeekStart >= weekStart && a.WeekStart < end)
            .Join(db.Projects, a => a.ProjectId, p => p.ProjectId, (a, p) => new
            {
                a.AllocationId,
                a.ProjectId,
                projectName = $"{p.ClientName} — {p.ProjectName}",
                weekStart = a.WeekStart.ToString("yyyy-MM-dd"),
                a.Hours,
            })
            .ToListAsync();

        return new OkObjectResult(new { person.PersonId, person.DisplayName, allocations });
    }
}
