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

public class RanksFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListStandardRanks")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ranks")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var ranks = await db.StandardRanks.AsNoTracking()
            .OrderBy(r => r.SortOrder).ThenBy(r => r.Name)
            .ToListAsync();

        var headcounts = await db.People.AsNoTracking()
            .Where(p => p.IsActive && !p.IsPlaceholder && p.Rank != null && p.Rank != "")
            .GroupBy(p => p.Rank!)
            .Select(g => new { Rank = g.Key, Count = g.Count() })
            .ToListAsync();
        var countByName = headcounts.ToDictionary(h => h.Rank, h => h.Count, StringComparer.OrdinalIgnoreCase);

        return new OkObjectResult(ranks
            .Select(r => StandardRankDto.From(r, countByName.GetValueOrDefault(r.Name)))
            .ToList());
    }

    [Function("CreateStandardRank")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ranks")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertStandardRankRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (!IsValidTarget(body.DefaultUtilizationTarget))
        {
            return new BadRequestObjectResult(new { error = "DefaultUtilizationTarget must be 0-100." });
        }

        var name = body.Name.Trim();
        if (await db.StandardRanks.AnyAsync(r => r.Name == name))
        {
            return new ConflictObjectResult(new { error = "A rank with that name already exists." });
        }

        var maxOrder = await db.StandardRanks.Select(r => (int?)r.SortOrder).MaxAsync() ?? 0;
        var rank = new StandardRank
        {
            StandardRankId = Guid.NewGuid(),
            Name = name,
            SortOrder = body.SortOrder ?? maxOrder + 1,
            DefaultUtilizationTarget = body.DefaultUtilizationTarget,
        };
        db.StandardRanks.Add(rank);
        audit.Record(nameof(StandardRank), rank.StandardRankId.ToString(), "created", null, name, result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/ranks/{rank.StandardRankId}", StandardRankDto.From(rank, 0));
    }

    [Function("UpdateStandardRank")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ranks/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertStandardRankRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        if (!IsValidTarget(body.DefaultUtilizationTarget))
        {
            return new BadRequestObjectResult(new { error = "DefaultUtilizationTarget must be 0-100." });
        }

        var rank = await db.StandardRanks.FirstOrDefaultAsync(r => r.StandardRankId == id);
        if (rank is null)
        {
            return new NotFoundResult();
        }

        var newName = body.Name.Trim();
        if (!string.Equals(rank.Name, newName, StringComparison.Ordinal)
            && await db.StandardRanks.AnyAsync(r => r.StandardRankId != id && r.Name == newName))
        {
            return new ConflictObjectResult(new { error = "A rank with that name already exists." });
        }

        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync();

            var tracked = await db.StandardRanks.FirstAsync(r => r.StandardRankId == id);
            if (!string.Equals(tracked.Name, newName, StringComparison.Ordinal))
            {
                // Keep people and rate card entries linked to the renamed rank.
                await db.People.Where(p => p.Rank == tracked.Name)
                    .ExecuteUpdateAsync(s => s.SetProperty(p => p.Rank, newName));
                await db.RateCardEntries.Where(r => r.Rank == tracked.Name)
                    .ExecuteUpdateAsync(s => s.SetProperty(r => r.Rank, newName));
                await db.PlanLineItems.Where(l => l.Rank == tracked.Name)
                    .ExecuteUpdateAsync(s => s.SetProperty(l => l.Rank, newName));
            }

            var before = Snapshot(tracked);
            tracked.Name = newName;
            tracked.SortOrder = body.SortOrder ?? tracked.SortOrder;
            tracked.DefaultUtilizationTarget = body.DefaultUtilizationTarget;
            tracked.IsArchived = body.IsArchived ?? tracked.IsArchived;

            audit.RecordDiff(nameof(StandardRank), id.ToString(), before, Snapshot(tracked), result.User!.Oid);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
            rank = tracked;
        });

        var headcount = await db.People.CountAsync(p => p.IsActive && !p.IsPlaceholder && p.Rank == rank.Name);
        return new OkObjectResult(StandardRankDto.From(rank, headcount));
    }

    [Function("DeleteStandardRank")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "ranks/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var rank = await db.StandardRanks.FirstOrDefaultAsync(r => r.StandardRankId == id);
        if (rank is null)
        {
            return new NotFoundResult();
        }

        var inUse = await db.People.AnyAsync(p => p.IsActive && p.Rank == rank.Name);
        if (inUse)
        {
            return new ConflictObjectResult(new { error = "Rank is assigned to active people. Reassign them or archive the rank instead." });
        }

        db.StandardRanks.Remove(rank);
        audit.Record(nameof(StandardRank), id.ToString(), "deleted", rank.Name, null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    private static bool IsValidTarget(int? target) => target is null or (>= 0 and <= 100);

    private static Dictionary<string, string?> Snapshot(StandardRank r) => new()
    {
        [nameof(StandardRank.Name)] = r.Name,
        [nameof(StandardRank.SortOrder)] = r.SortOrder.ToString(),
        [nameof(StandardRank.DefaultUtilizationTarget)] = r.DefaultUtilizationTarget?.ToString(),
        [nameof(StandardRank.IsArchived)] = r.IsArchived.ToString(),
    };
}
