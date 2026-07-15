using CapacityTracker.Api.Dtos;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

/// <summary>
/// Builds the engagement-level invoice variance report: forecast invoice vs
/// captured invoice per billing period with cumulative positions (INV-04/05).
/// Cumulative variance only counts captured periods so open periods don't
/// distort the picture.
/// </summary>
public static class InvoiceVarianceService
{
    public static InvoiceVarianceReportDto Compute(
        Guid projectId,
        PricingModel feeStructure,
        IReadOnlyList<(DateOnly Period, decimal ForecastAmount)> forecasts,
        IReadOnlyList<InvoiceRecord> records)
    {
        var byPeriod = records.ToDictionary(r => r.PeriodStart);
        var rows = new List<InvoiceVarianceRowDto>();
        decimal cumForecast = 0, cumInvoiced = 0, cumVariance = 0;

        foreach (var (period, forecast) in forecasts.OrderBy(f => f.Period))
        {
            byPeriod.TryGetValue(period, out var record);
            cumForecast += forecast;
            decimal? variance = null, variancePct = null;
            if (record is not null)
            {
                cumInvoiced += record.InvoicedAmount;
                variance = record.InvoicedAmount - forecast;
                cumVariance += variance.Value;
                variancePct = forecast != 0 ? Math.Round(variance.Value / forecast * 100, 1) : null;
            }

            rows.Add(new InvoiceVarianceRowDto(
                period,
                forecast,
                record?.InvoicedAmount,
                record?.InvoiceDate,
                record?.Notes,
                variance,
                variancePct,
                cumForecast,
                cumInvoiced,
                cumVariance));
        }

        return new InvoiceVarianceReportDto(
            projectId,
            feeStructure.ToString(),
            rows,
            cumForecast,
            cumInvoiced,
            cumVariance);
    }
}
