using CapacityTracker.Api.Models;

namespace CapacityTracker.Api.Dtos;

// People
public record PersonDto(
    Guid PersonId,
    string DisplayName,
    string Email,
    string? JobTitle,
    Guid? ManagerId,
    string? Rank,
    string? Practice,
    string? Location,
    string? Phone,
    DateOnly? StartDate,
    decimal? CostRate,
    decimal? BillRate,
    int? UtilizationTarget,
    int WeeklyCapacityHours,
    string? Skills,
    string? Certifications,
    string? IndustryExperience,
    string? StaffingPreferences,
    string? Notes,
    bool IsActive,
    bool IsPlaceholder)
{
    /// <summary>Cost and bill rates are only included for leadership callers.</summary>
    public static PersonDto From(Person p, bool includeFinancials) => new(
        p.PersonId,
        p.DisplayName,
        p.Email,
        p.JobTitle,
        p.ManagerId,
        p.Rank,
        p.Practice,
        p.Location,
        p.Phone,
        p.StartDate,
        includeFinancials ? p.CostRate : null,
        includeFinancials ? p.BillRate : null,
        p.UtilizationTarget,
        p.WeeklyCapacityHours,
        p.Skills,
        p.Certifications,
        p.IndustryExperience,
        p.StaffingPreferences,
        p.Notes,
        p.IsActive,
        p.IsPlaceholder);
}

public record CreatePersonRequest(
    string DisplayName,
    string Email,
    string? JobTitle,
    Guid? ManagerId,
    string? Rank,
    string? Practice,
    string? Location,
    string? Phone,
    DateOnly? StartDate,
    decimal? CostRate,
    decimal? BillRate,
    int? UtilizationTarget,
    int? WeeklyCapacityHours,
    string? Skills,
    string? Certifications,
    string? IndustryExperience,
    string? StaffingPreferences,
    string? Notes,
    bool? IsPlaceholder = null);

public record UpdatePersonRequest(
    string DisplayName,
    string Email,
    string? JobTitle,
    Guid? ManagerId,
    string? Rank,
    string? Practice,
    string? Location,
    string? Phone,
    DateOnly? StartDate,
    decimal? CostRate,
    decimal? BillRate,
    int? UtilizationTarget,
    int? WeeklyCapacityHours,
    string? Skills,
    string? Certifications,
    string? IndustryExperience,
    string? StaffingPreferences,
    string? Notes,
    bool IsActive);

// Projects
public record ProjectDto(
    Guid ProjectId,
    string ClientName,
    string ProjectName,
    DateOnly StartDate,
    DateOnly? EndDate,
    string Status,
    decimal? DealValue,
    int? WinProbability,
    string? EngagementType,
    Guid? DeliveryLeadId,
    string? Notes,
    string? JobCode,
    DateTime? BaselineLockedAtUtc)
{
    /// <summary>Deal value is only included for leadership callers.</summary>
    public static ProjectDto From(Project p, bool includeFinancials) => new(
        p.ProjectId,
        p.ClientName,
        p.ProjectName,
        p.StartDate,
        p.EndDate,
        p.Status.ToString().ToLowerInvariant(),
        includeFinancials ? p.DealValue : null,
        p.WinProbability,
        p.EngagementType,
        p.DeliveryLeadId,
        p.Notes,
        p.JobCode,
        p.BaselineLockedAtUtc);
}

public record CreateProjectRequest(
    string ClientName,
    string ProjectName,
    DateOnly StartDate,
    DateOnly? EndDate,
    string Status,
    decimal? DealValue,
    int? WinProbability,
    string? EngagementType,
    Guid? DeliveryLeadId,
    string? Notes,
    string? JobCode = null);
public record UpdateProjectRequest(
    string ClientName,
    string ProjectName,
    DateOnly StartDate,
    DateOnly? EndDate,
    string Status,
    decimal? DealValue,
    int? WinProbability,
    string? EngagementType,
    Guid? DeliveryLeadId,
    string? Notes,
    string? JobCode = null);

public record ProjectBaselineDto(
    DateTime LockedAtUtc,
    string? LockedBy,
    List<ProjectBaselineLineDto> Lines);
public record ProjectBaselineLineDto(
    Guid PersonId,
    string PersonName,
    bool IsPlaceholder,
    DateOnly WeekStart,
    decimal Hours);

// Clients
public record ClientDto(Guid ClientId, string Name, string? Industry, string? RelationshipPartner, string? Notes)
{
    public static ClientDto From(Client c) => new(c.ClientId, c.Name, c.Industry, c.RelationshipPartner, c.Notes);
}

public record UpsertClientRequest(string Name, string? Industry, string? RelationshipPartner, string? Notes);

public record MergeClientRequest(Guid TargetClientId);

// Practices
public record PracticeDto(Guid PracticeId, string Name, Guid? LeadId, int? DefaultUtilizationTarget, bool IsArchived, int Headcount)
{
    public static PracticeDto From(Practice p, int headcount) => new(p.PracticeId, p.Name, p.LeadId, p.DefaultUtilizationTarget, p.IsArchived, headcount);
}

public record UpsertPracticeRequest(string Name, Guid? LeadId, int? DefaultUtilizationTarget, bool? IsArchived);

public record MergePracticeRequest(Guid TargetPracticeId);

public record MergePersonRequest(Guid TargetPersonId);

public record MergeProjectRequest(Guid TargetProjectId);

public record SplitProjectRequest(string[] NewNames);

// Actuals
public record ActualHoursDto(Guid ActualHoursId, Guid PersonId, DateOnly Month, decimal ChargeableHours)
{
    public static ActualHoursDto From(ActualHours a) => new(a.ActualHoursId, a.PersonId, a.Month, a.ChargeableHours);
}

public record UpsertActualHoursRequest(Guid PersonId, DateOnly Month, decimal ChargeableHours);

// Allocations
public record AllocationDto(Guid AllocationId, Guid PersonId, Guid ProjectId, DateOnly WeekStart, decimal Hours)
{
    public static AllocationDto From(Allocation a) => new(a.AllocationId, a.PersonId, a.ProjectId, a.WeekStart, a.Hours);
}

public record UpsertAllocationRequest(Guid PersonId, Guid ProjectId, DateOnly WeekStart, decimal Hours);

/// <summary>Staff a person on a project for a run of weeks at a constant hours/week.</summary>
public record RangeUpsertAllocationRequest(Guid PersonId, Guid ProjectId, DateOnly WeekStart, int Weeks, decimal HoursPerWeek);

// Rate card
public record RateCardEntryDto(Guid RateCardEntryId, string Rank, string Geography, DateOnly EffectiveFrom, decimal CostRate, decimal BillRate)
{
    public static RateCardEntryDto From(RateCardEntry r) =>
        new(r.RateCardEntryId, r.Rank, r.Geography, r.EffectiveFrom, r.CostRate, r.BillRate);
}

public record UpsertRateCardEntryRequest(string Rank, string Geography, DateOnly EffectiveFrom, decimal CostRate, decimal BillRate);

// Pricing plans
public record PricingPlanSummaryDto(
    Guid PricingPlanId,
    Guid ProjectId,
    string ClientName,
    string ProjectName,
    Guid? MdOwnerId,
    string? MdOwnerName,
    string? Practice,
    string Status,
    DateOnly StartDate,
    DateOnly EndDate,
    string PricingModel,
    int LineItemCount,
    decimal TotalHours,
    DateTime UpdatedAtUtc);

public record PlanWeekHoursDto(DateOnly WeekStart, decimal Hours);

public record PlanLineItemDto(
    Guid PlanLineItemId,
    string RoleTitle,
    string? Rank,
    string? Geography,
    string Organization,
    string? SubcontractorFirm,
    Guid? PersonId,
    string? PersonName,
    decimal? CostRateOverride,
    decimal? BillRateOverride,
    decimal? ClientRate,
    int SortOrder,
    List<PlanWeekHoursDto> WeekHours);

public record PricingPlanDto(
    Guid PricingPlanId,
    Guid ProjectId,
    string ClientName,
    string ProjectName,
    Guid? MdOwnerId,
    string? Practice,
    string Status,
    DateOnly StartDate,
    DateOnly EndDate,
    string PricingModel,
    decimal? BlendedRate,
    decimal? FixedFee,
    decimal TechnologyFees,
    decimal RecoverableExpenses,
    string? Notes,
    DateTime CreatedAtUtc,
    DateTime UpdatedAtUtc,
    List<PlanLineItemDto> LineItems);

public record CreatePricingPlanRequest(
    Guid? ProjectId,
    string? ClientName,
    string? ProjectName,
    Guid? MdOwnerId,
    string? Practice,
    DateOnly StartDate,
    DateOnly EndDate,
    string? PricingModel);

public record UpdatePricingPlanRequest(
    Guid? MdOwnerId,
    string? Practice,
    string Status,
    DateOnly StartDate,
    DateOnly EndDate,
    string PricingModel,
    decimal? BlendedRate,
    decimal? FixedFee,
    decimal TechnologyFees,
    decimal RecoverableExpenses,
    string? Notes);

public record UpsertPlanLineItemRequest(
    string RoleTitle,
    string? Rank,
    string? Geography,
    string Organization,
    string? SubcontractorFirm,
    Guid? PersonId,
    decimal? CostRateOverride,
    decimal? BillRateOverride,
    decimal? ClientRate,
    int? SortOrder,
    string? Reason = null);

public record SetPlanWeekHoursRequest(List<PlanWeekHoursDto> WeekHours, string? Reason = null);

// Plan economics (PR-08/09/10)
public record PlanLineEconomicsDto(
    Guid PlanLineItemId,
    string RoleTitle,
    string? PersonName,
    string Organization,
    decimal TotalHours,
    decimal? CostRate,
    decimal? ClientRate,
    decimal Fees,
    decimal Cost,
    decimal Margin);

public record PlanWeekEconomicsDto(DateOnly WeekStart, decimal Hours, decimal CumulativeHours, decimal Fees, decimal Cost, decimal Margin);

public record PlanEconomicsDto(
    decimal TotalHours,
    decimal LaborFees,
    decimal TechnologyFees,
    decimal Tcv,
    decimal? JobRph,
    decimal InternalCost,
    decimal SubcontractorCost,
    decimal GrossProfit,
    decimal? JobMarginPct,
    // Andersen/SAP metrics view
    decimal GrossFeesAtStandard,
    decimal RecoverableExpenses,
    decimal NetFees,
    decimal FeeAdjustment,
    decimal? RecoveryPct,
    decimal BillableHours,
    decimal? InternalRph,
    decimal? InternalMarginPct,
    List<PlanLineEconomicsDto> Lines,
    List<PlanWeekEconomicsDto> Weeks,
    List<string> ValidationErrors);

// Revenue phasing & win conversion (CW-01..05, RS-01..07)
public record RevenuePhaseDto(DateOnly PeriodStart, decimal Amount, bool IsInferred);

public record PlanPhasingDto(
    decimal Tcv,
    bool TiesOut,
    List<RevenuePhaseDto> Forecast,
    List<RevenuePhaseDto> OriginalPlan);

public record SavePhasingRequest(List<RevenuePhaseDto> Phases);

public record ConvertPlanRequest(bool ConfirmPricing);

public record EngagementDocumentDto(
    Guid EngagementDocumentId,
    Guid ProjectId,
    string Kind,
    string FileName,
    string ContentType,
    long SizeBytes,
    DateTime UploadedAtUtc,
    string? UploadedBy)
{
    public static EngagementDocumentDto From(EngagementDocument d) => new(
        d.EngagementDocumentId,
        d.ProjectId,
        d.Kind.ToString(),
        d.FileName,
        d.ContentType,
        d.SizeBytes,
        d.UploadedAtUtc,
        d.UploadedBy);
}

public record RevenueSetupDto(
    Guid RevenueSetupId,
    Guid ProjectId,
    string FeeStructure,
    decimal Tcv,
    decimal? ContractRph,
    string? InvoiceFrequency,
    string? InvoiceScheduleNotes,
    bool IsInferred,
    bool Confirmed,
    string? ConfirmedBy,
    DateTime? ConfirmedAtUtc)
{
    public static RevenueSetupDto From(RevenueSetup r) => new(
        r.RevenueSetupId,
        r.ProjectId,
        r.FeeStructure.ToString(),
        r.Tcv,
        r.ContractRph,
        r.InvoiceFrequency,
        r.InvoiceScheduleNotes,
        r.IsInferred,
        r.Confirmed,
        r.ConfirmedBy,
        r.ConfirmedAtUtc);
}

public record UpdateRevenueSetupRequest(
    string FeeStructure,
    decimal Tcv,
    decimal? ContractRph,
    string? InvoiceFrequency,
    string? InvoiceScheduleNotes,
    bool Confirm);

public record ProjectRevenueMonthDto(DateOnly PeriodStart, decimal OriginalPlan, decimal Forecast, decimal Variance);

// Delivery tracking & ETC/EAC (DT-01..07, ETC-01..05)
public record LineActualDto(Guid PlanLineItemId, DateOnly WeekStart, decimal Hours, decimal HardCost, string Source, DateTime EnteredAtUtc, string? EnteredBy);

public record SaveLineActualsRequest(List<SaveLineActualEntry> Entries);
public record SaveLineActualEntry(Guid PlanLineItemId, DateOnly WeekStart, decimal Hours, decimal? HardCost);

public record WipUploadRequest(string Csv);
public record WipUploadResultDto(int MatchedRows, int UnmatchedRows, List<string> Unmatched);

public record ChangeOrderDto(
    Guid ChangeOrderId,
    Guid ProjectId,
    string Title,
    string? Notes,
    decimal DeltaHours,
    decimal DeltaFees,
    string Status,
    Guid? EngagementDocumentId,
    DateTime CreatedAtUtc,
    string? CreatedBy,
    DateTime? ApprovedAtUtc,
    string? ApprovedBy)
{
    public static ChangeOrderDto From(ChangeOrder c) => new(
        c.ChangeOrderId, c.ProjectId, c.Title, c.Notes, c.DeltaHours, c.DeltaFees,
        c.Status.ToString().ToLowerInvariant(), c.EngagementDocumentId,
        c.CreatedAtUtc, c.CreatedBy, c.ApprovedAtUtc, c.ApprovedBy);
}

public record UpsertChangeOrderRequest(string Title, string? Notes, decimal DeltaHours, decimal DeltaFees, Guid? EngagementDocumentId);

public record RecoverableExpenseDto(Guid RecoverableExpenseEntryId, Guid ProjectId, DateOnly PeriodStart, string Vendor, decimal Amount, string? Notes, DateTime EnteredAtUtc, string? EnteredBy)
{
    public static RecoverableExpenseDto From(RecoverableExpenseEntry r) => new(
        r.RecoverableExpenseEntryId, r.ProjectId, r.PeriodStart, r.Vendor, r.Amount, r.Notes, r.EnteredAtUtc, r.EnteredBy);
}

public record UpsertRecoverableExpenseRequest(DateOnly PeriodStart, string Vendor, decimal Amount, string? Notes);

public record EtcOverrideDto(Guid EtcOverrideId, decimal Hours, decimal Fees, string Justification, DateTime CreatedAtUtc, string? CreatedBy)
{
    public static EtcOverrideDto From(EtcOverride o) => new(o.EtcOverrideId, o.Hours, o.Fees, o.Justification, o.CreatedAtUtc, o.CreatedBy);
}

public record SetEtcOverrideRequest(decimal Hours, decimal Fees, string Justification);

public record EtcLineDto(
    Guid PlanLineItemId,
    string Label,
    string Organization,
    decimal ForecastHours,
    decimal ActualHours,
    decimal ActualHardCost,
    decimal EtcHours,
    decimal EacHours);

public record EtcSummaryDto(
    decimal ActualHours,
    decimal ActualFees,
    decimal ActualCost,
    decimal DerivedEtcHours,
    decimal DerivedEtcFees,
    decimal DerivedEtcCost,
    decimal? OverrideEtcHours,
    decimal? OverrideEtcFees,
    decimal EacHours,
    decimal EacFees,
    decimal EacCost,
    decimal? EacMarginPct,
    decimal BaselineHours,
    decimal OriginalTcv,
    decimal ApprovedChangeOrderHours,
    decimal ApprovedChangeOrderFees,
    decimal AmendedBaselineHours,
    decimal AmendedTcv,
    decimal HoursVariance,
    decimal FeesVariance,
    bool HoursOverrun,
    bool FeeOverrun,
    bool MarginErosion,
    List<EtcLineDto> Lines);

public record DeliveryWeekDto(DateOnly WeekStart, decimal ForecastHours, decimal? ActualHours, decimal? ActualHardCost, string? ActualSource);

public record DeliveryLineDto(
    Guid PlanLineItemId,
    string Label,
    string Organization,
    bool IsNamed,
    List<DeliveryWeekDto> Weeks);

public record ProjectDeliveryDto(
    Guid ProjectId,
    Guid PricingPlanId,
    string PlanStatus,
    DateOnly StartDate,
    DateOnly EndDate,
    List<DeliveryLineDto> Lines,
    EtcSummaryDto Etc,
    EtcOverrideDto? Override,
    List<ChangeOrderDto> ChangeOrders,
    List<RecoverableExpenseDto> Expenses,
    bool ActualsStale,
    DateTime? LastActualEntryUtc,
    List<DateOnly> ZeroRevenueMonths);

// Invoicing (INV-01..06)
public record InvoiceWeekCellDto(DateOnly WeekStart, decimal Hours, bool FromActuals);

public record InvoiceLineDto(
    Guid PlanLineItemId,
    string Role,
    string? Resource,
    string Organization,
    List<InvoiceWeekCellDto> Weeks,
    decimal TotalHours,
    decimal? Rate,
    decimal Amount);

public record ReconciliationLineDto(
    Guid PlanLineItemId,
    string Role,
    string? Resource,
    decimal ExpectedHours,
    decimal ChargedHours,
    decimal HoursVariance,
    decimal? StandardBillRate,
    decimal GrossFeesAtStandard);

public record InvoicePeriodDto(
    Guid ProjectId,
    DateOnly PeriodStart,
    string FeeStructure,
    bool FeeStructureConfirmed,
    string InvoiceBasis,
    List<InvoiceLineDto> Lines,
    decimal TotalHours,
    decimal InvoiceAmount,
    List<ReconciliationLineDto> Reconciliation,
    decimal GrossFeesAtStandard,
    decimal RecoverableExpenses,
    decimal NetFees,
    decimal FeeAdjustment,
    decimal? RecoveryPct,
    decimal? Rph,
    decimal? InvoicedAmount,
    DateOnly? InvoiceDate,
    string? InvoiceNotes,
    decimal? InvoiceVariance,
    List<DateOnly> AvailablePeriods);

public record CaptureInvoiceRequest(decimal InvoicedAmount, DateOnly? InvoiceDate, string? Notes);

// Firm/practice rollups (RU-01..06)
public record RollupMonthDto(
    DateOnly PeriodStart,
    decimal OriginalPlan,
    decimal Forecast,
    decimal Actual,
    decimal NetFeesForecast,
    decimal NetFeesActual,
    decimal? RevenueTarget,
    decimal? NetFeesTarget);

public record RollupEngagementMonthDto(DateOnly PeriodStart, decimal OriginalPlan, decimal Forecast, decimal Actual);

public record RollupEngagementDto(
    Guid ProjectId,
    Guid PricingPlanId,
    string Client,
    string Engagement,
    string JobCode,
    bool JobCodePlaceholder,
    string? MdOwner,
    string? EngagementType,
    string? Practice,
    string PlanStatus,
    List<RollupEngagementMonthDto> Months,
    decimal OriginalPlanTotal,
    decimal ForecastTotal,
    decimal ActualTotal);

public record FirmRollupDto(
    DateOnly From,
    DateOnly To,
    List<RollupMonthDto> Months,
    List<RollupEngagementDto> Engagements);

public record FirmTargetDto(DateOnly PeriodStart, decimal RevenueTarget, decimal NetFeesTarget, DateTime UpdatedAtUtc, string? UpdatedBy)
{
    public static FirmTargetDto From(FirmTarget t) => new(t.PeriodStart, t.RevenueTarget, t.NetFeesTarget, t.UpdatedAtUtc, t.UpdatedBy);
}

public record UpsertFirmTargetsRequest(List<UpsertFirmTargetEntry> Targets);
public record UpsertFirmTargetEntry(DateOnly PeriodStart, decimal RevenueTarget, decimal NetFeesTarget);

// Identity
public record MeDto(Guid Oid, string DisplayName, string Email, IEnumerable<string> Roles);

// Dashboard
public record WeekUtilizationDto(DateOnly WeekStart, int TotalAllocatedPercent, int PeopleCount, double AverageUtilization);
public record CapacitySummaryDto(DateOnly WeekStart, int PeopleCount, int FullyAllocated, int OverAllocated, int Underutilized, double AverageUtilization);
