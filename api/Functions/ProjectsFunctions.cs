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

public class ProjectsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit, BaselineService baseline)
{
    [Function("ListProjects")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        // The allocation picker only shows active + pipeline projects.
        var pickerOnly = req.Query["picker"] == "true";
        var query = db.Projects.AsNoTracking().AsQueryable();
        if (pickerOnly)
        {
            query = query.Where(p => p.Status != ProjectStatus.Closed);
        }

        var includeFinancials = result.User!.HasRole(AppRoles.Leadership);
        var entities = await query
            .OrderBy(p => p.ClientName).ThenBy(p => p.ProjectName)
            .ToListAsync();
        var projects = entities.Select(p => ProjectDto.From(p, includeFinancials)).ToList();
        return new OkObjectResult(projects);
    }

    [Function("CreateProject")]
    public async Task<IActionResult> Create(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<CreateProjectRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.ClientName) || string.IsNullOrWhiteSpace(body.ProjectName))
        {
            return new BadRequestObjectResult(new { error = "ClientName and ProjectName are required." });
        }
        if (!TryParseStatus(body.Status, out var status))
        {
            return new BadRequestObjectResult(new { error = "Status must be active, pipeline, or closed." });
        }

        var project = new Project
        {
            ProjectId = Guid.NewGuid(),
            ClientName = body.ClientName.Trim(),
            ProjectName = body.ProjectName.Trim(),
            StartDate = body.StartDate,
            EndDate = body.EndDate,
            Status = status,
            DealValue = body.DealValue,
            WinProbability = ClampProbability(body.WinProbability),
            EngagementType = body.EngagementType?.Trim(),
            DeliveryLeadId = body.DeliveryLeadId,
            Notes = body.Notes?.Trim(),
            JobCode = NormalizeJobCode(body.JobCode),
        };
        db.Projects.Add(project);
        await EnsureClient(project.ClientName);
        audit.Record(nameof(Project), project.ProjectId.ToString(), "created", null, project.ProjectName, result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/projects/{project.ProjectId}", ProjectDto.From(project, result.User!.HasRole(AppRoles.Leadership)));
    }

    [Function("UpdateProject")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "projects/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpdateProjectRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.ClientName) || string.IsNullOrWhiteSpace(body.ProjectName))
        {
            return new BadRequestObjectResult(new { error = "ClientName and ProjectName are required." });
        }
        if (!TryParseStatus(body.Status, out var status))
        {
            return new BadRequestObjectResult(new { error = "Status must be active, pipeline, or closed." });
        }

        var project = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == id);
        if (project is null)
        {
            return new NotFoundResult();
        }

        var before = Snapshot(project);
        var wonNow = project.Status == ProjectStatus.Pipeline
            && status == ProjectStatus.Active
            && project.BaselineLockedAtUtc is null;
        project.ClientName = body.ClientName.Trim();
        project.ProjectName = body.ProjectName.Trim();
        project.StartDate = body.StartDate;
        project.EndDate = body.EndDate;
        project.Status = status;
        project.DealValue = body.DealValue;
        project.WinProbability = ClampProbability(body.WinProbability);
        project.EngagementType = body.EngagementType?.Trim();
        project.DeliveryLeadId = body.DeliveryLeadId;
        project.Notes = body.Notes?.Trim();
        project.JobCode = NormalizeJobCode(body.JobCode);

        await EnsureClient(project.ClientName);
        if (wonNow)
        {
            await baseline.LockBaseline(project, result.User!);
        }
        audit.RecordDiff(nameof(Project), id.ToString(), before, Snapshot(project), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ProjectDto.From(project, result.User!.HasRole(AppRoles.Leadership)));
    }

    [Function("ArchiveProject")]
    public async Task<IActionResult> Archive(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/archive")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var project = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == id);
        if (project is null)
        {
            return new NotFoundResult();
        }

        var old = project.Status;
        project.Status = ProjectStatus.Closed;
        audit.Record(nameof(Project), id.ToString(), nameof(Project.Status), old.ToString(), nameof(ProjectStatus.Closed), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ProjectDto.From(project, result.User!.HasRole(AppRoles.Leadership)));
    }

    [Function("MergeProject")]
    public async Task<IActionResult> Merge(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/merge")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<MergeProjectRequest>();
        if (body is null || body.TargetProjectId == Guid.Empty || body.TargetProjectId == id)
        {
            return new BadRequestObjectResult(new { error = "A different target project is required." });
        }

        Project? target = null;
        IActionResult? failure = null;
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync();

            var source = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == id);
            target = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == body.TargetProjectId);
            if (source is null || target is null)
            {
                failure = new NotFoundResult();
                return;
            }

            // Move allocations to the target; sum hours where the same person-week already exists there.
            await db.Database.ExecuteSqlInterpolatedAsync($@"
UPDATE t SET t.[Hours] = t.[Hours] + s.[Hours]
FROM [Allocations] t
JOIN [Allocations] s ON s.[PersonId] = t.[PersonId] AND s.[WeekStart] = t.[WeekStart]
WHERE t.[ProjectId] = {target.ProjectId} AND s.[ProjectId] = {source.ProjectId}");
            await db.Database.ExecuteSqlInterpolatedAsync($@"
DELETE s FROM [Allocations] s
WHERE s.[ProjectId] = {source.ProjectId}
  AND EXISTS (SELECT 1 FROM [Allocations] t WHERE t.[ProjectId] = {target.ProjectId} AND t.[PersonId] = s.[PersonId] AND t.[WeekStart] = s.[WeekStart])");
            await db.Database.ExecuteSqlInterpolatedAsync(
                $"UPDATE [Allocations] SET [ProjectId] = {target.ProjectId} WHERE [ProjectId] = {source.ProjectId}");

            db.Projects.Remove(source);
            audit.Record(nameof(Project), id.ToString(), "merged", $"{source.ClientName} — {source.ProjectName}", $"{target.ClientName} — {target.ProjectName}", result.User!.Oid);
            await db.SaveChangesAsync();
            await tx.CommitAsync();
        });

        if (failure is not null)
        {
            return failure;
        }
        return new OkObjectResult(ProjectDto.From(target!, result.User!.HasRole(AppRoles.Leadership)));
    }

    [Function("SplitProject")]
    public async Task<IActionResult> Split(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "projects/{id:guid}/split")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<SplitProjectRequest>();
        var names = body?.NewNames?.Select(n => n?.Trim() ?? "").Where(n => n.Length > 0).Distinct().ToList() ?? [];
        if (names.Count < 2)
        {
            return new BadRequestObjectResult(new { error = "Provide at least two names to split into." });
        }

        var source = await db.Projects.FirstOrDefaultAsync(p => p.ProjectId == id);
        if (source is null)
        {
            return new NotFoundResult();
        }

        var originalName = source.ProjectName;

        // The first name keeps the source project (and its allocations); the rest become sibling
        // engagements under the same client so combined rows can be broken apart without losing history.
        source.ProjectName = names[0];
        audit.Record(nameof(Project), source.ProjectId.ToString(), "split", originalName, names[0], result.User!.Oid);

        var created = new List<Project> { source };
        foreach (var name in names.Skip(1))
        {
            var sibling = new Project
            {
                ProjectId = Guid.NewGuid(),
                ClientName = source.ClientName,
                ProjectName = name,
                StartDate = source.StartDate,
                EndDate = source.EndDate,
                Status = source.Status,
                DealValue = null,
                WinProbability = source.WinProbability,
                EngagementType = source.EngagementType,
                DeliveryLeadId = source.DeliveryLeadId,
                Notes = source.Notes,
            };
            db.Projects.Add(sibling);
            audit.Record(nameof(Project), sibling.ProjectId.ToString(), "created", null, $"split from {originalName}", result.User!.Oid);
            created.Add(sibling);
        }

        await db.SaveChangesAsync();
        var includeFinancials = result.User!.HasRole(AppRoles.Leadership);
        return new OkObjectResult(created.Select(p => ProjectDto.From(p, includeFinancials)).ToList());
    }

    [Function("GetProjectBaseline")]
    public async Task<IActionResult> GetBaseline(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "projects/{id:guid}/baseline")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var project = await db.Projects.AsNoTracking().FirstOrDefaultAsync(p => p.ProjectId == id);
        if (project is null)
        {
            return new NotFoundResult();
        }
        if (project.BaselineLockedAtUtc is null)
        {
            return new OkObjectResult(null);
        }

        var lines = await db.ProjectBaselineLines.AsNoTracking()
            .Where(l => l.ProjectId == id)
            .OrderBy(l => l.PersonName).ThenBy(l => l.WeekStart)
            .Select(l => new ProjectBaselineLineDto(l.PersonId, l.PersonName, l.IsPlaceholder, l.WeekStart, l.Hours))
            .ToListAsync();
        return new OkObjectResult(new ProjectBaselineDto(project.BaselineLockedAtUtc.Value, project.BaselineLockedBy, lines));
    }

    private Task EnsureClient(string name) => ClientsFunctions.InsertClientIfMissing(db, name);

    private static int? ClampProbability(int? value) => value is null ? null : Math.Clamp(value.Value, 0, 100);

    private static bool TryParseStatus(string? value, out ProjectStatus status) =>
        Enum.TryParse(value, ignoreCase: true, out status) && Enum.IsDefined(status);

    private static Dictionary<string, string?> Snapshot(Project p) => new()
    {
        [nameof(Project.ClientName)] = p.ClientName,
        [nameof(Project.ProjectName)] = p.ProjectName,
        [nameof(Project.StartDate)] = p.StartDate.ToString("o"),
        [nameof(Project.EndDate)] = p.EndDate?.ToString("o"),
        [nameof(Project.Status)] = p.Status.ToString(),
        [nameof(Project.DealValue)] = p.DealValue?.ToString(),
        [nameof(Project.WinProbability)] = p.WinProbability?.ToString(),
        [nameof(Project.EngagementType)] = p.EngagementType,
        [nameof(Project.DeliveryLeadId)] = p.DeliveryLeadId?.ToString(),
        [nameof(Project.Notes)] = p.Notes,
        [nameof(Project.JobCode)] = p.JobCode,
    };

    private static string? NormalizeJobCode(string? jobCode) =>
        string.IsNullOrWhiteSpace(jobCode) ? null : jobCode.Trim();
}
