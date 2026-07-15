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
