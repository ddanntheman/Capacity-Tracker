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

/// <summary>
/// Win conversion (CW-01..05) and revenue setup (RS-01..07): monthly revenue
/// phasing, the authorized Closed/Won conversion, Task Order documents, and
/// the confirmed revenue setup for won engagements.
/// </summary>
public class RevenueFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit, PlanBookingService booking, BaselineService baseline)
{
    private const decimal TieTolerance = 0.5m;
    private const long MaxDocumentBytes = 15 * 1024 * 1024;

    // ---- Revenue phasing ----

    [Function("GetPlanPhasing")]
    public async Task<IActionResult> GetPhasing(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "plans/{id:guid}/phasing")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        var economics = await ComputeEconomics(plan);
        var saved = await db.RevenuePhases.AsNoTracking()
            .Where(r => r.PricingPlanId == id)
            .OrderBy(r => r.PeriodStart)
            .ToListAsync();

        var forecast = saved.Where(r => r.Layer == RevenueLayer.Forecast)
            .Select(r => new RevenuePhaseDto(r.PeriodStart, r.Amount, r.IsInferred))
            .ToList();
        if (forecast.Count == 0)
        {
            // Propose an inferred phasing until the EM saves one (RS-06).
            forecast = RevenuePhasingService.ProposeMonthly(plan, economics);
        }

        var original = saved.Where(r => r.Layer == RevenueLayer.OriginalPlan)
            .Select(r => new RevenuePhaseDto(r.PeriodStart, r.Amount, r.IsInferred))
            .ToList();

        return new OkObjectResult(new PlanPhasingDto(
            economics.Tcv,
            TiesOut(forecast, economics.Tcv),
            forecast,
            original));
    }

    [Function("SavePlanPhasing")]
    public async Task<IActionResult> SavePhasing(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "plans/{id:guid}/phasing")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<SavePhasingRequest>();
        if (body?.Phases is null || body.Phases.Count == 0)
        {
            return new BadRequestObjectResult(new { error = "Phases are required." });
        }

        if (body.Phases.GroupBy(p => new DateOnly(p.PeriodStart.Year, p.PeriodStart.Month, 1)).Any(g => g.Count() > 1))
        {
            return new BadRequestObjectResult(new { error = "One amount per calendar month." });
        }

        var plan = await LoadPlan(id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "Closed/Lost plans are read-only." });
        }

        // The Original Plan layer is immutable; only the Forecast layer is editable.
        var existing = await db.RevenuePhases
            .Where(r => r.PricingPlanId == id && r.Layer == RevenueLayer.Forecast)
            .ToListAsync();
        var oldTotal = existing.Sum(r => r.Amount);
        db.RevenuePhases.RemoveRange(existing);
        foreach (var phase in body.Phases)
        {
            db.RevenuePhases.Add(new RevenuePhase
            {
                RevenuePhaseId = Guid.NewGuid(),
                PricingPlanId = id,
                Layer = RevenueLayer.Forecast,
                PeriodStart = new DateOnly(phase.PeriodStart.Year, phase.PeriodStart.Month, 1),
                Amount = phase.Amount,
                IsInferred = false,
            });
        }

        audit.Record(nameof(PricingPlan), id.ToString(), "revenuePhasing",
            $"${oldTotal:0.##}", $"${body.Phases.Sum(p => p.Amount):0.##} across {body.Phases.Count} month(s)", result.User!.Oid);
        await db.SaveChangesAsync();
        return await GetPhasing(req, id);
    }

    // ---- Win conversion (CW-01..05) ----

    [Function("ConvertPlanToWon")]
    public async Task<IActionResult> Convert(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "plans/{id:guid}/convert")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<ConvertPlanRequest>();
        if (body is null || !body.ConfirmPricing)
        {
            return new BadRequestObjectResult(new { error = "Final pricing confirmation is required to convert (CW-01)." });
        }

        var plan = await db.PricingPlans
            .Include(p => p.Project)
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .FirstOrDefaultAsync(p => p.PricingPlanId == id);
        if (plan is null)
        {
            return new NotFoundResult();
        }

        if (plan.Status == PlanStatus.ClosedWon)
        {
            return new BadRequestObjectResult(new { error = "Plan is already Closed/Won." });
        }

        if (plan.Status == PlanStatus.ClosedLost)
        {
            return new BadRequestObjectResult(new { error = "A Closed/Lost plan cannot be converted." });
        }

        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var economics = PlanEconomicsService.Compute(plan, rateCard);
        if (economics.ValidationErrors.Count > 0)
        {
            return new BadRequestObjectResult(new { error = "Resolve pricing validation errors before converting.", details = economics.ValidationErrors });
        }

        var forecast = await db.RevenuePhases
            .Where(r => r.PricingPlanId == id && r.Layer == RevenueLayer.Forecast)
            .OrderBy(r => r.PeriodStart)
            .ToListAsync();
        var phases = forecast
            .Select(r => new RevenuePhaseDto(r.PeriodStart, r.Amount, r.IsInferred))
            .ToList();
        if (phases.Count == 0)
        {
            // No phasing saved yet: seed the proposed monthly phasing, which ties by construction.
            phases = RevenuePhasingService.ProposeMonthly(plan, economics);
            foreach (var phase in phases)
            {
                db.RevenuePhases.Add(new RevenuePhase
                {
                    RevenuePhaseId = Guid.NewGuid(),
                    PricingPlanId = id,
                    Layer = RevenueLayer.Forecast,
                    PeriodStart = phase.PeriodStart,
                    Amount = phase.Amount,
                    IsInferred = true,
                });
            }
        }

        if (!TiesOut(phases, economics.Tcv))
        {
            return new BadRequestObjectResult(new
            {
                error = $"Monthly revenue phasing (${phases.Sum(p => p.Amount):0.##}) must tie to TCV (${economics.Tcv:0.##}) before conversion (CW-03).",
            });
        }

        // Lock the phasing as the immutable Original Plan (CW-02/03).
        foreach (var phase in phases)
        {
            db.RevenuePhases.Add(new RevenuePhase
            {
                RevenuePhaseId = Guid.NewGuid(),
                PricingPlanId = id,
                Layer = RevenueLayer.OriginalPlan,
                PeriodStart = phase.PeriodStart,
                Amount = phase.Amount,
                IsInferred = false,
            });
        }

        var user = result.User!;
        var now = DateTime.UtcNow;
        plan.Status = PlanStatus.ClosedWon;
        plan.WonAtUtc = now;
        plan.WonBy = user.Email;
        plan.UpdatedAtUtc = now;

        // Reclassify pipeline bookings to committed by activating the engagement (CW-04).
        var project = plan.Project!;
        var previousProjectStatus = project.Status;
        project.Status = ProjectStatus.Active;
        await booking.SyncBookings(id);
        await db.SaveChangesAsync();

        if (project.BaselineLockedAtUtc is null)
        {
            await baseline.LockBaseline(project, user);
        }

        // Activate engagement financials seeded from the Original Plan (CW-05).
        var setup = await db.RevenueSetups.FirstOrDefaultAsync(r => r.ProjectId == project.ProjectId);
        if (setup is null)
        {
            db.RevenueSetups.Add(SeedSetup(project.ProjectId, plan, economics));
        }

        audit.Record(nameof(PricingPlan), id.ToString(), "convertedToWon",
            previousProjectStatus.ToString(), $"TCV ${economics.Tcv:0.##}, {phases.Count} month(s)", user.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(new { converted = true, tcv = economics.Tcv, months = phases.Count });
    }

    // ---- Task Order / contract documents (RS-01) ----

    [Function("ListEngagementDocuments")]
    public async Task<IActionResult> ListDocuments(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/documents")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var docs = await db.EngagementDocuments.AsNoTracking()
            .Where(d => d.ProjectId == id)
            .OrderByDescending(d => d.UploadedAtUtc)
            .Select(d => new EngagementDocumentDto(
                d.EngagementDocumentId, d.ProjectId, d.Kind.ToString(), d.FileName,
                d.ContentType, d.SizeBytes, d.UploadedAtUtc, d.UploadedBy))
            .ToListAsync();
        return new OkObjectResult(docs);
    }

    [Function("UploadEngagementDocument")]
    public async Task<IActionResult> UploadDocument(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/documents")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        if (!await db.Projects.AnyAsync(p => p.ProjectId == id))
        {
            return new NotFoundResult();
        }

        if (!req.HasFormContentType)
        {
            return new BadRequestObjectResult(new { error = "multipart/form-data with a 'file' field is required." });
        }

        var form = await req.ReadFormAsync();
        var file = form.Files.GetFile("file");
        if (file is null || file.Length == 0)
        {
            return new BadRequestObjectResult(new { error = "A non-empty 'file' field is required." });
        }

        if (file.Length > MaxDocumentBytes)
        {
            return new BadRequestObjectResult(new { error = "File exceeds the 15 MB limit." });
        }

        var kind = ParseKind(form["kind"]) ?? DocumentKind.TaskOrder;
        using var ms = new MemoryStream();
        await file.CopyToAsync(ms);

        var doc = new EngagementDocument
        {
            EngagementDocumentId = Guid.NewGuid(),
            ProjectId = id,
            Kind = kind,
            FileName = Path.GetFileName(file.FileName),
            ContentType = string.IsNullOrWhiteSpace(file.ContentType) ? "application/octet-stream" : file.ContentType,
            Content = ms.ToArray(),
            SizeBytes = file.Length,
            UploadedAtUtc = DateTime.UtcNow,
            UploadedBy = result.User!.Email,
        };
        db.EngagementDocuments.Add(doc);
        audit.Record(nameof(EngagementDocument), doc.EngagementDocumentId.ToString(), "uploaded", null,
            $"{doc.Kind}: {doc.FileName}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(EngagementDocumentDto.From(doc));
    }

    [Function("DownloadEngagementDocument")]
    public async Task<IActionResult> DownloadDocument(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/documents/{docId:guid}")] HttpRequest req, Guid id, Guid docId)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var doc = await db.EngagementDocuments.AsNoTracking()
            .FirstOrDefaultAsync(d => d.EngagementDocumentId == docId && d.ProjectId == id);
        if (doc is null)
        {
            return new NotFoundResult();
        }

        return new FileContentResult(doc.Content, doc.ContentType) { FileDownloadName = doc.FileName };
    }

    [Function("DeleteEngagementDocument")]
    public async Task<IActionResult> DeleteDocument(
        [HttpTrigger(AuthorizationLevel.Anonymous, "delete", Route = "projects/{id:guid}/documents/{docId:guid}")] HttpRequest req, Guid id, Guid docId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var doc = await db.EngagementDocuments.FirstOrDefaultAsync(d => d.EngagementDocumentId == docId && d.ProjectId == id);
        if (doc is null)
        {
            return new NotFoundResult();
        }

        var extractions = await db.TaskOrderExtractions.Where(t => t.EngagementDocumentId == docId).ToListAsync();
        db.TaskOrderExtractions.RemoveRange(extractions);
        db.EngagementDocuments.Remove(doc);
        audit.Record(nameof(EngagementDocument), docId.ToString(), "deleted", doc.FileName, null, result.User!.Oid);
        await db.SaveChangesAsync();
        return new NoContentResult();
    }

    // ---- Revenue setup (RS-02/03/04) ----

    [Function("GetRevenueSetup")]
    public async Task<IActionResult> GetSetup(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/revenue-setup")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var setup = await db.RevenueSetups.AsNoTracking().FirstOrDefaultAsync(r => r.ProjectId == id);
        return setup is null ? new OkObjectResult(null) : new OkObjectResult(RevenueSetupDto.From(setup));
    }

    /// <summary>
    /// Re-proposes the revenue setup deterministically from the pricing plan.
    /// This is the extraction fallback when no AI provider is configured
    /// (RS-02); values still require explicit EM confirmation (RS-03).
    /// </summary>
    [Function("ProposeRevenueSetup")]
    public async Task<IActionResult> ProposeSetup(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/revenue-setup/propose")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var plan = await db.PricingPlans
            .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
            .Include(p => p.LineItems).ThenInclude(l => l.Person)
            .FirstOrDefaultAsync(p => p.ProjectId == id);
        if (plan is null)
        {
            return new NotFoundObjectResult(new { error = "No pricing plan exists for this engagement." });
        }

        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        var economics = PlanEconomicsService.Compute(plan, rateCard);

        var setup = await db.RevenueSetups.FirstOrDefaultAsync(r => r.ProjectId == id);
        if (setup is null)
        {
            setup = SeedSetup(id, plan, economics);
            db.RevenueSetups.Add(setup);
        }
        else
        {
            if (setup.Confirmed)
            {
                return new BadRequestObjectResult(new { error = "Revenue setup is already confirmed; edit it explicitly instead of re-proposing." });
            }

            setup.FeeStructure = plan.PricingModel;
            setup.Tcv = economics.Tcv;
            setup.ContractRph = economics.JobRph;
            setup.IsInferred = true;
            setup.UpdatedAtUtc = DateTime.UtcNow;
        }

        audit.Record(nameof(RevenueSetup), setup.RevenueSetupId.ToString(), "proposed", null,
            $"{setup.FeeStructure}, TCV ${setup.Tcv:0.##}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(RevenueSetupDto.From(setup));
    }

    [Function("UpdateRevenueSetup")]
    public async Task<IActionResult> UpdateSetup(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "projects/{id:guid}/revenue-setup")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpdateRevenueSetupRequest>();
        if (body is null)
        {
            return new BadRequestObjectResult(new { error = "Body is required." });
        }

        if (!Enum.TryParse<PricingModel>(body.FeeStructure, true, out var feeStructure))
        {
            return new BadRequestObjectResult(new { error = "FeeStructure must be BlendedRate, RoleBased, FixedFee, Milestone, or Outcome." });
        }

        var setup = await db.RevenueSetups.FirstOrDefaultAsync(r => r.ProjectId == id);
        if (setup is null)
        {
            return new NotFoundObjectResult(new { error = "No revenue setup exists; propose one first." });
        }

        var before = $"{setup.FeeStructure}, TCV ${setup.Tcv:0.##}, confirmed={setup.Confirmed}";
        setup.FeeStructure = feeStructure;
        setup.Tcv = body.Tcv;
        setup.ContractRph = body.ContractRph;
        setup.InvoiceFrequency = body.InvoiceFrequency?.Trim();
        setup.InvoiceScheduleNotes = body.InvoiceScheduleNotes?.Trim();
        setup.IsInferred = false;
        setup.UpdatedAtUtc = DateTime.UtcNow;
        if (body.Confirm && !setup.Confirmed)
        {
            setup.Confirmed = true;
            setup.ConfirmedBy = result.User!.Email;
            setup.ConfirmedAtUtc = DateTime.UtcNow;
        }

        audit.Record(nameof(RevenueSetup), setup.RevenueSetupId.ToString(), body.Confirm ? "confirmed" : "updated",
            before, $"{setup.FeeStructure}, TCV ${setup.Tcv:0.##}, confirmed={setup.Confirmed}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(RevenueSetupDto.From(setup));
    }

    // ---- Monthly revenue: Original Plan vs Forecast (RS-07) ----

    [Function("GetProjectRevenue")]
    public async Task<IActionResult> GetProjectRevenue(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/revenue")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var phases = await db.RevenuePhases.AsNoTracking()
            .Where(r => db.PricingPlans.Any(p => p.PricingPlanId == r.PricingPlanId && p.ProjectId == id))
            .ToListAsync();

        var months = phases.Select(p => p.PeriodStart).Distinct().OrderBy(m => m).ToList();
        var rows = months.Select(m =>
        {
            var original = phases.Where(p => p.Layer == RevenueLayer.OriginalPlan && p.PeriodStart == m).Sum(p => p.Amount);
            var forecast = phases.Where(p => p.Layer == RevenueLayer.Forecast && p.PeriodStart == m).Sum(p => p.Amount);
            return new ProjectRevenueMonthDto(m, original, forecast, forecast - original);
        }).ToList();
        return new OkObjectResult(rows);
    }

    // ---- Helpers ----

    private static bool TiesOut(IReadOnlyList<RevenuePhaseDto> phases, decimal tcv) =>
        phases.Count > 0 && Math.Abs(phases.Sum(p => p.Amount) - tcv) <= TieTolerance;

    private static RevenueSetup SeedSetup(Guid projectId, PricingPlan plan, PlanEconomicsDto economics) => new()
    {
        RevenueSetupId = Guid.NewGuid(),
        ProjectId = projectId,
        FeeStructure = plan.PricingModel,
        Tcv = economics.Tcv,
        ContractRph = economics.JobRph,
        InvoiceFrequency = "monthly",
        IsInferred = true,
        Confirmed = false,
        UpdatedAtUtc = DateTime.UtcNow,
    };

    private static DocumentKind? ParseKind(string? kind) =>
        Enum.TryParse<DocumentKind>(kind, true, out var parsed) ? parsed : null;

    private Task<PricingPlan?> LoadPlan(Guid id) => db.PricingPlans
        .AsNoTracking()
        .Include(p => p.LineItems).ThenInclude(l => l.WeekHours)
        .Include(p => p.LineItems).ThenInclude(l => l.Person)
        .FirstOrDefaultAsync(p => p.PricingPlanId == id);

    private async Task<PlanEconomicsDto> ComputeEconomics(PricingPlan plan)
    {
        var rateCard = await db.RateCardEntries.AsNoTracking().ToListAsync();
        return PlanEconomicsService.Compute(plan, rateCard);
    }
}
