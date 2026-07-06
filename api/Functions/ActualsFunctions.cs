using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class ActualsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    private const decimal MaxMonthlyHours = 744;

    [Function("ListActuals")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "actuals")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var year = int.TryParse(req.Query["year"], out var y) ? y : DateTime.UtcNow.Year;
        var from = new DateOnly(year, 1, 1);
        var to = new DateOnly(year + 1, 1, 1);

        var user = result.User!;
        var query = db.Actuals.AsNoTracking().Where(a => a.Month >= from && a.Month < to);

        // Viewers are limited to their own actuals.
        if (!user.HasRole(AppRoles.Editor) && !user.HasRole(AppRoles.Leadership))
        {
            query = query.Where(a => a.PersonId == user.Oid);
        }

        var actuals = await query.OrderBy(a => a.Month).Select(a => ActualHoursDto.From(a)).ToListAsync();
        return new OkObjectResult(actuals);
    }

    [Function("UpsertActual")]
    public async Task<IActionResult> Upsert(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "actuals")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertActualHoursRequest>();
        if (body is null || body.ChargeableHours is < 0 or > MaxMonthlyHours)
        {
            return new BadRequestObjectResult(new { error = $"ChargeableHours must be between 0 and {MaxMonthlyHours}." });
        }

        if (!await db.People.AnyAsync(p => p.PersonId == body.PersonId))
        {
            return new BadRequestObjectResult(new { error = "Person not found." });
        }

        var month = new DateOnly(body.Month.Year, body.Month.Month, 1);
        var existing = await db.Actuals.FirstOrDefaultAsync(a => a.PersonId == body.PersonId && a.Month == month);

        if (body.ChargeableHours == 0)
        {
            if (existing is null)
            {
                return new NoContentResult();
            }

            db.Actuals.Remove(existing);
            audit.Record(nameof(ActualHours), existing.ActualHoursId.ToString(), nameof(ActualHours.ChargeableHours), existing.ChargeableHours.ToString(), "0 (removed)", result.User!.Oid);
            await db.SaveChangesAsync();
            return new NoContentResult();
        }

        if (existing is null)
        {
            existing = new ActualHours
            {
                ActualHoursId = Guid.NewGuid(),
                PersonId = body.PersonId,
                Month = month,
                ChargeableHours = body.ChargeableHours,
            };
            db.Actuals.Add(existing);
            audit.Record(nameof(ActualHours), existing.ActualHoursId.ToString(), nameof(ActualHours.ChargeableHours), null, body.ChargeableHours.ToString(), result.User!.Oid);
        }
        else
        {
            audit.Record(nameof(ActualHours), existing.ActualHoursId.ToString(), nameof(ActualHours.ChargeableHours), existing.ChargeableHours.ToString(), body.ChargeableHours.ToString(), result.User!.Oid);
            existing.ChargeableHours = body.ChargeableHours;
        }

        await db.SaveChangesAsync();
        return new OkObjectResult(ActualHoursDto.From(existing));
    }
}
