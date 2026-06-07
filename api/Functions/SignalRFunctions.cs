using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Realtime;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.Azure.Functions.Worker.SignalRService;

namespace CapacityTracker.Api.Functions;

public class SignalRFunctions(RequestAuthorizer auth)
{
    /// <summary>
    /// SignalR negotiate endpoint. The client calls this first to obtain a
    /// connection URL and access token for the serverless hub.
    /// </summary>
    [Function("Negotiate")]
    public IActionResult Negotiate(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "negotiate")] HttpRequest req,
        [SignalRConnectionInfoInput(HubName = Realtime.Realtime.HubName)] SignalRConnectionInfo connectionInfo)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed) return result.Error!;
        return new OkObjectResult(connectionInfo);
    }

    /// <summary>Adds a connection to the SignalR groups for the requested weeks.</summary>
    [Function("JoinGroups")]
    public async Task<GroupActionOutput> JoinGroups(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "groups/join")] HttpRequest req)
        => await ChangeGroups(req, SignalRGroupActionType.Add);

    /// <summary>Removes a connection from the SignalR groups for the requested weeks.</summary>
    [Function("LeaveGroups")]
    public async Task<GroupActionOutput> LeaveGroups(
        [HttpTrigger(AuthorizationLevel.Anonymous, "post", Route = "groups/leave")] HttpRequest req)
        => await ChangeGroups(req, SignalRGroupActionType.Remove);

    private async Task<GroupActionOutput> ChangeGroups(HttpRequest req, SignalRGroupActionType actionType)
    {
        var result = auth.Authorize(req, AppRoles.Viewer, AppRoles.Editor, AppRoles.Leadership);
        if (!result.Allowed) return new GroupActionOutput { HttpResponse = result.Error! };

        var body = await req.ReadFromJsonAsync<GroupSubscriptionRequest>();
        if (body is null || string.IsNullOrWhiteSpace(body.ConnectionId) || body.WeekStarts is null || body.WeekStarts.Count == 0)
        {
            return new GroupActionOutput { HttpResponse = new BadRequestObjectResult(new { error = "connectionId and weekStarts are required." }) };
        }

        var actions = body.WeekStarts
            .Where(w => DateOnly.TryParse(w, out _))
            .Select(w => new SignalRGroupAction(actionType)
            {
                ConnectionId = body.ConnectionId,
                GroupName = Realtime.Realtime.WeekGroup(DateOnly.Parse(w)),
            })
            .ToArray();

        return new GroupActionOutput
        {
            GroupActions = actions,
            HttpResponse = new OkObjectResult(new { joined = actionType == SignalRGroupActionType.Add, count = actions.Length }),
        };
    }
}

public record GroupSubscriptionRequest(string ConnectionId, List<string> WeekStarts);

public class GroupActionOutput
{
    [SignalROutput(HubName = Realtime.Realtime.HubName)]
    public SignalRGroupAction[]? GroupActions { get; set; }

    [HttpResult]
    public IActionResult HttpResponse { get; set; } = new OkResult();
}
