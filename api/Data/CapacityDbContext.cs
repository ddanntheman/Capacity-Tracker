using CapacityTracker.Api.Models;
using Microsoft.EntityFrameworkCore;

namespace CapacityTracker.Api.Data;

public class CapacityDbContext(DbContextOptions<CapacityDbContext> options) : DbContext(options)
{
    public DbSet<Person> People => Set<Person>();
    public DbSet<Project> Projects => Set<Project>();
    public DbSet<Allocation> Allocations => Set<Allocation>();
    public DbSet<AuditLog> AuditLogs => Set<AuditLog>();

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
