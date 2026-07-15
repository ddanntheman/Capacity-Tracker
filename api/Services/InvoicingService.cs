using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Builds the client-facing invoice hours table at contract pricing and the
/// internal SAP reconciliation for one billing period (INV-01..06).
/// </summary>
public static class InvoicingService
{
    public static InvoicePeriodDto Compute(
        PricingPlan plan,
        IReadOnlyList<RateCardEntry> rateCard,
        IReadOnlyList<LineActual> actuals,
        PricingModel feeStructure,
        bool feeStructureConfirmed,
        decimal scheduledAmount,
        decimal expenses,
        InvoiceRecord? record,
        DateOnly period,
        List<DateOnly> periods)
    {
        var periodEnd = period.AddMonths(1);
        var feeBased = feeStructure is PricingModel.FixedFee or PricingModel.Milestone or PricingModel.Outcome;

        var actualsByLine = actuals.GroupBy(a => a.PlanLineItemId)
            .ToDictionary(g => g.Key, g => g.ToDictionary(a => a.WeekStart));

        var lines = new List<InvoiceLineDto>();
        var recon = new List<ReconciliationLineDto>();
        decimal totalHours = 0, hourlyAmount = 0, grossAtStandard = 0, chargedInternalHours = 0;

        foreach (var line in plan.LineItems.OrderBy(l => l.SortOrder).ThenBy(l => l.RoleTitle))
        {
            actualsByLine.TryGetValue(line.PlanLineItemId, out var byWeek);
            var isInternal = line.Organization == LineItemOrganization.Internal;
            var forecastByWeek = line.WeekHours.ToDictionary(w => w.WeekStart, w => w.Hours);
            var weekStarts = forecastByWeek.Keys
                .Concat(byWeek?.Keys ?? Enumerable.Empty<DateOnly>())
                .Where(w => w >= period && w < periodEnd)
                .Distinct()
                .OrderBy(w => w)
                .ToList();

            var cells = new List<InvoiceWeekCellDto>();
            decimal lineHours = 0, lineAmount = 0, lineExpected = 0, lineCharged = 0, lineGross = 0;
            decimal? sampleRate = null, sampleStandard = null;
            foreach (var week in weekStarts)
            {
                var actual = byWeek is not null && byWeek.TryGetValue(week, out var a) ? a : null;
                var hours = actual?.Hours ?? forecastByWeek.GetValueOrDefault(week);
                cells.Add(new InvoiceWeekCellDto(week, hours, actual is not null));
                lineHours += hours;

                // Contract rate resolved per week worked, so mid-period
                // effective-dated rate changes apply without duplicating the
                // resource row (INV-06).
                var standard = isInternal ? PlanEconomicsService.Resolve(rateCard, line.Rank, line.Geography, week) : null;
                var contractRate = feeBased ? 0m : feeStructure switch
                {
                    PricingModel.BlendedRate => plan.BlendedRate ?? 0m,
                    _ => line.ClientRate ?? line.BillRateOverride ?? standard?.BillRate ?? 0m,
                };
                sampleRate ??= feeBased ? null : contractRate;
                lineAmount += hours * contractRate;

                lineExpected += forecastByWeek.GetValueOrDefault(week);
                var charged = actual?.Hours ?? 0m;
                lineCharged += charged;
                if (isInternal)
                {
                    sampleStandard ??= standard?.BillRate;
                    lineGross += charged * (standard?.BillRate ?? 0m);
                }
            }

            if (cells.Count == 0)
            {
                continue;
            }

            totalHours += lineHours;
            hourlyAmount += lineAmount;
            lines.Add(new InvoiceLineDto(
                line.PlanLineItemId,
                line.RoleTitle,
                line.Person?.DisplayName,
                line.Organization.ToString().ToLowerInvariant(),
                cells,
                lineHours,
                sampleRate,
                lineAmount));

            if (isInternal)
            {
                chargedInternalHours += lineCharged;
                grossAtStandard += lineGross;
                recon.Add(new ReconciliationLineDto(
                    line.PlanLineItemId,
                    line.RoleTitle,
                    line.Person?.DisplayName,
                    lineExpected,
                    lineCharged,
                    lineCharged - lineExpected,
                    sampleStandard,
                    lineGross));
            }
        }

        // Fee-based work invoices from the confirmed invoice/milestone
        // schedule (the phased Revised Forecast), not from hours (INV-02).
        var invoiceAmount = feeBased ? scheduledAmount : hourlyAmount;
        var netFees = invoiceAmount - expenses;
        return new InvoicePeriodDto(
            plan.ProjectId,
            period,
            feeStructure.ToString(),
            feeStructureConfirmed,
            feeBased ? "schedule" : "hours",
            lines,
            totalHours,
            invoiceAmount,
            recon,
            grossAtStandard,
            expenses,
            netFees,
            netFees - grossAtStandard,
            grossAtStandard > 0 ? Math.Round(netFees / grossAtStandard * 100, 1) : null,
            chargedInternalHours > 0 ? Math.Round(netFees / chargedInternalHours, 2) : null,
            record?.InvoicedAmount,
            record?.InvoiceDate,
            record?.Notes,
            record is null ? null : record.InvoicedAmount - invoiceAmount,
            periods);
    }
}
