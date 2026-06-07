namespace CapacityTracker.Api.Models;

/// <summary>
/// Append-only record of a single write. Never updated or deleted. References the
/// actor by Entra OID only (no PII such as name or email) per the requirements.
/// </summary>
public class AuditLog
{
    public long AuditLogId { get; set; }
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string FieldChanged { get; set; } = string.Empty;
    public string? OldValue { get; set; }
    public string? NewValue { get; set; }
    public Guid ChangedBy { get; set; }
    public DateTime ChangedAt { get; set; }
}
