namespace CapacityTracker.Api.Models;

/// <summary>
/// A consultant. PersonId is the user's Entra object id (OID), auto-provisioned
/// on first sign-in.
/// </summary>
public class Person
{
    public Guid PersonId { get; set; }
    public string DisplayName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;

    /// <summary>Job title (e.g. "Senior Consultant"), not the application role.</summary>
    public string? JobTitle { get; set; }

    public Guid? ManagerId { get; set; }
    public Person? Manager { get; set; }

    public bool IsActive { get; set; } = true;

    public ICollection<Allocation> Allocations { get; set; } = new List<Allocation>();
}
