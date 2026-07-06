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

    /// <summary>
    /// Merges a duplicate person into another: allocations and actuals move to the
    /// target (hours summed where both have entries for the same project-week or
    /// month), reporting/lead references are repointed, empty profile fields on the
    /// target are filled from the source, and the source record is deleted.
    /// </summary>
    [Function("MergePerson")]
    public async Task<IActionResult> Merge(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "people/{id:guid}/merge")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<MergePersonRequest>();
        if (body is null || body.TargetPersonId == Guid.Empty)
        {
            return new BadRequestObjectResult(new { error = "TargetPersonId is required." });
        }

        if (body.TargetPersonId == id)
        {
            return new BadRequestObjectResult(new { error = "Cannot merge a person into themselves." });
        }

        var sourceExists = await db.People.AsNoTracking().AnyAsync(p => p.PersonId == id);
        var targetExists = await db.People.AsNoTracking().AnyAsync(p => p.PersonId == body.TargetPersonId);
        if (!sourceExists || !targetExists)
        {
            return new NotFoundResult();
        }

        Person? merged = null;
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync();

            var source = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == id);
            var target = await db.People.FirstOrDefaultAsync(p => p.PersonId == body.TargetPersonId);
            if (source is not null && target is not null)
            {
                FillMissingProfileFields(target, source);
                audit.Record(nameof(Person), id.ToString(), "merged", source.DisplayName, target.DisplayName, result.User!.Oid);
                await db.SaveChangesAsync();

                await MovePersonReferencesAsync(db, id, target.PersonId);
                await db.People.Where(p => p.PersonId == id).ExecuteDeleteAsync();
                await db.Entry(target).ReloadAsync();
            }

            merged = target;
            await tx.CommitAsync();
        });

        return merged is null
            ? new NotFoundResult()
            : new OkObjectResult(PersonDto.From(merged, result.User!.HasRole(AppRoles.Leadership)));
    }

    /// <summary>Repoints every reference from one person to another, summing hours on collisions.</summary>
    internal static async Task MovePersonReferencesAsync(CapacityDbContext db, Guid sourceId, Guid targetId)
    {
        await db.Database.ExecuteSqlInterpolatedAsync($@"
UPDATE t SET t.[Hours] = t.[Hours] + s.[Hours]
FROM [Allocations] t
JOIN [Allocations] s ON s.[PersonId] = {sourceId}
 AND t.[PersonId] = {targetId}
 AND s.[ProjectId] = t.[ProjectId]
 AND s.[WeekStart] = t.[WeekStart]");
        await db.Database.ExecuteSqlInterpolatedAsync($@"
DELETE s FROM [Allocations] s
WHERE s.[PersonId] = {sourceId} AND EXISTS (
    SELECT 1 FROM [Allocations] t
    WHERE t.[PersonId] = {targetId} AND t.[ProjectId] = s.[ProjectId] AND t.[WeekStart] = s.[WeekStart])");
        await db.Allocations.Where(a => a.PersonId == sourceId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.PersonId, targetId));

        await db.Database.ExecuteSqlInterpolatedAsync($@"
UPDATE t SET t.[ChargeableHours] = t.[ChargeableHours] + s.[ChargeableHours]
FROM [Actuals] t
JOIN [Actuals] s ON s.[PersonId] = {sourceId}
 AND t.[PersonId] = {targetId}
 AND s.[Month] = t.[Month]");
        await db.Database.ExecuteSqlInterpolatedAsync($@"
DELETE s FROM [Actuals] s
WHERE s.[PersonId] = {sourceId} AND EXISTS (
    SELECT 1 FROM [Actuals] t
    WHERE t.[PersonId] = {targetId} AND t.[Month] = s.[Month])");
        await db.Actuals.Where(a => a.PersonId == sourceId)
            .ExecuteUpdateAsync(s => s.SetProperty(a => a.PersonId, targetId));

        await db.People.Where(p => p.ManagerId == sourceId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ManagerId, targetId));
        await db.People.Where(p => p.PersonId == targetId && p.ManagerId == targetId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.ManagerId, (Guid?)null));
        await db.Practices.Where(p => p.LeadId == sourceId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.LeadId, targetId));
        await db.Projects.Where(p => p.DeliveryLeadId == sourceId)
            .ExecuteUpdateAsync(s => s.SetProperty(p => p.DeliveryLeadId, targetId));
    }

    private static void FillMissingProfileFields(Person target, Person source)
    {
        if (string.IsNullOrWhiteSpace(target.DisplayName) || target.DisplayName == target.Email)
        {
            target.DisplayName = source.DisplayName;
        }
        target.JobTitle ??= source.JobTitle;
        if (target.ManagerId is null && source.ManagerId != target.PersonId)
        {
            target.ManagerId = source.ManagerId;
        }
        target.Rank ??= source.Rank;
        target.Practice ??= source.Practice;
        target.Location ??= source.Location;
        target.Phone ??= source.Phone;
        target.StartDate ??= source.StartDate;
        target.CostRate ??= source.CostRate;
        target.BillRate ??= source.BillRate;
        target.UtilizationTarget ??= source.UtilizationTarget;
        target.Skills ??= source.Skills;
        target.Notes ??= source.Notes;
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
