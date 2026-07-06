using System.Text.Json.Serialization;

namespace CapacityTracker.Api.Auth;

/// <summary>
/// Shape of the principal injected by Azure Static Web Apps via the
/// <c>x-ms-client-principal</c> header (base64-encoded JSON).
/// </summary>
public class ClientPrincipal
{
    [JsonPropertyName("identityProvider")]
    public string? IdentityProvider { get; set; }

    [JsonPropertyName("userId")]
    public string? UserId { get; set; }

    [JsonPropertyName("userDetails")]
    public string? UserDetails { get; set; }

    [JsonPropertyName("userRoles")]
    public List<string> UserRoles { get; set; } = [];

    [JsonPropertyName("claims")]
    public List<ClientPrincipalClaim> Claims { get; set; } = [];
}

public class ClientPrincipalClaim
{
    [JsonPropertyName("typ")]
    public string? Type { get; set; }

    [JsonPropertyName("val")]
    public string? Value { get; set; }
}
