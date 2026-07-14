using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Realtime;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.SignalRService;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class AllocationsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    private const decimal MaxWeeklyHours = 168;

    /// <summary>
    /// Returns allocations across a window of weeks. Viewers see only their own
    /// rows; editors and leadership see everyone (optionally filtered by person).
    /// </summary>
    [Function("ListAllocations")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "allocations")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var user = result.User!;

        if (!TryParseWeek(req.Query["weekStart"], out var weekStart))
        {
            weekStart = WeekHelper.CurrentWeekStart();
        }
        var weeks = ParseInt(req.Query["weeks"], 6, 1, 52);
        var end = weekStart.AddDays(7 * weeks);

        var query = db.Allocations.AsNoTracking()
            .Where(a => a.WeekStart >= weekStart && a.WeekStart < end);

        // Viewers are limited to their own allocations.
        if (!user.HasRole(AppRoles.Editor) && !user.HasRole(AppRoles.Leadership))
        {
            query = query.Where(a => a.PersonId == user.Oid);
        }
        else if (Guid.TryParse(req.Query["personId"], out var personId))
        {
            query = query.Where(a => a.PersonId == personId);
        }

        var allocations = await query.Select(a => AllocationDto.From(a)).ToListAsync();
        return new OkObjectResult(allocations);
    }

    [Function("UpsertAllocation")]
    public async Task<AllocationWriteOutput> Upsert(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "allocations")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return Http(result.Error!);
        }

        var body = await req.ReadFromJsonAsync<UpsertAllocationRequest>();
        if (body is null)
        {
            return Http(new BadRequestResult());
        }

        if (body.Hours is < 0 or > MaxWeeklyHours)
        {
            return Http(new BadRequestObjectResult(new { error = $"Hours must be between 0 and {MaxWeeklyHours}." }));
        }

        // Normalize to the Monday of the week so the (PersonId, ProjectId, WeekStart)
        // grain holds regardless of which weekday the caller supplies.
        var weekStart = WeekHelper.WeekStartOf(body.WeekStart);

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == body.PersonId && p.IsActive);
        var projectOpen = await db.Projects.AnyAsync(p => p.ProjectId == body.ProjectId && p.Status != ProjectStatus.Closed);
        if (person is null)
        {
            return Http(new BadRequestObjectResult(new { error = "Unknown or inactive person." }));
        }

        if (!projectOpen)
        {
            return Http(new BadRequestObjectResult(new { error = "Project is closed or does not exist." }));
        }

        var existing = await db.Allocations.FirstOrDefaultAsync(a =>
            a.PersonId == body.PersonId && a.ProjectId == body.ProjectId && a.WeekStart == weekStart);

        // A zero-hour upsert removes the row.
        if (body.Hours == 0)
        {
            if (existing is null)
            {
                return Http(new NoContentResult());
            }

            db.Allocations.Remove(existing);
            audit.Record(nameof(Allocation), existing.AllocationId.ToString(), nameof(Allocation.Hours), existing.Hours.ToString(), "0 (removed)", result.User!.Oid);
            await db.SaveChangesAsync();
            return Broadcast("removed", existing);
        }

        var otherTotal = await db.Allocations
            .Where(a => a.PersonId == body.PersonId && a.WeekStart == weekStart
                && (existing == null || a.AllocationId != existing.AllocationId))
            .SumAsync(a => (decimal?)a.Hours) ?? 0;

        var newTotal = otherTotal + body.Hours;

        Allocation allocation;
        if (existing is null)
        {
            allocation = new Allocation
            {
                AllocationId = Guid.NewGuid(),
                PersonId = body.PersonId,
                ProjectId = body.ProjectId,
                WeekStart = weekStart,
                Hours = body.Hours,
            };
            db.Allocations.Add(allocation);
            audit.Record(nameof(Allocation), allocation.AllocationId.ToString(), "created", null, body.Hours.ToString(), result.User!.Oid);
        }
        else
        {
            allocation = existing;
            audit.Record(nameof(Allocation), allocation.AllocationId.ToString(), nameof(Allocation.Hours), allocation.Hours.ToString(), body.Hours.ToString(), result.User!.Oid);
            allocation.Hours = body.Hours;
        }

        await db.SaveChangesAsync();
        return Broadcast(existing is null ? "created" : "updated", allocation, newTotal, person.WeeklyCapacityHours);
    }

    /// <summary>
    /// Staffs a person on a project across a run of weeks at a constant
    /// hours/week, replacing any existing rows for those weeks. Zero hours
    /// clears the range.
    /// </summary>
    [Function("RangeUpsertAllocations")]
    public async Task<RangeAllocationWriteOutput> RangeUpsert(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "allocations/range")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return RangeHttp(result.Error!);
        }

        var body = await req.ReadFromJsonAsync<RangeUpsertAllocationRequest>();
        if (body is null)
        {
            return RangeHttp(new BadRequestResult());
        }

        if (body.Weeks is < 1 or > 52)
        {
            return RangeHttp(new BadRequestObjectResult(new { error = "Weeks must be between 1 and 52." }));
        }

        if (body.HoursPerWeek is < 0 or > MaxWeeklyHours)
        {
            return RangeHttp(new BadRequestObjectResult(new { error = $"Hours must be between 0 and {MaxWeeklyHours}." }));
        }

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == body.PersonId && p.IsActive);
        if (person is null)
        {
            return RangeHttp(new BadRequestObjectResult(new { error = "Unknown or inactive person." }));
        }

        var projectOpen = await db.Projects.AnyAsync(p => p.ProjectId == body.ProjectId && p.Status != ProjectStatus.Closed);
        if (!projectOpen)
        {
            return RangeHttp(new BadRequestObjectResult(new { error = "Project is closed or does not exist." }));
        }

        var firstWeek = WeekHelper.WeekStartOf(body.WeekStart);
        var lastWeekExclusive = firstWeek.AddDays(7 * body.Weeks);

        var existing = await db.Allocations
            .Where(a => a.PersonId == body.PersonId && a.ProjectId == body.ProjectId
                && a.WeekStart >= firstWeek && a.WeekStart < lastWeekExclusive)
            .ToDictionaryAsync(a => a.WeekStart);

        var userOid = result.User!.Oid;
        var affected = new List<Allocation>();
        var messages = new List<SignalRMessageAction>();
        for (var week = firstWeek; week < lastWeekExclusive; week = week.AddDays(7))
        {
            existing.TryGetValue(week, out var row);
            if (body.HoursPerWeek == 0)
            {
                if (row is not null)
                {
                    db.Allocations.Remove(row);
                    audit.Record(nameof(Allocation), row.AllocationId.ToString(), nameof(Allocation.Hours), row.Hours.ToString(), "0 (removed)", userOid);
                    messages.Add(ChangeMessage("removed", row));
                }
                continue;
            }

            if (row is null)
            {
                row = new Allocation
                {
                    AllocationId = Guid.NewGuid(),
                    PersonId = body.PersonId,
                    ProjectId = body.ProjectId,
                    WeekStart = week,
                    Hours = body.HoursPerWeek,
                };
                db.Allocations.Add(row);
                audit.Record(nameof(Allocation), row.AllocationId.ToString(), "created", null, body.HoursPerWeek.ToString(), userOid);
                messages.Add(ChangeMessage("created", row));
            }
            else if (row.Hours != body.HoursPerWeek)
            {
                audit.Record(nameof(Allocation), row.AllocationId.ToString(), nameof(Allocation.Hours), row.Hours.ToString(), body.HoursPerWeek.ToString(), userOid);
                row.Hours = body.HoursPerWeek;
                messages.Add(ChangeMessage("updated", row));
            }

            affected.Add(row);
        }

        await db.SaveChangesAsync();

        string? warning = null;
        if (body.HoursPerWeek > 0 && !person.IsPlaceholder)
        {
            var weekTotals = await db.Allocations
                .Where(a => a.PersonId == body.PersonId && a.WeekStart >= firstWeek && a.WeekStart < lastWeekExclusive)
                .GroupBy(a => a.WeekStart)
                .Select(g => new { WeekStart = g.Key, Total = g.Sum(a => a.Hours) })
                .ToListAsync();
            var over = weekTotals
                .Select(t => new { t.Total, Capacity = HolidayHelper.CapacityForWeek(t.WeekStart, person.WeeklyCapacityHours) })
                .Where(t => t.Total > t.Capacity)
                .ToList();
            if (over.Count > 0)
            {
                var peak = over.MaxBy(t => t.Total - t.Capacity)!;
                warning = $"{person.DisplayName} is booked over capacity in {over.Count} of {body.Weeks} week(s) (peak {peak.Total}h vs {peak.Capacity}h/week).";
            }
        }

        return new RangeAllocationWriteOutput
        {
            SignalRMessages = [.. messages],
            HttpResponse = new OkObjectResult(new { allocations = affected.Select(AllocationDto.From), warning }),
        };
    }

    [Function("DeleteAllocation")]
    public async Task<AllocationWriteOutput> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "allocations/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return Http(result.Error!);
        }

        var allocation = await db.Allocations.FirstOrDefaultAsync(a => a.AllocationId == id);
        if (allocation is null)
        {
            return Http(new NotFoundResult());
        }

        db.Allocations.Remove(allocation);
        audit.Record(nameof(Allocation), id.ToString(), nameof(Allocation.Hours), allocation.Hours.ToString(), "0 (removed)", result.User!.Oid);
        await db.SaveChangesAsync();
        return Broadcast("removed", allocation);
    }

    private static AllocationWriteOutput Broadcast(string action, Allocation a, decimal? weekTotal = null, int? capacity = null)
    {
        var payload = new AllocationChange(action, a.AllocationId, a.PersonId, a.ProjectId, a.WeekStart.ToString("yyyy-MM-dd"), a.Hours);
        return new AllocationWriteOutput
        {
            SignalRMessage = new SignalRMessageAction(Realtime.Realtime.AllocationChangedEvent, [payload])
            {
                GroupName = Realtime.Realtime.WeekGroup(a.WeekStart),
            },
            HttpResponse = new OkObjectResult(new
            {
                allocation = AllocationDto.From(a),
                action,
                weekTotal,
                warning = weekTotal is not null && capacity is not null && weekTotal > capacity
                    ? $"Person is booked {weekTotal}h against a {capacity}h week."
                    : null,
            }),
        };
    }

    private static AllocationWriteOutput Http(IActionResult result) => new() { HttpResponse = result };

    private static RangeAllocationWriteOutput RangeHttp(IActionResult result) => new() { HttpResponse = result };

    private static SignalRMessageAction ChangeMessage(string action, Allocation a) =>
        new(Realtime.Realtime.AllocationChangedEvent,
            [new AllocationChange(action, a.AllocationId, a.PersonId, a.ProjectId, a.WeekStart.ToString("yyyy-MM-dd"), a.Hours)])
        {
            GroupName = Realtime.Realtime.WeekGroup(a.WeekStart),
        };

    private static bool TryParseWeek(string? value, out DateOnly week) => DateOnly.TryParse(value, out week);

    private static int ParseInt(string? value, int fallback, int min, int max) =>
        int.TryParse(value, out var v) ? Math.Clamp(v, min, max) : fallback;
}
