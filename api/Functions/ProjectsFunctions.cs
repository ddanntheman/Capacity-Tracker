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

public class ProjectsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
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

        var projects = await query
            .OrderBy(p => p.ClientName).ThenBy(p => p.ProjectName)
            .Select(p => ProjectDto.From(p)).ToListAsync();
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
        };
        db.Projects.Add(project);
        audit.Record(nameof(Project), project.ProjectId.ToString(), "created", null, project.ProjectName, result.User!.Oid);
        await db.SaveChangesAsync();
        return new CreatedResult($"/api/projects/{project.ProjectId}", ProjectDto.From(project));
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
        project.ClientName = body.ClientName.Trim();
        project.ProjectName = body.ProjectName.Trim();
        project.StartDate = body.StartDate;
        project.EndDate = body.EndDate;
        project.Status = status;

        audit.RecordDiff(nameof(Project), id.ToString(), before, Snapshot(project), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ProjectDto.From(project));
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
        return new OkObjectResult(ProjectDto.From(project));
    }

    private static bool TryParseStatus(string? value, out ProjectStatus status) =>
        Enum.TryParse(value, ignoreCase: true, out status) && Enum.IsDefined(status);

    private static Dictionary<string, string?> Snapshot(Project p) => new()
    {
        [nameof(Project.ClientName)] = p.ClientName,
        [nameof(Project.ProjectName)] = p.ProjectName,
        [nameof(Project.StartDate)] = p.StartDate.ToString("o"),
        [nameof(Project.EndDate)] = p.EndDate?.ToString("o"),
        [nameof(Project.Status)] = p.Status.ToString(),
    };
}
