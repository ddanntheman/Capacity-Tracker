using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CapacityTracker.Api.Auth;

/// <summary>
/// Centralizes the 401/403 contract: any unauthenticated request gets 401, any
/// authenticated request lacking the required role gets 403.
/// </summary>
public class RequestAuthorizer(ICurrentUserAccessor accessor)
{
    public AuthResult Authorize(HttpRequest req, params string[] anyOfRoles)
    {
        var user = accessor.Resolve(req);
        if (user is null || !user.IsAuthenticated)
        {
            return new AuthResult(null, new UnauthorizedResult());
        }

        if (anyOfRoles.Length > 0 && !anyOfRoles.Any(user.HasRole))
        {
            return new AuthResult(user, new ObjectResult(new { error = "forbidden", requiredRoles = anyOfRoles })
            {
                StatusCode = StatusCodes.Status403Forbidden,
            });
        }

        return new AuthResult(user, null);
    }
}

public readonly record struct AuthResult(CurrentUser? User, IActionResult? Error)
{
    public bool Allowed => Error is null && User is not null;
}
