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
    string? Notes,
    bool IsActive)
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
        p.Notes,
        p.IsActive);
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
    string? Notes);

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
    string? Notes)
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
        p.Notes);
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
    string? Notes);
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
    string? Notes);

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

// Identity
public record MeDto(Guid Oid, string DisplayName, string Email, IEnumerable<string> Roles);

// Dashboard
public record WeekUtilizationDto(DateOnly WeekStart, int TotalAllocatedPercent, int PeopleCount, double AverageUtilization);
public record CapacitySummaryDto(DateOnly WeekStart, int PeopleCount, int FullyAllocated, int OverAllocated, int Underutilized, double AverageUtilization);
