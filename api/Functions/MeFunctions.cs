using CapacityTracker.Api.Auth;
using CapacityTracker.Api.Data;
using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;
using CapacityTracker.Api.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Azure.Functions.Worker;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Functions;

public class MeFunctions(CapacityDbContext db, RequestAuthorizer auth, AuditService audit)
{
    /// <summary>
    /// Returns the signed-in user and auto-provisions a Person record from the
    /// Entra OID on first sign-in.
    /// </summary>
    [Function("GetMe")]
    public async Task<IActionResult> GetMe(
        [HttpTrigger(AuthorizationLevel.Anonymous, "get", Route = "me")] HttpRequest req)
    {
        var result = auth.Authorize(req);
        if (!result.Allowed)
        {
            return result.Error!;
        }

        var user = result.User!;
        var person = await db.People.FirstOrDefaultAsync(p => p.PersonId == user.Oid);
        if (person is null)
        {
            person = new Person
            {
                PersonId = user.Oid,
                DisplayName = user.DisplayName,
                Email = user.Email,
                IsActive = true,
            };
            db.People.Add(person);
            audit.Record(nameof(Person), user.Oid.ToString(), "provisioned", null, "auto", user.Oid);
            await db.SaveChangesAsync();
        }

        return new OkObjectResult(new MeDto(user.Oid, user.DisplayName, user.Email, user.Roles));
    }
}
