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

public class RateCardFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListRateCardEntries")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "ratecard")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var entries = await db.RateCardEntries.AsNoTracking()
            .OrderBy(r => r.Rank).ThenBy(r => r.Geography).ThenByDescending(r => r.EffectiveFrom)
            .ToListAsync();
        return new OkObjectResult(entries.Select(RateCardEntryDto.From).ToList());
    }

    [Function("CreateRateCardEntry")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "ratecard")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertRateCardEntryRequest>();
        var error = Validate(body);
        if (error is not null)
        {
            return error;
        }

        var rank = body!.Rank.Trim();
        var geography = body.Geography.Trim();
        if (await db.RateCardEntries.AnyAsync(r =>
            r.Rank == rank && r.Geography == geography && r.EffectiveFrom == body.EffectiveFrom))
        {
            return new ConflictObjectResult(new { error = "An entry for that rank/geography/effective date already exists." });
        }

        var entry = new RateCardEntry
        {
            RateCardEntryId = Guid.NewGuid(),
            Rank = rank,
            Geography = geography,
            EffectiveFrom = body.EffectiveFrom,
            CostRate = body.CostRate,
            BillRate = body.BillRate,
        };
        db.RateCardEntries.Add(entry);
        audit.Record(nameof(RateCardEntry), entry.RateCardEntryId.ToString(), "created", null,
            $"{rank}/{geography} eff {body.EffectiveFrom:yyyy-MM-dd}: cost {body.CostRate}, bill {body.BillRate}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/ratecard/{entry.RateCardEntryId}", RateCardEntryDto.From(entry));
    }

    [Function("UpdateRateCardEntry")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "ratecard/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertRateCardEntryRequest>();
        var error = Validate(body);
        if (error is not null)
        {
            return error;
        }

        var entry = await db.RateCardEntries.FirstOrDefaultAsync(r => r.RateCardEntryId == id);
        if (entry is null)
        {
            return new NotFoundResult();
        }

        var before = Snapshot(entry);
        entry.Rank = body!.Rank.Trim();
        entry.Geography = body.Geography.Trim();
        entry.EffectiveFrom = body.EffectiveFrom;
        entry.CostRate = body.CostRate;
        entry.BillRate = body.BillRate;
        audit.RecordDiff(nameof(RateCardEntry), id.ToString(), before, Snapshot(entry), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(RateCardEntryDto.From(entry));
    }

    [Function("DeleteRateCardEntry")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "ratecard/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var entry = await db.RateCardEntries.FirstOrDefaultAsync(r => r.RateCardEntryId == id);
        if (entry is null)
        {
            return new NotFoundResult();
        }

        db.RateCardEntries.Remove(entry);
        audit.Record(nameof(RateCardEntry), id.ToString(), "deleted",
            $"{entry.Rank}/{entry.Geography} eff {entry.EffectiveFrom:yyyy-MM-dd}", null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    private static BadRequestObjectResult? Validate(UpsertRateCardEntryRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.Rank) || string.IsNullOrWhiteSpace(body.Geography))
        {
            return new BadRequestObjectResult(new { error = "Rank and Geography are required." });
        }

        if (body.CostRate < 0 || body.BillRate < 0)
        {
            return new BadRequestObjectResult(new { error = "Rates must be non-negative." });
        }

        return null;
    }

    private static Dictionary<string, string?> Snapshot(RateCardEntry r) => new()
    {
        [nameof(RateCardEntry.Rank)] = r.Rank,
        [nameof(RateCardEntry.Geography)] = r.Geography,
        [nameof(RateCardEntry.EffectiveFrom)] = r.EffectiveFrom.ToString("yyyy-MM-dd"),
        [nameof(RateCardEntry.CostRate)] = r.CostRate.ToString("0.##"),
        [nameof(RateCardEntry.BillRate)] = r.BillRate.ToString("0.##"),
    };
}
