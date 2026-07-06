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

public class PeopleFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListPeople")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "people")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var includeInactive = req.Query["includeInactive"] == "true";
        var query = db.People.AsNoTracking().OrderBy(p => p.DisplayName).AsQueryable();
        if (!includeInactive)
        {
            query = query.Where(p => p.IsActive);
        }

        var includeFinancials = result.User!.HasRole(AppRoles.Leadership);
        var entities = await query.ToListAsync();
        var people = entities.Select(p => PersonDto.From(p, includeFinancials)).ToList();
        return new OkObjectResult(people);
    }

    [Function("GetPerson")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "people/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == id);
        var includeFinancials = result.User!.HasRole(AppRoles.Leadership);
        return person is null ? new NotFoundResult() : new OkObjectResult(PersonDto.From(person, includeFinancials));
    }

    [Function("CreatePerson")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "people")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<CreatePersonRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.DisplayName) || string.IsNullOrWhiteSpace(body.Email))
        {
            return new BadRequestObjectResult(new { error = "DisplayName and Email are required." });
        }

        if (!IsValidTarget(body.UtilizationTarget) || !IsValidCapacity(body.WeeklyCapacityHours))
        {
            return new BadRequestObjectResult(new { error = "UtilizationTarget must be 0-100 and WeeklyCapacityHours 1-80." });
        }

        var isLeadership = result.User!.HasRole(AppRoles.Leadership);
        var person = new Person
        {
            PersonId = Guid.NewGuid(),
            DisplayName = body.DisplayName.Trim(),
            Email = body.Email.Trim(),
            JobTitle = body.JobTitle?.Trim(),
            ManagerId = body.ManagerId,
            Rank = body.Rank?.Trim(),
            Practice = body.Practice?.Trim(),
            Location = body.Location?.Trim(),
            Phone = body.Phone?.Trim(),
            StartDate = body.StartDate,
            CostRate = isLeadership ? body.CostRate : null,
            BillRate = isLeadership ? body.BillRate : null,
            UtilizationTarget = body.UtilizationTarget,
            WeeklyCapacityHours = body.WeeklyCapacityHours ?? 40,
            Skills = body.Skills?.Trim(),
            Notes = body.Notes?.Trim(),
            IsActive = true,
        };
        db.People.Add(person);
        audit.Record(nameof(Person), person.PersonId.ToString(), "created", null, person.DisplayName, result.User!.Oid);
        await db.SaveChangesAsync();

        return new CreatedResult($"/api/people/{person.PersonId}", PersonDto.From(person, isLeadership));
    }

    [Function("UpdatePerson")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "people/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpdatePersonRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.DisplayName) || string.IsNullOrWhiteSpace(body.Email))
        {
            return new BadRequestObjectResult(new { error = "DisplayName and Email are required." });
        }

        var person = await db.People.FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null)
        {
            return new NotFoundResult();
        }

        if (!IsValidTarget(body.UtilizationTarget) || !IsValidCapacity(body.WeeklyCapacityHours))
        {
            return new BadRequestObjectResult(new { error = "UtilizationTarget must be 0-100 and WeeklyCapacityHours 1-80." });
        }

        var isLeadership = result.User!.HasRole(AppRoles.Leadership);
        var before = Snapshot(person);
        person.DisplayName = body.DisplayName.Trim();
        person.Email = body.Email.Trim();
        person.JobTitle = body.JobTitle?.Trim();
        person.ManagerId = body.ManagerId;
        person.Rank = body.Rank?.Trim();
        person.Practice = body.Practice?.Trim();
        person.Location = body.Location?.Trim();
        person.Phone = body.Phone?.Trim();
        person.StartDate = body.StartDate;
        if (isLeadership)
        {
            person.CostRate = body.CostRate;
            person.BillRate = body.BillRate;
        }
        person.UtilizationTarget = body.UtilizationTarget;
        person.WeeklyCapacityHours = body.WeeklyCapacityHours ?? person.WeeklyCapacityHours;
        person.Skills = body.Skills?.Trim();
        person.Notes = body.Notes?.Trim();
        person.IsActive = body.IsActive;

        audit.RecordDiff(nameof(Person), id.ToString(), before, Snapshot(person), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(PersonDto.From(person, isLeadership));
    }

    [Function("DeactivatePerson")]
    public async Task<IActionResult> Deactivate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "people/{id:guid}/deactivate")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var person = await db.People.FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null)
        {
            return new NotFoundResult();
        }

        var isLeadership = result.User!.HasRole(AppRoles.Leadership);
        if (!person.IsActive)
        {
            return new OkObjectResult(PersonDto.From(person, isLeadership));
        }

        person.IsActive = false;
        audit.Record(nameof(Person), id.ToString(), nameof(Person.IsActive), "true", "false", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(PersonDto.From(person, isLeadership));
    }

    private static bool IsValidTarget(int? target) => target is null or (>= 0 and <= 100);

    private static bool IsValidCapacity(int? hours) => hours is null or (>= 1 and <= 80);

    private static Dictionary<string, string?> Snapshot(Person p) => new()
    {
        [nameof(Person.DisplayName)] = p.DisplayName,
        [nameof(Person.Email)] = p.Email,
        [nameof(Person.JobTitle)] = p.JobTitle,
        [nameof(Person.ManagerId)] = p.ManagerId?.ToString(),
        [nameof(Person.Rank)] = p.Rank,
        [nameof(Person.Practice)] = p.Practice,
        [nameof(Person.Location)] = p.Location,
        [nameof(Person.Phone)] = p.Phone,
        [nameof(Person.StartDate)] = p.StartDate?.ToString("yyyy-MM-dd"),
        [nameof(Person.CostRate)] = p.CostRate?.ToString(),
        [nameof(Person.BillRate)] = p.BillRate?.ToString(),
        [nameof(Person.UtilizationTarget)] = p.UtilizationTarget?.ToString(),
        [nameof(Person.WeeklyCapacityHours)] = p.WeeklyCapacityHours.ToString(),
        [nameof(Person.Skills)] = p.Skills,
        [nameof(Person.Notes)] = p.Notes,
        [nameof(Person.IsActive)] = p.IsActive.ToString(),
    };
}
