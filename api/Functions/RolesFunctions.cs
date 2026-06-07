using System.Text.Json;
using System.Text.Json.Serialization;
using CapacityTracker.Api.Auth;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Extensions.Configuration;

namespace CapacityTracker.Api.Functions;

/// <summary>
/// Static Web Apps "rolesSource" endpoint. After a successful Entra ID sign-in,
/// SWA POSTs the authenticated principal (including the user's group claims) to
/// this function, which maps Entra security group object IDs to the application
/// roles (viewer/editor/leadership). The group-to-role mapping is supplied via
/// app settings so the security group IDs can be set per environment without a
/// code change:
///   GROUP_VIEWER, GROUP_EDITOR, GROUP_LEADERSHIP
/// See https://learn.microsoft.com/azure/static-web-apps/assign-roles-microsoft-graph
/// </summary>
public class RolesFunctions(IConfiguration config)
{
    private sealed record RolesRequest(
        [property: JsonPropertyName("identityProvider")] string? IdentityProvider,
        [property: JsonPropertyName("userId")] string? UserId,
        [property: JsonPropertyName("userDetails")] string? UserDetails,
        [property: JsonPropertyName("claims")] List<RoleClaim>? Claims);

    private sealed record RoleClaim(
        [property: JsonPropertyName("typ")] string? Type,
        [property: JsonPropertyName("val")] string? Value);

    private sealed record RolesResponse(
        [property: JsonPropertyName("roles")] IReadOnlyList<string> Roles);

    [Function("GetRoles")]
    public async Task<IActionResult> GetRoles(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "GetRoles")] HttpRequest req)
    {
        RolesRequest? payload;
        try
        {
            payload = await JsonSerializer.DeserializeAsync<RolesRequest>(req.Body);
        }
        catch (JsonException)
        {
            payload = null;
        }

        var groupIds = payload?.Claims?
            .Where(c => string.Equals(c.Type, "groups", StringComparison.OrdinalIgnoreCase))
            .Select(c => c.Value)
            .Where(v => !string.IsNullOrWhiteSpace(v))
            .Select(v => v!)
            .ToHashSet(StringComparer.OrdinalIgnoreCase) ?? [];

        var roles = new List<string>();
        if (MatchesGroup(groupIds, "GROUP_LEADERSHIP"))
        {
            roles.Add(AppRoles.Leadership);
        }
        if (MatchesGroup(groupIds, "GROUP_EDITOR"))
        {
            roles.Add(AppRoles.Editor);
        }
        if (MatchesGroup(groupIds, "GROUP_VIEWER"))
        {
            roles.Add(AppRoles.Viewer);
        }

        return new OkObjectResult(new RolesResponse(roles));
    }

    private bool MatchesGroup(IReadOnlySet<string> groupIds, string settingName)
    {
        // A setting may contain a comma/semicolon separated list of group object IDs.
        var configured = config[settingName];
        if (string.IsNullOrWhiteSpace(configured))
        {
            return false;
        }

        return configured
            .Split([',', ';', ' '], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Any(groupIds.Contains);
    }
}
