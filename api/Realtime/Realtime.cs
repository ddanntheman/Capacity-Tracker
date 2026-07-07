using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.SignalRService;

namespace CapacityTracker.Api.Realtime;

public static class Realtime
{
    public const string HubName = "capacity";

    /// <summary>Name of the SignalR client event the React app listens for.</summary>
    public const string AllocationChangedEvent = "allocationChanged";

    /// <summary>Group is keyed by the ISO date of the affected week's Monday.</summary>
    public static string WeekGroup(DateOnly weekStart) => $"week:{weekStart:yyyy-MM-dd}";
}

/// <summary>Payload broadcast to clients when an allocation changes.</summary>
public record AllocationChange(
    string Action,
    Guid AllocationId,
    Guid PersonId,
    Guid ProjectId,
    string WeekStart,
    decimal Hours);

/// <summary>
/// Multi-output result for allocation writes: the HTTP response plus the SignalR
/// message published to the affected week's group.
/// </summary>
public class AllocationWriteOutput
{
    [SignalROutput(HubName = Realtime.HubName)]
    public SignalRMessageAction? SignalRMessage { get; set; }

    [HttpResult]
    public IActionResult HttpResponse { get; set; } = new OkResult();
}

/// <summary>
/// Multi-output result for range allocation writes: the HTTP response plus one
/// SignalR message per affected week's group.
/// </summary>
public class RangeAllocationWriteOutput
{
    [SignalROutput(HubName = Realtime.HubName)]
    public SignalRMessageAction[] SignalRMessages { get; set; } = [];

    [HttpResult]
    public IActionResult HttpResponse { get; set; } = new OkResult();
}
