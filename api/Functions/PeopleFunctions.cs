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
        if (!result.Allowed) return result.Error!;

        var includeInactive = req.Query["includeInactive"] == "true";
        var query = db.People.AsNoTracking().OrderBy(p => p.DisplayName).AsQueryable();
        if (!includeInactive) query = query.Where(p => p.IsActive);

        var people = await query.Select(p => PersonDto.From(p)).ToListAsync();
        return new OkObjectResult(people);
    }

    [Function("GetPerson")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "people/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;

        var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == id);
        return person is null ? new NotFoundResult() : new OkObjectResult(PersonDto.From(person));
    }

    [Function("CreatePerson")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "people")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed) return result.Error!;

        var body = await req.ReadFromJsonAsync<CreatePersonRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.DisplayName) || string.IsNullOrWhiteSpace(body.Email))
        {
            return new BadRequestObjectResult(new { error = "DisplayName and Email are required." });
        }

        var person = new Person
        {
            PersonId = Guid.NewGuid(),
            DisplayName = body.DisplayName.Trim(),
            Email = body.Email.Trim(),
            JobTitle = body.JobTitle?.Trim(),
            ManagerId = body.ManagerId,
            IsActive = true,
        };
        db.People.Add(person);
        audit.Record(nameof(Person), person.PersonId.ToString(), "created", null, person.DisplayName, result.User!.Oid);
        await db.SaveChangesAsync();

        return new CreatedResult($"/api/people/{person.PersonId}", PersonDto.From(person));
    }

    [Function("UpdatePerson")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "people/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed) return result.Error!;

        var body = await req.ReadFromJsonAsync<UpdatePersonRequest>();
        if (body is null) return new BadRequestResult();

        var person = await db.People.FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null) return new NotFoundResult();

        var before = Snapshot(person);
        person.DisplayName = body.DisplayName.Trim();
        person.Email = body.Email.Trim();
        person.JobTitle = body.JobTitle?.Trim();
        person.ManagerId = body.ManagerId;
        person.IsActive = body.IsActive;

        audit.RecordDiff(nameof(Person), id.ToString(), before, Snapshot(person), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(PersonDto.From(person));
    }

    [Function("DeactivatePerson")]
    public async Task<IActionResult> Deactivate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "people/{id:guid}/deactivate")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed) return result.Error!;

        var person = await db.People.FirstOrDefaultAsync(p => p.PersonId == id);
        if (person is null) return new NotFoundResult();
        if (!person.IsActive) return new OkObjectResult(PersonDto.From(person));

        person.IsActive = false;
        audit.Record(nameof(Person), id.ToString(), nameof(Person.IsActive), "true", "false", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(PersonDto.From(person));
    }

    private static Dictionary<string, string?> Snapshot(Person p) => new()
    {
        [nameof(Person.DisplayName)] = p.DisplayName,
        [nameof(Person.Email)] = p.Email,
        [nameof(Person.JobTitle)] = p.JobTitle,
        [nameof(Person.ManagerId)] = p.ManagerId?.ToString(),
        [nameof(Person.IsActive)] = p.IsActive.ToString(),
    };
}
