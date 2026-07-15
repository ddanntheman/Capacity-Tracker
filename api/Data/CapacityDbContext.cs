using CapacityTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Data;

public class CapacityDbContext(DbContextOptions<CapacityDbContext> options) : DbContext(options)
{
    public DbSet<Person> People => Set<Person>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Allocation> Allocations => Set<Allocation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();
    public DbSet<Client> Clients => Set<Client>();
    public DbSet<ActualHours> Actuals => Set<ActualHours>();
    public DbSet<Practice> Practices => Set<Practice>();
    public DbSet<ProjectBaselineLine> ProjectBaselineLines => Set<ProjectBaselineLine>();
    public DbSet<RateCardEntry> RateCardEntries => Set<RateCardEntry>();
    public DbSet<PricingPlan> PricingPlans => Set<PricingPlan>();
    public DbSet<PlanLineItem> PlanLineItems => Set<PlanLineItem>();
    public DbSet<PlanWeekHours> PlanWeekHours => Set<PlanWeekHours>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Person>(e =>
        {
            e.HasKey(p => p.PersonId);
            e.Property(p => p.DisplayName).HasMaxLength(256).IsRequired();
            e.Property(p => p.Email).HasMaxLength(256).IsRequired();
            e.Property(p => p.JobTitle).HasMaxLength(256);
            e.Property(p => p.Rank).HasMaxLength(64);
            e.Property(p => p.Practice).HasMaxLength(128);
            e.Property(p => p.Location).HasMaxLength(128);
            e.Property(p => p.Phone).HasMaxLength(32);
            e.Property(p => p.CostRate).HasPrecision(10, 2);
            e.Property(p => p.BillRate).HasPrecision(10, 2);
            e.Property(p => p.Skills).HasMaxLength(1024);
            e.Property(p => p.Notes).HasMaxLength(4000);
            e.HasOne(p => p.Manager)
                .WithMany()
                .HasForeignKey(p => p.ManagerId)
                .OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(p => p.Email);
        });

        b.Entity<Project>(e =>
        {
            e.HasKey(p => p.ProjectId);
            e.Property(p => p.ClientName).HasMaxLength(256).IsRequired();
            e.Property(p => p.ProjectName).HasMaxLength(256).IsRequired();
            e.Property(p => p.Status).HasConversion<int>();
            e.Property(p => p.DealValue).HasPrecision(12, 2);
            e.Property(p => p.EngagementType).HasMaxLength(64);
            e.Property(p => p.Notes).HasMaxLength(4000);
            e.HasOne(p => p.DeliveryLead)
                .WithMany()
                .HasForeignKey(p => p.DeliveryLeadId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<Client>(e =>
        {
            e.HasKey(c => c.ClientId);
            e.Property(c => c.Name).HasMaxLength(256).IsRequired();
            e.Property(c => c.Industry).HasMaxLength(128);
            e.Property(c => c.RelationshipPartner).HasMaxLength(256);
            e.Property(c => c.Notes).HasMaxLength(4000);
            e.HasIndex(c => c.Name).IsUnique();
        });

        b.Entity<Practice>(e =>
        {
            e.HasKey(p => p.PracticeId);
            e.Property(p => p.Name).HasMaxLength(128).IsRequired();
            e.HasIndex(p => p.Name).IsUnique();
            e.HasOne(p => p.Lead)
                .WithMany()
                .HasForeignKey(p => p.LeadId)
                .OnDelete(DeleteBehavior.NoAction);
        });

        b.Entity<ActualHours>(e =>
        {
            e.HasKey(a => a.ActualHoursId);
            e.Property(a => a.ChargeableHours).HasPrecision(7, 2);
            e.HasOne(a => a.Person)
                .WithMany()
                .HasForeignKey(a => a.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
            // One row per person/month.
            e.HasIndex(a => new { a.PersonId, a.Month }).IsUnique();
        });

        b.Entity<Allocation>(e =>
        {
            e.HasKey(a => a.AllocationId);
            e.Property(a => a.Hours).HasPrecision(6, 2);
            e.HasOne(a => a.Person)
                .WithMany(p => p.Allocations)
                .HasForeignKey(a => a.PersonId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(a => a.Project)
                .WithMany(p => p.Allocations)
                .HasForeignKey(a => a.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            // One row per person/project/week.
            e.HasIndex(a => new { a.PersonId, a.ProjectId, a.WeekStart }).IsUnique();
            e.HasIndex(a => a.WeekStart);
        });

        b.Entity<RateCardEntry>(e =>
        {
            e.HasKey(r => r.RateCardEntryId);
            e.Property(r => r.Rank).HasMaxLength(64).IsRequired();
            e.Property(r => r.Geography).HasMaxLength(128).IsRequired();
            e.Property(r => r.CostRate).HasPrecision(10, 2);
            e.Property(r => r.BillRate).HasPrecision(10, 2);
            // One entry per rank/geography/effective date.
            e.HasIndex(r => new { r.Rank, r.Geography, r.EffectiveFrom }).IsUnique();
        });

        b.Entity<PricingPlan>(e =>
        {
            e.HasKey(p => p.PricingPlanId);
            e.Property(p => p.Status).HasConversion<int>();
            e.Property(p => p.PricingModel).HasConversion<int>();
            e.Property(p => p.Practice).HasMaxLength(128);
            e.Property(p => p.BlendedRate).HasPrecision(10, 2);
            e.Property(p => p.FixedFee).HasPrecision(14, 2);
            e.Property(p => p.TechnologyFees).HasPrecision(14, 2);
            e.Property(p => p.RecoverableExpenses).HasPrecision(14, 2);
            e.Property(p => p.Notes).HasMaxLength(4000);
            e.HasOne(p => p.Project)
                .WithMany()
                .HasForeignKey(p => p.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(p => p.MdOwner)
                .WithMany()
                .HasForeignKey(p => p.MdOwnerId)
                .OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(p => p.ProjectId);
        });

        b.Entity<PlanLineItem>(e =>
        {
            e.HasKey(l => l.PlanLineItemId);
            e.Property(l => l.RoleTitle).HasMaxLength(256).IsRequired();
            e.Property(l => l.Rank).HasMaxLength(64);
            e.Property(l => l.Geography).HasMaxLength(128);
            e.Property(l => l.Organization).HasConversion<int>();
            e.Property(l => l.SubcontractorFirm).HasMaxLength(256);
            e.Property(l => l.CostRateOverride).HasPrecision(10, 2);
            e.Property(l => l.BillRateOverride).HasPrecision(10, 2);
            e.Property(l => l.ClientRate).HasPrecision(10, 2);
            e.HasOne(l => l.Plan)
                .WithMany(p => p.LineItems)
                .HasForeignKey(l => l.PricingPlanId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasOne(l => l.Person)
                .WithMany()
                .HasForeignKey(l => l.PersonId)
                .OnDelete(DeleteBehavior.NoAction);
            e.HasIndex(l => l.PricingPlanId);
        });

        b.Entity<PlanWeekHours>(e =>
        {
            e.HasKey(w => w.PlanWeekHoursId);
            e.Property(w => w.Hours).HasPrecision(6, 2);
            e.HasOne(w => w.LineItem)
                .WithMany(l => l.WeekHours)
                .HasForeignKey(w => w.PlanLineItemId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(w => new { w.PlanLineItemId, w.WeekStart }).IsUnique();
        });

        b.Entity<ProjectBaselineLine>(e =>
        {
            e.HasKey(l => l.ProjectBaselineLineId);
            e.Property(l => l.PersonName).HasMaxLength(256).IsRequired();
            e.Property(l => l.Hours).HasPrecision(6, 2);
            e.HasOne(l => l.Project)
                .WithMany(p => p.BaselineLines)
                .HasForeignKey(l => l.ProjectId)
                .OnDelete(DeleteBehavior.Cascade);
            e.HasIndex(l => l.ProjectId);
        });

        b.Entity<AuditLog>(e =>
        {
            e.HasKey(a => a.AuditLogId);
            e.Property(a => a.AuditLogId).ValueGeneratedOnAdd();
            e.Property(a => a.EntityType).HasMaxLength(64).IsRequired();
            e.Property(a => a.EntityId).HasMaxLength(64).IsRequired();
            e.Property(a => a.FieldChanged).HasMaxLength(128).IsRequired();
            e.HasIndex(a => a.ChangedAt);
            e.HasIndex(a => new { a.EntityType, a.EntityId });
        });
    }
}
