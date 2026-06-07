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
    private const int WarnThreshold = 80;
    private const int MaxPercent = 100;

    /// <summary>
    /// Returns allocations across a window of weeks. Viewers see only their own
    /// rows; editors and leadership see everyone (optionally filtered by person).
    /// </summary>
    [Function("ListAllocations")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "allocations")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;
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
        if (!result.Allowed) return Http(result.Error!);

        var body = await req.ReadFromJsonAsync<UpsertAllocationRequest>();
        if (body is null) return Http(new BadRequestResult());
        if (body.PercentAllocated is < 0 or > MaxPercent)
        {
            return Http(new BadRequestObjectResult(new { error = $"PercentAllocated must be between 0 and {MaxPercent}." }));
        }

        // Normalize to the Monday of the week so the (PersonId, ProjectId, WeekStart)
        // grain holds regardless of which weekday the caller supplies.
        var weekStart = WeekHelper.WeekStartOf(body.WeekStart);

        var personExists = await db.People.AnyAsync(p => p.PersonId == body.PersonId && p.IsActive);
        var projectOpen = await db.Projects.AnyAsync(p => p.ProjectId == body.ProjectId && p.Status != ProjectStatus.Closed);
        if (!personExists) return Http(new BadRequestObjectResult(new { error = "Unknown or inactive person." }));
        if (!projectOpen) return Http(new BadRequestObjectResult(new { error = "Project is closed or does not exist." }));

        var existing = await db.Allocations.FirstOrDefaultAsync(a =>
            a.PersonId == body.PersonId && a.ProjectId == body.ProjectId && a.WeekStart == weekStart);

        // A zero percent upsert removes the row.
        if (body.PercentAllocated == 0)
        {
            if (existing is null) return Http(new NoContentResult());
            db.Allocations.Remove(existing);
            audit.Record(nameof(Allocation), existing.AllocationId.ToString(), nameof(Allocation.PercentAllocated), existing.PercentAllocated.ToString(), "0 (removed)", result.User!.Oid);
            await db.SaveChangesAsync();
            return Broadcast("removed", existing);
        }

        var otherTotal = await db.Allocations
            .Where(a => a.PersonId == body.PersonId && a.WeekStart == weekStart
                && (existing == null || a.AllocationId != existing.AllocationId))
            .SumAsync(a => (int?)a.PercentAllocated) ?? 0;

        var newTotal = otherTotal + body.PercentAllocated;
        if (newTotal > MaxPercent)
        {
            return Http(new ConflictObjectResult(new
            {
                error = "over-allocated",
                message = $"Total allocation for the week would be {newTotal}%, which exceeds {MaxPercent}%.",
                weekTotal = newTotal,
            }));
        }

        Allocation allocation;
        if (existing is null)
        {
            allocation = new Allocation
            {
                AllocationId = Guid.NewGuid(),
                PersonId = body.PersonId,
                ProjectId = body.ProjectId,
                WeekStart = weekStart,
                PercentAllocated = body.PercentAllocated,
            };
            db.Allocations.Add(allocation);
            audit.Record(nameof(Allocation), allocation.AllocationId.ToString(), "created", null, body.PercentAllocated.ToString(), result.User!.Oid);
        }
        else
        {
            allocation = existing;
            audit.Record(nameof(Allocation), allocation.AllocationId.ToString(), nameof(Allocation.PercentAllocated), allocation.PercentAllocated.ToString(), body.PercentAllocated.ToString(), result.User!.Oid);
            allocation.PercentAllocated = body.PercentAllocated;
        }

        await db.SaveChangesAsync();
        return Broadcast(existing is null ? "created" : "updated", allocation, newTotal);
    }

    [Function("DeleteAllocation")]
    public async Task<AllocationWriteOutput> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "allocations/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed) return Http(result.Error!);

        var allocation = await db.Allocations.FirstOrDefaultAsync(a => a.AllocationId == id);
        if (allocation is null) return Http(new NotFoundResult());

        db.Allocations.Remove(allocation);
        audit.Record(nameof(Allocation), id.ToString(), nameof(Allocation.PercentAllocated), allocation.PercentAllocated.ToString(), "0 (removed)", result.User!.Oid);
        await db.SaveChangesAsync();
        return Broadcast("removed", allocation);
    }

    private static AllocationWriteOutput Broadcast(string action, Allocation a, int? weekTotal = null)
    {
        var payload = new AllocationChange(action, a.AllocationId, a.PersonId, a.ProjectId, a.WeekStart.ToString("yyyy-MM-dd"), a.PercentAllocated);
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
                warning = weekTotal is >= WarnThreshold and < MaxPercent ? $"Person is at {weekTotal}% for the week." : null,
            }),
        };
    }

    private static AllocationWriteOutput Http(IActionResult result) => new() { HttpResponse = result };

    private static bool TryParseWeek(string? value, out DateOnly week) => DateOnly.TryParse(value, out week);

    private static int ParseInt(string? value, int fallback, int min, int max) =>
        int.TryParse(value, out var v) ? Math.Clamp(v, min, max) : fallback;
}
