using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;

namespace CapacityTracker.Api.Auth;

/// <summary>Resolved identity for the current request.</summary>
public class CurrentUser
{
    public required Guid Oid { get; init; }
    public required string DisplayName { get; init; }
    public required string Email { get; init; }
    public required IReadOnlySet<string> Roles { get; init; }

    public bool IsAuthenticated => Oid != Guid.Empty;
    public bool HasRole(string role) => Roles.Contains(role);
}

public interface ICurrentUserAccessor
{
    /// <summary>Returns the principal for the request, or null if unauthenticated.</summary>
    CurrentUser? Resolve(HttpRequest req);
}

public class CurrentUserAccessor(IConfiguration config, ILogger<CurrentUserAccessor> logger) : ICurrentUserAccessor
{
    private const string Header = "x-ms-client-principal";
    private const string OidClaim = "http://schemas.microsoft.com/identity/claims/objectidentifier";

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public CurrentUser? Resolve(HttpRequest req)
    {
        var principal = Parse(req);
        if (principal is null)
        {
            principal = DevFallback(req);
            if (principal is null)
            {
                return null;
            }
        }

        var oid = ExtractOid(principal);
        if (oid == Guid.Empty)
        {
            logger.LogWarning("Client principal present but no object identifier claim found.");
            return null;
        }

        var roles = principal.UserRoles
            .Where(r => r is not ("anonymous" or "authenticated"))
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        return new CurrentUser
        {
            Oid = oid,
            DisplayName = principal.UserDetails ?? principal.UserId ?? oid.ToString(),
            Email = principal.UserDetails ?? string.Empty,
            Roles = roles,
        };
    }

    private ClientPrincipal? Parse(HttpRequest req)
    {
        if (!req.Headers.TryGetValue(Header, out var values))
        {
            return null;
        }

        try
        {
            var decoded = Encoding.UTF8.GetString(Convert.FromBase64String(values.ToString()));
            return JsonSerializer.Deserialize<ClientPrincipal>(decoded, JsonOptions);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to parse {Header} header.", Header);
            return null;
        }
    }

    /// <summary>
    /// When running outside Static Web Apps (local dev), allow a principal to be
    /// supplied via headers, gated behind the ALLOW_DEV_AUTH setting.
    /// </summary>
    private ClientPrincipal? DevFallback(HttpRequest req)
    {
        if (!string.Equals(config["ALLOW_DEV_AUTH"], "true", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        var oid = req.Headers.TryGetValue("x-dev-oid", out var o) && !string.IsNullOrWhiteSpace(o)
            ? o.ToString()
            : "00000000-0000-0000-0000-000000000001";
        var roles = req.Headers.TryGetValue("x-dev-roles", out var r) && !string.IsNullOrWhiteSpace(r)
            ? r.ToString()
            : config["DEV_DEFAULT_ROLES"] ?? "editor,leadership";
        var email = req.Headers.TryGetValue("x-dev-email", out var e) && !string.IsNullOrWhiteSpace(e)
            ? e.ToString()
            : "dev.user@bdemerson.com";

        return new ClientPrincipal
        {
            IdentityProvider = "dev",
            UserId = oid,
            UserDetails = email,
            UserRoles = roles.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList(),
            Claims = new List<ClientPrincipalClaim>
            {
                new() { Type = OidClaim, Value = oid },
            },
        };
    }

    private static Guid ExtractOid(ClientPrincipal principal)
    {
        var claim = principal.Claims.FirstOrDefault(c =>
            c.Type is OidClaim or "oid")?.Value;

        if (Guid.TryParse(claim, out var fromClaim))
        {
            return fromClaim;
        }

        // Fall back to userId when it is itself a GUID (Entra issues GUID userIds).
        return Guid.TryParse(principal.UserId, out var fromUserId) ? fromUserId : Guid.Empty;
    }
}
