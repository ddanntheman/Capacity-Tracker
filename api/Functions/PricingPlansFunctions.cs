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

public class PricingPlansFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit, PlanBookingService booking)
{
    [Function("ListPricingPlans")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "plans")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plans = await db.PricingPlans.AsNoTracking()
            .Include(p => p.Project)
            .Include(p => p.MdOwner)
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .OrderByDescending(p => p.UpdatedAtUtc)
            .ToListAsync();

        return new OkObjectResult(plans.Select(p => new PricingPlanSummaryDto(
            p.PricingPlanId,
            p.ProjectId,
            p.Project!.ClientName,
            p.Project.ProjectName,
            p.MdOwnerId,
            p.MdOwner?.DisplayName,
            p.Practice,
            StatusName(p.Status),
            p.StartDate,
            p.EndDate,
            p.PricingModel.ToString(),
            p.LineItems.Count,
            p.LineItems.SelectMany(l => l.WeekHours).Sum(w => w.Hours),
            p.UpdatedAtUtc)).ToList());
    }

    [Function("CreatePricingPlan")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "plans")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<CreatePricingPlanRequest>();
        if (body is null || body.EndDate == default || body.StartDate == default)
        {
            return new BadRequestObjectResult(new { error = "StartDate and EndDate are required." });
        }

        if (body.EndDate < body.StartDate)
        {
            return new BadRequestObjectResult(new { error = "EndDate must be on or after StartDate." });
        }

        Project? project;
        if (body.ProjectId is Guid projectId)
        {
            project = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == projectId);
            if (project is null)
            {
                return new NotFoundObjectResult(new { error = "Project not found." });
            }

            if (await db.PricingPlans.AnyAsync(p => p.ProjectId == projectId))
            {
                return new ConflictObjectResult(new { error = "That project already has a pricing plan." });
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(body.ClientName) || string.IsNullOrWhiteSpace(body.ProjectName))
            {
                return new BadRequestObjectResult(new { error = "ClientName and ProjectName are required when no ProjectId is given." });
            }

            project = new Project
            {
                ProjectId = Guid.NewGuid(),
                ClientName = body.ClientName.Trim(),
                ProjectName = body.ProjectName.Trim(),
                StartDate = body.StartDate,
                EndDate = body.EndDate,
                Status = ProjectStatus.Pipeline,
            };
            db.Projects.Add(project);
            await ClientsFunctions.InsertClientIfMissing(db, project.ClientName);
        }

        var model = ParsePricingModel(body.PricingModel) ?? PricingModel.RoleBased;
        var now = DateTime.UtcNow;
        var plan = new PricingPlan
        {
            PricingPlanId = Guid.NewGuid(),
            ProjectId = project.ProjectId,
            MdOwnerId = body.MdOwnerId,
            Practice = body.Practice?.Trim(),
            Status = PlanStatus.Draft,
            StartDate = body.StartDate,
            EndDate = body.EndDate,
            PricingModel = model,
            CreatedAtUtc = now,
            UpdatedAtUtc = now,
        };
        db.PricingPlans.Add(plan);
        audit.Record(nameof(PricingPlan), plan.PricingPlanId.ToString(), "created", null,
            $"{project.ClientName} / {project.ProjectName}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/plans/{plan.PricingPlanId}", await GetDto(plan.PricingPlanId));
    }

    [Function("GetPricingPlan")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "plans/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var dto = await GetDto(id);
        return dto is null ? new NotFoundResult() : new OkObjectResult(dto);
    }

    [Function("UpdatePricingPlan")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "plans/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpdatePricingPlanRequest>();
        if (body is null)
        {
            return new BadRequestObjectResult(new { error = "Body is required." });
        }

        if (body.EndDate < body.StartDate)
        {
            return new BadRequestObjectResult(new { error = "EndDate must be on or after StartDate." });
        }

        if (ParseStatus(body.Status) is not PlanStatus status)
        {
            return new BadRequestObjectResult(new { error = "Status must be draft, activePursuit, or closedLost." });
        }

        if (status == PlanStatus.ClosedWon)
        {
            return new BadRequestObjectResult(new { error = "Use the win-conversion action to close a plan as won." });
        }

        var model = ParsePricingModel(body.PricingModel);
        if (model is null)
        {
            return new BadRequestObjectResult(new { error = "PricingModel must be blendedRate, roleBased, fixedFee, milestone, or outcome." });
        }

        var plan = await db.PricingPlans.Include(p => p.Project).FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedWon)
        {
            return new BadRequestObjectResult(new { error = "A Closed/Won plan is locked; corrections require a re-baseline." });
        }

        var before = Snapshot(plan);
        plan.MdOwnerId = body.MdOwnerId;
        plan.Practice = body.Practice?.Trim();
        plan.Status = status;
        plan.StartDate = body.StartDate;
        plan.EndDate = body.EndDate;
        plan.PricingModel = model.Value;
        plan.BlendedRate = body.BlendedRate;
        plan.FixedFee = body.FixedFee;
        plan.TechnologyFees = body.TechnologyFees;
        plan.RecoverableExpenses = body.RecoverableExpenses;
        plan.Notes = body.Notes;
        plan.UpdatedAtUtc = DateTime.UtcNow;

        // Keep the pursuit's project record aligned with the plan.
        plan.Project!.StartDate = body.StartDate;
        plan.Project.EndDate = body.EndDate;
        if (status == PlanStatus.ClosedLost && plan.Project.Status != ProjectStatus.Closed)
        {
            plan.Project.Status = ProjectStatus.Closed;
        }

        audit.RecordDiff(nameof(PricingPlan), id.ToString(), before, Snapshot(plan), result.User!.Oid);
        await booking.SyncBookings(id);
        await db.SaveChangesAsync();
        return new OkObjectResult(await GetDto(id));
    }

    [Function("DeletePricingPlan")]
    public async Task<IActionResult> Delete(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "plans/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await db.PricingPlans.FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedWon)
        {
            return new BadRequestObjectResult(new { error = "A Closed/Won plan cannot be deleted." });
        }

        // Release any plan-managed bookings before removing the plan.
        plan.Status = PlanStatus.ClosedLost;
        await booking.SyncBookings(id);
        db.PricingPlans.Remove(plan);
        audit.Record(nameof(PricingPlan), id.ToString(), "deleted", null, null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    [Function("CreatePlanLineItem")]
    public async Task<IActionResult> CreateLine(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "plans/{id:guid}/lines")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertPlanLineItemRequest>();
        var validation = await ValidateLine(body);
        if (validation is not null)
        {
            return validation;
        }

        var plan = await db.PricingPlans.Include(p => p.LineItems).FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "Closed/Lost plans are read-only." });
        }

        if (RequireReason(plan, body!.Reason) is IActionResult reasonError)
        {
            return reasonError;
        }

        var line = new PlanLineItem
        {
            PlanLineItemId = Guid.NewGuid(),
            PricingPlanId = id,
            SortOrder = body!.SortOrder ?? (plan.LineItems.Count == 0 ? 0 : plan.LineItems.Max(l => l.SortOrder) + 1),
        };
        ApplyLine(line, body);
        db.PlanLineItems.Add(line);
        plan.UpdatedAtUtc = DateTime.UtcNow;
        audit.Record(nameof(PlanLineItem), line.PlanLineItemId.ToString(), "created", null,
            WithReason(line.RoleTitle, body.Reason), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(await GetDto(id));
    }

    [Function("UpdatePlanLineItem")]
    public async Task<IActionResult> UpdateLine(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "plans/{id:guid}/lines/{lineId:guid}")] HttpRequest req, Guid id, Guid lineId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertPlanLineItemRequest>();
        var validation = await ValidateLine(body);
        if (validation is not null)
        {
            return validation;
        }

        var plan = await db.PricingPlans.FirstOrDefaultAsync(p => p.PricingPlanId == id);
        var line = await db.PlanLineItems.FirstOrDefaultAsync(l => l.PlanLineItemId == lineId && l.PricingPlanId == id);
        if (plan is null || line is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "Closed/Lost plans are read-only." });
        }

        if (RequireReason(plan, body!.Reason) is IActionResult reasonError)
        {
            return reasonError;
        }

        var before = SnapshotLine(line);
        ApplyLine(line, body);
        line.SortOrder = body.SortOrder ?? line.SortOrder;
        plan.UpdatedAtUtc = DateTime.UtcNow;
        audit.RecordDiff(nameof(PlanLineItem), lineId.ToString(), before, SnapshotLine(line), result.User!.Oid);
        if (!string.IsNullOrWhiteSpace(body.Reason))
        {
            audit.Record(nameof(PlanLineItem), lineId.ToString(), "reason", null, body.Reason.Trim(), result.User!.Oid);
        }
        await booking.SyncBookings(id);
        await db.SaveChangesAsync();
        return new OkObjectResult(await GetDto(id));
    }

    [Function("DeletePlanLineItem")]
    public async Task<IActionResult> DeleteLine(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "plans/{id:guid}/lines/{lineId:guid}")] HttpRequest req, Guid id, Guid lineId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await db.PricingPlans.FirstOrDefaultAsync(p => p.PricingPlanId == id);
        var line = await db.PlanLineItems.FirstOrDefaultAsync(l => l.PlanLineItemId == lineId && l.PricingPlanId == id);
        if (plan is null || line is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "Closed/Lost plans are read-only." });
        }

        var reason = req.Query["reason"].ToString();
        if (RequireReason(plan, reason) is IActionResult reasonError)
        {
            return reasonError;
        }

        db.PlanLineItems.Remove(line);
        plan.UpdatedAtUtc = DateTime.UtcNow;
        audit.Record(nameof(PlanLineItem), lineId.ToString(), "deleted",
            WithReason(line.RoleTitle, reason), null, result.User!.Oid);
        await db.SaveChangesAsync();

        await booking.SyncBookings(id);
        await db.SaveChangesAsync();
        return new OkObjectResult(await GetDto(id));
    }

    [Function("SetPlanLineHours")]
    public async Task<IActionResult> SetLineHours(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "plans/{id:guid}/lines/{lineId:guid}/hours")] HttpRequest req, Guid id, Guid lineId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<SetPlanWeekHoursRequest>();
        if (body is null || body.WeekHours is null)
        {
            return new BadRequestObjectResult(new { error = "WeekHours is required." });
        }

        if (body.WeekHours.Any(w => w.Hours < 0 || w.Hours > 168))
        {
            return new BadRequestObjectResult(new { error = "Hours must be between 0 and 168." });
        }

        var plan = await db.PricingPlans.FirstOrDefaultAsync(p => p.PricingPlanId == id);
        var line = await db.PlanLineItems.Include(l => l.WeekHours)
            .FirstOrDefaultAsync(l => l.PlanLineItemId == lineId && l.PricingPlanId == id);
        if (plan is null || line is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "Closed/Lost plans are read-only." });
        }

        if (RequireReason(plan, body.Reason) is IActionResult reasonError)
        {
            return reasonError;
        }

        var oldTotal = line.WeekHours.Sum(w => w.Hours);
        var byWeek = body.WeekHours
            .GroupBy(w => WeekHelper.WeekStartOf(w.WeekStart))
            .ToDictionary(g => g.Key, g => g.Sum(w => w.Hours));

        foreach (var existing in line.WeekHours.ToList())
        {
            if (byWeek.TryGetValue(existing.WeekStart, out var hours))
            {
                if (hours <= 0)
                {
                    db.PlanWeekHours.Remove(existing);
                }
                else
                {
                    existing.Hours = hours;
                }

                byWeek.Remove(existing.WeekStart);
            }
        }

        foreach (var (weekStart, hours) in byWeek.Where(kv => kv.Value > 0))
        {
            db.PlanWeekHours.Add(new PlanWeekHours
            {
                PlanWeekHoursId = Guid.NewGuid(),
                PlanLineItemId = lineId,
                WeekStart = weekStart,
                Hours = hours,
            });
        }

        plan.UpdatedAtUtc = DateTime.UtcNow;
        await db.SaveChangesAsync();

        db.ChangeTracker.Clear();
        var newTotal = await db.PlanWeekHours.Where(w => w.PlanLineItemId == lineId).SumAsync(w => w.Hours);
        audit.Record(nameof(PlanLineItem), lineId.ToString(), "hours",
            $"{oldTotal:0.##}h", WithReason($"{newTotal:0.##}h", body.Reason), result.User!.Oid);
        await booking.SyncBookings(id);
        await db.SaveChangesAsync();
        return new OkObjectResult(await GetDto(id));
    }

    [Function("GetPlanEconomics")]
    public async Task<IActionResult> Economics(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "plans/{id:guid}/economics")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await db.PricingPlans.AsNoTracking()
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        return new OkObjectResult(PlanEconomicsService.Compute(plan, rateCard));
    }

    private async Task<PricingPlanDto?> GetDto(Guid id)
    {
        var plan = await db.PricingPlans.AsNoTracking()
            .Include(p => p.Project)
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return null;
        }

        return new PricingPlanDto(
            plan.PricingPlanId,
            plan.ProjectId,
            plan.Project!.ClientName,
            plan.Project.ProjectName,
            plan.MdOwnerId,
            plan.Practice,
            StatusName(plan.Status),
            plan.StartDate,
            plan.EndDate,
            plan.PricingModel.ToString(),
            plan.BlendedRate,
            plan.FixedFee,
            plan.TechnologyFees,
            plan.RecoverableExpenses,
            plan.Notes,
            plan.CreatedAtUtc,
            plan.UpdatedAtUtc,
            plan.LineItems
                .OrderBy(l => l.SortOrder).ThenBy(l => l.RoleTitle)
                .Select(l => new PlanLineItemDto(
                    l.PlanLineItemId,
                    l.RoleTitle,
                    l.Rank,
                    l.Geography,
                    l.Organization.ToString().ToLowerInvariant(),
                    l.SubcontractorFirm,
                    l.PersonId,
                    l.Person?.DisplayName,
                    l.CostRateOverride,
                    l.BillRateOverride,
                    l.ClientRate,
                    l.SortOrder,
                    l.WeekHours.OrderBy(w => w.WeekStart)
                        .Select(w => new PlanWeekHoursDto(w.WeekStart, w.Hours)).ToList()))
                .ToList());
    }

    private async Task<IActionResult?> ValidateLine(UpsertPlanLineItemRequest? body)
    {
        if (body is null || string.IsNullOrWhiteSpace(body.RoleTitle))
        {
            return new BadRequestObjectResult(new { error = "RoleTitle is required." });
        }

        if (ParseOrganization(body.Organization) is null)
        {
            return new BadRequestObjectResult(new { error = "Organization must be internal or subcontractor." });
        }

        if (body.PersonId is Guid personId)
        {
            var person = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == personId);
            if (person is null)
            {
                return new BadRequestObjectResult(new { error = "PersonId does not match a person." });
            }

            if (person.IsPlaceholder)
            {
                return new BadRequestObjectResult(new { error = "Use an unnamed line item instead of a placeholder person." });
            }
        }

        return null;
    }

    /// <summary>
    /// Post-win rolling-forecast changes (staffing swaps, roll-offs, change
    /// orders) must carry a reason so the audit trail explains them (DT-01a).
    /// </summary>
    private static IActionResult? RequireReason(PricingPlan plan, string? reason) =>
        plan.Status == PlanStatus.ClosedWon && string.IsNullOrWhiteSpace(reason)
            ? new BadRequestObjectResult(new { error = "A reason (e.g. staffing change or change order) is required for changes to a Closed/Won engagement." })
            : null;

    private static string WithReason(string value, string? reason) =>
        string.IsNullOrWhiteSpace(reason) ? value : $"{value} — {reason.Trim()}";

    private static void ApplyLine(PlanLineItem line, UpsertPlanLineItemRequest body)
    {
        var org = ParseOrganization(body.Organization)!.Value;
        line.RoleTitle = body.RoleTitle.Trim();
        line.Rank = body.Rank?.Trim();
        line.Geography = body.Geography?.Trim();
        line.Organization = org;
        line.SubcontractorFirm = org == LineItemOrganization.Subcontractor ? body.SubcontractorFirm?.Trim() : null;
        line.PersonId = org == LineItemOrganization.Internal ? body.PersonId : null;
        line.CostRateOverride = body.CostRateOverride;
        line.BillRateOverride = body.BillRateOverride;
        line.ClientRate = body.ClientRate;
    }

    internal static string StatusName(PlanStatus status) => status switch
    {
        PlanStatus.Draft => "draft",
        PlanStatus.ActivePursuit => "activePursuit",
        PlanStatus.ClosedWon => "closedWon",
        PlanStatus.ClosedLost => "closedLost",
        _ => status.ToString(),
    };

    private static PlanStatus? ParseStatus(string? value) => value?.ToLowerInvariant() switch
    {
        "draft" => PlanStatus.Draft,
        "activepursuit" => PlanStatus.ActivePursuit,
        "closedwon" => PlanStatus.ClosedWon,
        "closedlost" => PlanStatus.ClosedLost,
        _ => null,
    };

    private static PricingModel? ParsePricingModel(string? value) =>
        Enum.TryParse<PricingModel>(value, ignoreCase: true, out var model) && Enum.IsDefined(model) ? model : null;

    private static LineItemOrganization? ParseOrganization(string? value) =>
        Enum.TryParse<LineItemOrganization>(value, ignoreCase: true, out var org) && Enum.IsDefined(org) ? org : null;

    private static Dictionary<string, string?> Snapshot(PricingPlan p) => new()
    {
        [nameof(PricingPlan.MdOwnerId)] = p.MdOwnerId?.ToString(),
        [nameof(PricingPlan.Practice)] = p.Practice,
        [nameof(PricingPlan.Status)] = StatusName(p.Status),
        [nameof(PricingPlan.StartDate)] = p.StartDate.ToString("yyyy-MM-dd"),
        [nameof(PricingPlan.EndDate)] = p.EndDate.ToString("yyyy-MM-dd"),
        [nameof(PricingPlan.PricingModel)] = p.PricingModel.ToString(),
        [nameof(PricingPlan.BlendedRate)] = p.BlendedRate?.ToString("0.##"),
        [nameof(PricingPlan.FixedFee)] = p.FixedFee?.ToString("0.##"),
        [nameof(PricingPlan.TechnologyFees)] = p.TechnologyFees.ToString("0.##"),
        [nameof(PricingPlan.RecoverableExpenses)] = p.RecoverableExpenses.ToString("0.##"),
        [nameof(PricingPlan.Notes)] = p.Notes,
    };

    private static Dictionary<string, string?> SnapshotLine(PlanLineItem l) => new()
    {
        [nameof(PlanLineItem.RoleTitle)] = l.RoleTitle,
        [nameof(PlanLineItem.Rank)] = l.Rank,
        [nameof(PlanLineItem.Geography)] = l.Geography,
        [nameof(PlanLineItem.Organization)] = l.Organization.ToString(),
        [nameof(PlanLineItem.SubcontractorFirm)] = l.SubcontractorFirm,
        [nameof(PlanLineItem.PersonId)] = l.PersonId?.ToString(),
        [nameof(PlanLineItem.CostRateOverride)] = l.CostRateOverride?.ToString("0.##"),
        [nameof(PlanLineItem.BillRateOverride)] = l.BillRateOverride?.ToString("0.##"),
        [nameof(PlanLineItem.ClientRate)] = l.ClientRate?.ToString("0.##"),
    };
}
