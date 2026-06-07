using CapacityTracker.Api.Data;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Appends audit rows for write operations. Rows are added to the tracked
/// DbContext and committed in the same SaveChanges as the entity change.
/// </summary>
public class AuditService(CapacityDbContext db)
{
    public void Record(string entityType, string entityId, string field, string? oldValue, string? newValue, Guid changedBy)
    {
        db.AuditLogs.Add(new AuditLog
        {
            EntityType = entityType,
            EntityId = entityId,
            FieldChanged = field,
            OldValue = oldValue,
            NewValue = newValue,
            ChangedBy = changedBy,
            ChangedAt = DateTime.UtcNow,
        });
    }

    /// <summary>Records a row per changed field by diffing two dictionaries.</summary>
    public void RecordDiff(string entityType, string entityId, IDictionary<string, string?> before, IDictionary<string, string?> after, Guid changedBy)
    {
        foreach (var (field, newValue) in after)
        {
            before.TryGetValue(field, out var oldValue);
            if (!string.Equals(oldValue, newValue, StringComparison.Ordinal))
            {
                Record(entityType, entityId, field, oldValue, newValue, changedBy);
            }
        }
    }
}
