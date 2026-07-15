using System.Text;
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
/// Task Order extraction review (RS-02/03): heuristic extraction of
/// revenue-setup terms from uploaded Task Order text documents, persisted
/// with the source document and applied to the revenue setup only after
/// explicit review. Confirmation stays on the revenue setup itself.
/// </summary>
public class TaskOrderFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListTaskOrderExtractions")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/extractions")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var extractions = await db.TaskOrderExtractions.AsNoTracking()
            .Where(t => t.ProjectId == id)
            .OrderByDescending(t => t.CreatedAtUtc)
            .ToListAsync();
        return new OkObjectResult(extractions.Select(TaskOrderExtractionDto.From).ToList());
    }

    [Function("ExtractTaskOrderDocument")]
    public async Task<IActionResult> Extract(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/documents/{docId:guid}/extract")] HttpRequest req, Guid id, Guid docId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
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

        if (!TaskOrderExtractionService.IsExtractable(doc))
        {
            return new BadRequestObjectResult(new { error = "Only text documents (txt, md, csv) can be extracted." });
        }

        var text = Encoding.UTF8.GetString(doc.Content);
        var extracted = TaskOrderExtractionService.Extract(text);
        if (!extracted.HasAnyField)
        {
            return new BadRequestObjectResult(new { error = "No recognizable contract terms (fee structure, TCV, rate, invoice frequency) were found in the document." });
        }

        var extraction = new TaskOrderExtraction
        {
            TaskOrderExtractionId = Guid.NewGuid(),
            ProjectId = id,
            EngagementDocumentId = doc.EngagementDocumentId,
            FileName = doc.FileName,
            FeeStructure = extracted.FeeStructure,
            Tcv = extracted.Tcv,
            ContractRph = extracted.ContractRph,
            InvoiceFrequency = extracted.InvoiceFrequency,
            Evidence = string.Join("\n", extracted.Evidence),
            CreatedAtUtc = DateTime.UtcNow,
            CreatedBy = result.User!.Email,
        };
        db.TaskOrderExtractions.Add(extraction);
        audit.Record(nameof(TaskOrderExtraction), extraction.TaskOrderExtractionId.ToString(), "extracted", null,
            $"{doc.FileName}: {string.Join("; ", extracted.Evidence)}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(TaskOrderExtractionDto.From(extraction));
    }

    [Function("ApplyTaskOrderExtraction")]
    public async Task<IActionResult> Apply(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/extractions/{exId:guid}/apply")] HttpRequest req, Guid id, Guid exId)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var extraction = await db.TaskOrderExtractions
            .FirstOrDefaultAsync(t => t.TaskOrderExtractionId == exId && t.ProjectId == id);
        if (extraction is null)
        {
            return new NotFoundResult();
        }

        if (extraction.AppliedAtUtc is not null)
        {
            return new BadRequestObjectResult(new { error = "This extraction has already been applied." });
        }

        var setup = await db.RevenueSetups.FirstOrDefaultAsync(r => r.ProjectId == id);
        if (setup is not null && setup.Confirmed)
        {
            return new BadRequestObjectResult(new { error = "Revenue setup is already confirmed; edit it explicitly instead of applying an extraction." });
        }

        string before;
        if (setup is null)
        {
            before = "(none)";
            setup = new RevenueSetup
            {
                RevenueSetupId = Guid.NewGuid(),
                ProjectId = id,
                FeeStructure = extraction.FeeStructure ?? PricingModel.BlendedRate,
                Tcv = extraction.Tcv ?? 0,
                ContractRph = extraction.ContractRph,
                InvoiceFrequency = extraction.InvoiceFrequency,
                IsInferred = true,
                UpdatedAtUtc = DateTime.UtcNow,
            };
            db.RevenueSetups.Add(setup);
        }
        else
        {
            before = $"{setup.FeeStructure}, TCV ${setup.Tcv:0.##}";
            setup.FeeStructure = extraction.FeeStructure ?? setup.FeeStructure;
            setup.Tcv = extraction.Tcv ?? setup.Tcv;
            setup.ContractRph = extraction.ContractRph ?? setup.ContractRph;
            setup.InvoiceFrequency = extraction.InvoiceFrequency ?? setup.InvoiceFrequency;
            setup.IsInferred = true;
            setup.UpdatedAtUtc = DateTime.UtcNow;
        }

        extraction.AppliedAtUtc = DateTime.UtcNow;
        extraction.AppliedBy = result.User!.Email;

        audit.Record(nameof(RevenueSetup), setup.RevenueSetupId.ToString(), "extractionApplied",
            before, $"{setup.FeeStructure}, TCV ${setup.Tcv:0.##} from {extraction.FileName}", result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(RevenueSetupDto.From(setup));
    }
}
