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

public class ClientsFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    [Function("ListClients")]
    public async Task<IActionResult> List(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "clients")] HttpRequest req)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var clients = await db.Clients.AsNoTracking().OrderBy(c => c.Name).ToListAsync();

        // Clients may exist implicitly through projects before a client record is created.
        var projectClientNames = await db.Projects.AsNoTracking().Select(p => p.ClientName).Distinct().ToListAsync();
        var known = clients.Select(c => c.Name).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var implicitClients = projectClientNames
            .Where(n => !known.Contains(n))
            .Select(n => new Client { ClientId = Guid.NewGuid(), Name = n });
        var missing = implicitClients.ToList();
        if (missing.Count > 0)
        {
            db.Clients.AddRange(missing);
            await db.SaveChangesAsync();
            clients = [.. clients.Concat(missing).OrderBy(c => c.Name)];
        }

        return new OkObjectResult(clients.Select(ClientDto.From).ToList());
    }

    [Function("GetClient")]
    public async Task<IActionResult> Get(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "clients/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var client = await db.Clients.AsNoTracking().FirstOrDefaultAsync(c => c.ClientId == id);
        if (client is null)
        {
            return new NotFoundResult();
        }

        var includeFinancials = result.User!.HasRole(AppRoles.Leadership);
        var projects = await db.Projects.AsNoTracking()
            .Where(p => p.ClientName == client.Name)
            .OrderBy(p => p.ProjectName)
            .ToListAsync();
        return new OkObjectResult(new
        {
            client = ClientDto.From(client),
            projects = projects.Select(p => ProjectDto.From(p, includeFinancials)).ToList(),
        });
    }

    [Function("UpdateClient")]
    public async Task<IActionResult> Update(
        [HttpTrigger(AuthorizationLevel.Anonymous, "put", Route = "clients/{id:guid}")] HttpRequest req, Guid id)
    {
        var result = auth.Authorize(req, AppRoles.Editor);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var body = await req.ReadFromJsonAsync<UpsertClientRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.Name))
        {
            return new BadRequestObjectResult(new { error = "Name is required." });
        }

        var client = await db.Clients.FirstOrDefaultAsync(c => c.ClientId == id);
        if (client is null)
        {
            return new NotFoundResult();
        }

        var newName = body.Name.Trim();
        if (!string.Equals(client.Name, newName, StringComparison.Ordinal))
        {
            if (await db.Clients.AnyAsync(c => c.ClientId != id && c.Name == newName))
            {
                return new ConflictObjectResult(new { error = "A client with that name already exists." });
            }

            // Keep projects linked to the renamed client.
            await db.Projects.Where(p => p.ClientName == client.Name)
                .ExecuteUpdateAsync(s => s.SetProperty(p => p.ClientName, newName));
        }

        var before = Snapshot(client);
        client.Name = newName;
        client.Industry = body.Industry?.Trim();
        client.RelationshipPartner = body.RelationshipPartner?.Trim();
        client.Notes = body.Notes?.Trim();

        audit.RecordDiff(nameof(Client), id.ToString(), before, Snapshot(client), result.User!.Oid);
        await db.SaveChangesAsync();
        return new OkObjectResult(ClientDto.From(client));
    }

    private static Dictionary<string, string?> Snapshot(Client c) => new()
    {
        [nameof(Client.Name)] = c.Name,
        [nameof(Client.Industry)] = c.Industry,
        [nameof(Client.RelationshipPartner)] = c.RelationshipPartner,
        [nameof(Client.Notes)] = c.Notes,
    };
}
