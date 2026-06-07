IF OBJECT_ID(N'[__EFMigrationsHistory]') IS NULL
BEGIN
    CREATE TABLE [__EFMigrationsHistory] (
        [MigrationId] nvarchar(150) NOT NULL,
        [ProductVersion] nvarchar(32) NOT NULL,
        CONSTRAINT [PK___EFMigrationsHistory] PRIMARY KEY ([MigrationId])
    );
END;
GO

BEGIN TRANSACTION;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE TABLE [AuditLogs] (
        [AuditLogId] bigint NOT NULL IDENTITY,
        [EntityType] nvarchar(64) NOT NULL,
        [EntityId] nvarchar(64) NOT NULL,
        [FieldChanged] nvarchar(128) NOT NULL,
        [OldValue] nvarchar(max) NULL,
        [NewValue] nvarchar(max) NULL,
        [ChangedBy] uniqueidentifier NOT NULL,
        [ChangedAt] datetime2 NOT NULL,
        CONSTRAINT [PK_AuditLogs] PRIMARY KEY ([AuditLogId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE TABLE [People] (
        [PersonId] uniqueidentifier NOT NULL,
        [DisplayName] nvarchar(256) NOT NULL,
        [Email] nvarchar(256) NOT NULL,
        [JobTitle] nvarchar(256) NULL,
        [ManagerId] uniqueidentifier NULL,
        [IsActive] bit NOT NULL,
        CONSTRAINT [PK_People] PRIMARY KEY ([PersonId]),
        CONSTRAINT [FK_People_People_ManagerId] FOREIGN KEY ([ManagerId]) REFERENCES [People] ([PersonId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE TABLE [Projects] (
        [ProjectId] uniqueidentifier NOT NULL,
        [ClientName] nvarchar(256) NOT NULL,
        [ProjectName] nvarchar(256) NOT NULL,
        [StartDate] date NOT NULL,
        [EndDate] date NULL,
        [Status] int NOT NULL,
        CONSTRAINT [PK_Projects] PRIMARY KEY ([ProjectId])
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE TABLE [Allocations] (
        [AllocationId] uniqueidentifier NOT NULL,
        [PersonId] uniqueidentifier NOT NULL,
        [ProjectId] uniqueidentifier NOT NULL,
        [WeekStart] date NOT NULL,
        [PercentAllocated] int NOT NULL,
        CONSTRAINT [PK_Allocations] PRIMARY KEY ([AllocationId]),
        CONSTRAINT [FK_Allocations_People_PersonId] FOREIGN KEY ([PersonId]) REFERENCES [People] ([PersonId]) ON DELETE CASCADE,
        CONSTRAINT [FK_Allocations_Projects_ProjectId] FOREIGN KEY ([ProjectId]) REFERENCES [Projects] ([ProjectId]) ON DELETE CASCADE
    );
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE UNIQUE INDEX [IX_Allocations_PersonId_ProjectId_WeekStart] ON [Allocations] ([PersonId], [ProjectId], [WeekStart]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Allocations_ProjectId] ON [Allocations] ([ProjectId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_Allocations_WeekStart] ON [Allocations] ([WeekStart]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_ChangedAt] ON [AuditLogs] ([ChangedAt]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_AuditLogs_EntityType_EntityId] ON [AuditLogs] ([EntityType], [EntityId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_People_Email] ON [People] ([Email]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    CREATE INDEX [IX_People_ManagerId] ON [People] ([ManagerId]);
END;
GO

IF NOT EXISTS (
    SELECT * FROM [__EFMigrationsHistory]
    WHERE [MigrationId] = N'20260607151834_InitialCreate'
)
BEGIN
    INSERT INTO [__EFMigrationsHistory] ([MigrationId], [ProductVersion])
    VALUES (N'20260607151834_InitialCreate', N'8.0.11');
END;
GO

COMMIT;
GO

