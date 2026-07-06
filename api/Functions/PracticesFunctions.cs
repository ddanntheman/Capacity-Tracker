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

public class PracticesFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListPractices")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "practices")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var practices = await db.Practices.AsNoTracking().OrderBy(p => p.Name).ToListAsync();

        // Practices may exist implicitly on people before a practice record is created.
        var peoplePractices = await db.People.AsNoTracking()
            .Where(p => p.Practice != null && p.Practice != "")
            .Select(p => p.Practice!)
            .Distinct()
            .ToListAsync();
        var known = practices.Select(p => p.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var missing = peoplePractices.Where(n => !known.Contains(n)).ToList();
        if (missing.Count > 0)
        {
            foreach (var name in missing)
            {
                await InsertPracticeIfMissing(db, name);
            }

            practices = await db.Practices.AsNoTracking().OrderBy(p => p.Name).ToListAsync();
        }

        var headcounts = await db.People.AsNoTracking()
            .Where(p => p.IsActive && p.Practice != null && p.Practice != "")
            .GroupBy(p => p.Practice!)
            .Select(g => new { Practice = g.Key, Count = g.Count() })
            .ToListAsync();
        var countByName = headcounts.ToDictionary(h => h.Practice, h => h.Count, StringComparer.OrdinalIgnoreCase);

        return new OkObjectResult(practices
            .Select(p => PracticeDto.From(p, countByName.GetValueOrDefault(p.Name)))
            .ToList());
    }

    [Function("CreatePractice")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "practices")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertPracticeRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (!IsValidTarget(body.DefaultUtilizationTarget))
        {
            return new BadRequestObjectResult(new { error = "DefaultUtilizationTarget must be 0-100." });
        }

        var name = body.Name.Trim();
        if (await db.Practices.AnyAsync(p => p.Name == name))
        {
            return new ConflictObjectResult(new { error = "A practice with that name already exists." });
        }

        var practice = new Practice
        {
            PracticeId = Guid.NewGuid(),
            Name = name,
            LeadId = body.LeadId,
            DefaultUtilizationTarget = body.DefaultUtilizationTarget,
        };
        db.Practices.Add(practice);
        audit.Record(nameof(Practice), practice.PracticeId.ToString(), "created", null, name, result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/practices/{practice.PracticeId}", PracticeDto.From(practice, 0));
    }

    [Function("UpdatePractice")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "practices/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertPracticeRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (!IsValidTarget(body.DefaultUtilizationTarget))
        {
            return new BadRequestObjectResult(new { error = "DefaultUtilizationTarget must be 0-100." });
        }

        var practice = await db.Practices.FirstOrDefaultAsync(p => p.PracticeId == id);
        if (practice is null)
        {
            return new NotFoundResult();
        }

        var newName = body.Name.Trim();
        if (!string.Equals(practice.Name, newName, StringComparison.Ordinal)
            && await db.Practices.AnyAsync(p => p.PracticeId != id && p.Name == newName))
        {
            return new ConflictObjectResult(new { error = "A practice with that name already exists." });
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();

            if (!string.Equals(practice.Name, newName, StringComparison.Ordinal))
            {
                // Keep people linked to the renamed practice.
                await db.People.Where(p => p.Practice == practice.Name)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Practice, newName));
            }

            var before = Snapshot(practice);
            practice.Name = newName;
            practice.LeadId = body.LeadId;
            practice.DefaultUtilizationTarget = body.DefaultUtilizationTarget;
            practice.IsArchived = body.IsArchived ?? practice.IsArchived;

            audit.RecordDiff(nameof(Practice), id.ToString(), before, Snapshot(practice), result.User!.Oid);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        var headcount = await db.People.CountAsync(p => p.IsActive && p.Practice == practice.Name);
        return new OkObjectResult(PracticeDto.From(practice, headcount));
    }

    [Function("MergePractice")]
    public async Task<IActionResult> Merge(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "practices/{id:guid}/merge")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<MergePracticeRequest>();
        if (body is null || body.TargetPracticeId == Guid.Empty)
        {
            return new BadRequestObjectResult(new { error = "TargetPracticeId is required." });
        }

        if (body.TargetPracticeId == id)
        {
            return new BadRequestObjectResult(new { error = "Cannot merge a practice into itself." });
        }

        var source = await db.Practices.FirstOrDefaultAsync(p => p.PracticeId == id);
        var target = await db.Practices.FirstOrDefaultAsync(p => p.PracticeId == body.TargetPracticeId);
        if (source is null || target is null)
        {
            return new NotFoundResult();
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            await using var tx = await db.Database.BeginTransactionAsync();

            await db.People.Where(p => p.Practice == source.Name)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.Practice, target.Name));
            db.Practices.Remove(source);

            audit.Record(nameof(Practice), id.ToString(), "merged", source.Name, target.Name, result.User!.Oid);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        var headcount = await db.People.CountAsync(p => p.IsActive && p.Practice == target.Name);
        return new OkObjectResult(PracticeDto.From(target, headcount));
    }

    internal static async Task InsertPracticeIfMissing(CapacityDbContext db, string name)
    {
        var id = Guid.NewGuid();
        await db.Database.ExecuteSqlInterpolatedAsync(
            $"INSERT INTO [Practices] ([PracticeId], [Name], [IsArchived]) SELECT {id}, {name}, 0 WHERE NOT EXISTS (SELECT 1 FROM [Practices] WHERE [Name] = {name})");
    }

    private static bool IsValidTarget(int? target) => target is null or (>= 0 and <= 100);

    private static Dictionary<string, string?> Snapshot(Practice p) => new()
    {
        [nameof(Practice.Name)] = p.Name,
        [nameof(Practice.LeadId)] = p.LeadId?.ToString(),
        [nameof(Practice.DefaultUtilizationTarget)] = p.DefaultUtilizationTarget?.ToString(),
        [nameof(Practice.IsArchived)] = p.IsArchived.ToString(),
    };
}
