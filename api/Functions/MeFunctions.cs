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
            var existing = string.IsNullOrWhiteSpace(user.Email)
                ? null
                : await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.Email == user.Email);

            if (existing is not null)
            {
                await AdoptExistingPersonAsync(existing, user.Oid);
            }
            else
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
        }

        return new OkObjectResult(new MeDto(user.Oid, user.DisplayName, user.Email, user.Roles));
    }

    /// <summary>
    /// Re-keys a pre-existing Person record (matched by email) to the signing-in
    /// user's Entra OID so their profile, allocations, and actuals follow their login.
    /// </summary>
    private async Task AdoptExistingPersonAsync(Person existing, Guid oid)
    {
        var strategy = db.Database.CreateExecutionStrategy();
        await strategy.ExecuteAsync(async () =>
        {
            db.ChangeTracker.Clear();
            await using var tx = await db.Database.BeginTransactionAsync();

            var source = await db.People.AsNoTracking().FirstOrDefaultAsync(p => p.PersonId == existing.PersonId);
            if (source is not null)
            {
                db.People.Add(new Person
                {
                    PersonId = oid,
                    DisplayName = source.DisplayName,
                    Email = source.Email,
                    JobTitle = source.JobTitle,
                    ManagerId = source.ManagerId,
                    Rank = source.Rank,
                    Practice = source.Practice,
                    Location = source.Location,
                    Phone = source.Phone,
                    StartDate = source.StartDate,
                    CostRate = source.CostRate,
                    BillRate = source.BillRate,
                    UtilizationTarget = source.UtilizationTarget,
                    WeeklyCapacityHours = source.WeeklyCapacityHours,
                    Skills = source.Skills,
                    Notes = source.Notes,
                    IsActive = source.IsActive,
                });
                audit.Record(nameof(Person), oid.ToString(), "linked", source.PersonId.ToString(), source.Email, oid);
                await db.SaveChangesAsync();

                await PeopleFunctions.MovePersonReferencesAsync(db, source.PersonId, oid);
                await db.People.Where(p => p.PersonId == source.PersonId).ExecuteDeleteAsync();
            }

            await tx.CommitAsync();
        });
    }
}
