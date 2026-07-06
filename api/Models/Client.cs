namespace CapacityTracker.Api.Models;

/// <summary>
/// A client account. Projects link to a client by <see cref="Name"/>.
/// </summary>
public class Client
{
    public Guid ClientId { get; set; }
    public string Name { get; set; } = string.Empty;
    public string? Industry { get; set; }
    public string? RelationshipPartner { get; set; }
    public string? Notes { get; set; }
}
