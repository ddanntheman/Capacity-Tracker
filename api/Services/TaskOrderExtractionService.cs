using System.Text.RegularExpressions;
using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Services;

public record TaskOrderExtractionResult(
    PricingModel? FeeStructure,
    decimal? Tcv,
    decimal? ContractRph,
    string? InvoiceFrequency,
    List<string> Evidence)
{
    public bool HasAnyField => FeeStructure is not null || Tcv is not null || ContractRph is not null || InvoiceFrequency is not null;
}

/// <summary>
/// Heuristic extraction of revenue-setup terms from Task Order text (RS-02).
/// Proposes fee structure, TCV, blended/contract rate, and invoice frequency
/// where the document states them; every proposal carries the matched snippet
/// as evidence and requires explicit EM review and confirmation (RS-03).
/// </summary>
public static partial class TaskOrderExtractionService
{
    [GeneratedRegex(@"(?<label>total\s+contract\s+value|contract\s+value|total\s+fees?|total\s+price|not[\s-]?to[\s-]?exceed|tcv)\s*(?:\((?:tcv)\))?[^$\d]{0,40}\$?\s*(?<num>\d[\d,]*(?:\.\d+)?)\s*(?<unit>k\b|m\b|million|thousand)?", RegexOptions.IgnoreCase)]
    private static partial Regex TcvRegex();

    [GeneratedRegex(@"(?<label>blended\s+(?:hourly\s+)?rate|hourly\s+rate|rate)[^$\d]{0,40}\$\s*(?<num>\d[\d,]*(?:\.\d+)?)\s*(?:/|\s*per\s+)\s*(?:hour|hr)", RegexOptions.IgnoreCase)]
    private static partial Regex RateRegex();

    [GeneratedRegex(@"\$\s*(?<num>\d[\d,]*(?:\.\d+)?)\s*(?:/|\s*per\s+)\s*(?:hour|hr)", RegexOptions.IgnoreCase)]
    private static partial Regex BareRateRegex();

    [GeneratedRegex(@"(?:invoic\w+|bill\w+)[^.\n]{0,80}?(?<freq>monthly|quarterly|weekly|bi-?weekly|semi-?monthly|annually|upon\s+(?:milestone|completion|acceptance)|per\s+milestone|milestone)", RegexOptions.IgnoreCase)]
    private static partial Regex InvoiceFreqRegex();

    [GeneratedRegex(@"(?<freq>monthly|quarterly|weekly|bi-?weekly|semi-?monthly|annually|upon\s+(?:milestone|completion|acceptance)|per\s+milestone)[^.\n]{0,60}?(?:invoic\w+|bill\w+)", RegexOptions.IgnoreCase)]
    private static partial Regex FreqInvoiceRegex();

    private static readonly (string Pattern, PricingModel Model)[] FeeStructurePatterns =
    [
        (@"fixed[\s-]?(?:fee|price)", PricingModel.FixedFee),
        (@"time\s*(?:and|&)\s*materials?|t\s*&\s*m\b", PricingModel.RoleBased),
        (@"blended\s+(?:hourly\s+)?rate", PricingModel.BlendedRate),
        (@"milestone[\s-]based|per\s+milestone|milestone\s+payments?", PricingModel.Milestone),
        (@"outcome[\s-]based|value[\s-]based\s+fee", PricingModel.Outcome),
    ];

    public static TaskOrderExtractionResult Extract(string text)
    {
        var evidence = new List<string>();

        PricingModel? feeStructure = null;
        foreach (var (pattern, model) in FeeStructurePatterns)
        {
            var m = Regex.Match(text, pattern, RegexOptions.IgnoreCase);
            if (m.Success)
            {
                feeStructure = model;
                evidence.Add($"Fee structure ({model}): \u201c{Snippet(text, m)}\u201d");
                break;
            }
        }

        decimal? tcv = null;
        var tcvMatch = TcvRegex().Match(text);
        if (tcvMatch.Success && TryParseAmount(tcvMatch.Groups["num"].Value, tcvMatch.Groups["unit"].Value, out var tcvValue))
        {
            tcv = tcvValue;
            evidence.Add($"TCV (${tcvValue:0.##}): \u201c{Snippet(text, tcvMatch)}\u201d");
        }

        decimal? rph = null;
        var rateMatch = RateRegex().Match(text);
        if (!rateMatch.Success)
        {
            rateMatch = BareRateRegex().Match(text);
        }

        if (rateMatch.Success && TryParseAmount(rateMatch.Groups["num"].Value, string.Empty, out var rateValue))
        {
            rph = rateValue;
            evidence.Add($"Rate (${rateValue:0.##}/hr): \u201c{Snippet(text, rateMatch)}\u201d");
        }

        string? invoiceFrequency = null;
        var freqMatch = InvoiceFreqRegex().Match(text);
        if (!freqMatch.Success)
        {
            freqMatch = FreqInvoiceRegex().Match(text);
        }

        if (freqMatch.Success)
        {
            invoiceFrequency = NormalizeFrequency(freqMatch.Groups["freq"].Value);
            evidence.Add($"Invoice frequency ({invoiceFrequency}): \u201c{Snippet(text, freqMatch)}\u201d");
        }

        return new TaskOrderExtractionResult(feeStructure, tcv, rph, invoiceFrequency, evidence);
    }

    /// <summary>Only plain-text formats are extractable (TO-01): txt, md, csv.</summary>
    public static bool IsExtractable(EngagementDocument doc)
    {
        if (doc.ContentType.StartsWith("text/", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var ext = Path.GetExtension(doc.FileName).ToLowerInvariant();
        return ext is ".txt" or ".md" or ".markdown" or ".csv";
    }

    private static bool TryParseAmount(string number, string unit, out decimal value)
    {
        if (!decimal.TryParse(number.Replace(",", string.Empty), out value))
        {
            return false;
        }

        value *= unit.Trim().ToLowerInvariant() switch
        {
            "k" or "thousand" => 1_000m,
            "m" or "million" => 1_000_000m,
            _ => 1m,
        };
        return value > 0;
    }

    private static string NormalizeFrequency(string raw)
    {
        var f = Regex.Replace(raw.Trim().ToLowerInvariant(), @"\s+", " ");
        return f.Contains("milestone") || f.Contains("completion") || f.Contains("acceptance") ? "milestone" : f;
    }

    private static string Snippet(string text, Match m)
    {
        var start = Math.Max(0, m.Index - 20);
        var end = Math.Min(text.Length, m.Index + m.Length + 20);
        var snippet = text[start..end].ReplaceLineEndings(" ").Trim();
        return (start > 0 ? "…" : string.Empty) + snippet + (end < text.Length ? "…" : string.Empty);
    }
}
