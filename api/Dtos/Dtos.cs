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
public record ProjectDto(Guid ProjectId, string ClientName, string ProjectName, DateOnly StartDate, DateOnly? EndDate, string Status)
{
    public static ProjectDto From(Project p) => new(p.ProjectId, p.ClientName, p.ProjectName, p.StartDate, p.EndDate, p.Status.ToString().ToLowerInvariant());
}

public record CreateProjectRequest(string ClientName, string ProjectName, DateOnly StartDate, DateOnly? EndDate, string Status);
public record UpdateProjectRequest(string ClientName, string ProjectName, DateOnly StartDate, DateOnly? EndDate, string Status);

// Allocations
public record AllocationDto(Guid AllocationId, Guid PersonId, Guid ProjectId, DateOnly WeekStart, int PercentAllocated)
{
    public static AllocationDto From(Allocation a) => new(a.AllocationId, a.PersonId, a.ProjectId, a.WeekStart, a.PercentAllocated);
}

public record UpsertAllocationRequest(Guid PersonId, Guid ProjectId, DateOnly WeekStart, int PercentAllocated);

// Identity
public record MeDto(Guid Oid, string DisplayName, string Email, IEnumerable<string> Roles);

// Dashboard
public record WeekUtilizationDto(DateOnly WeekStart, int TotalAllocatedPercent, int PeopleCount, double AverageUtilization);
public record CapacitySummaryDto(DateOnly WeekStart, int PeopleCount, int FullyAllocated, int OverAllocated, int Underutilized, double AverageUtilization);
