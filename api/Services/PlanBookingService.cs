using CapacityTracker.Api.Data;
using CapacityTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Keeps utilization bookings in sync with a pricing plan's weekly hours grid.
/// Named internal line items on an Active Pursuit (pipeline) or Closed/Won
/// (committed) plan book hours to the plan's project; Draft and Closed/Lost
/// plans hold no bookings. Plan-managed rows carry PlanLineItemId and are
/// replaced wholesale on every sync; placeholder and subcontractor lines never
/// book.
/// </summary>
public class PlanBookingService(CapacityDbContext db)
{
    /// <summary>Recomputes plan-managed allocations. Caller must SaveChanges.</summary>
    public async Task SyncBookings(Guid pricingPlanId)
    {
        var plan = await db.PricingPlans
            .Include(p => p.LineItems)
            .ThenInclude(l => l.WeekHours)
            .FirstOrDefaultAsync(p => p.PricingPlanId == pricingPlanId);
        if (plan is null)
        {
            return;
        }

        var books = plan.Status is PlanStatus.ActivePursuit or PlanStatus.ClosedWon;
        var desired = new Dictionary<(Guid PersonId, DateOnly WeekStart), (decimal Hours, Guid LineId)>();
        if (books)
        {
            foreach (var line in plan.LineItems.Where(l =>
                l.PersonId is not null && l.Organization == LineItemOrganization.Internal))
            {
                foreach (var wh in line.WeekHours.Where(w => w.Hours > 0))
                {
                    var key = (line.PersonId!.Value, wh.WeekStart);
                    desired[key] = desired.TryGetValue(key, out var cur)
                        ? (cur.Hours + wh.Hours, cur.LineId)
                        : (wh.Hours, line.PlanLineItemId);
                }
            }
        }

        var personIds = desired.Keys.Select(k => k.PersonId).Distinct().ToList();
        var existing = await db.Allocations
            .Where(a => a.ProjectId == plan.ProjectId
                && (a.PlanLineItemId != null || personIds.Contains(a.PersonId)))
            .ToListAsync();

        foreach (var alloc in existing)
        {
            if (desired.TryGetValue((alloc.PersonId, alloc.WeekStart), out var want))
            {
                alloc.Hours = want.Hours;
                alloc.PlanLineItemId = want.LineId;
                desired.Remove((alloc.PersonId, alloc.WeekStart));
            }
            else if (alloc.PlanLineItemId is not null)
            {
                db.Allocations.Remove(alloc);
            }
        }

        foreach (var ((personId, weekStart), (hours, lineId)) in desired)
        {
            db.Allocations.Add(new Allocation
            {
                AllocationId = Guid.NewGuid(),
                PersonId = personId,
                ProjectId = plan.ProjectId,
                WeekStart = weekStart,
                Hours = hours,
                PlanLineItemId = lineId,
            });
        }
    }
}
