-- Demo seed data for local development and demos. Idempotent: safe to re-run.
-- Not intended for production. Production People rows are auto-provisioned from
-- Entra OIDs on first sign-in.

SET NOCOUNT ON;

DECLARE @alice uniqueidentifier = '11111111-1111-1111-1111-111111111111';
DECLARE @bob   uniqueidentifier = '22222222-2222-2222-2222-222222222222';
DECLARE @carol uniqueidentifier = '33333333-3333-3333-3333-333333333333';
DECLARE @dave  uniqueidentifier = '44444444-4444-4444-4444-444444444444';

MERGE [People] AS t
USING (VALUES
    (@alice, N'Alice Anderson', N'alice@andersenconsulting.com', N'Managing Director', NULL, 1),
    (@bob,   N'Bob Brown',      N'bob@andersenconsulting.com',   N'Senior Consultant', @alice, 1),
    (@carol, N'Carol Clarke',   N'carol@andersenconsulting.com', N'Consultant',        @alice, 1),
    (@dave,  N'Dave Davis',     N'dave@andersenconsulting.com',  N'Analyst',           @bob,   1)
) AS s (PersonId, DisplayName, Email, JobTitle, ManagerId, IsActive)
ON t.PersonId = s.PersonId
WHEN MATCHED THEN UPDATE SET DisplayName = s.DisplayName, Email = s.Email, JobTitle = s.JobTitle, ManagerId = s.ManagerId, IsActive = s.IsActive
WHEN NOT MATCHED THEN INSERT (PersonId, DisplayName, Email, JobTitle, ManagerId, IsActive)
    VALUES (s.PersonId, s.DisplayName, s.Email, s.JobTitle, s.ManagerId, s.IsActive);

DECLARE @proj1 uniqueidentifier = 'aaaaaaaa-0000-0000-0000-000000000001';
DECLARE @proj2 uniqueidentifier = 'aaaaaaaa-0000-0000-0000-000000000002';
DECLARE @proj3 uniqueidentifier = 'aaaaaaaa-0000-0000-0000-000000000003';

MERGE [Projects] AS t
USING (VALUES
    (@proj1, N'Contoso',    N'ERP Migration',     '2026-06-01', NULL,         0),
    (@proj2, N'Fabrikam',   N'Security Review',   '2026-06-08', '2026-08-31', 0),
    (@proj3, N'Northwind',  N'Cloud Assessment',  '2026-07-01', NULL,         1)
) AS s (ProjectId, ClientName, ProjectName, StartDate, EndDate, Status)
ON t.ProjectId = s.ProjectId
WHEN MATCHED THEN UPDATE SET ClientName = s.ClientName, ProjectName = s.ProjectName, StartDate = s.StartDate, EndDate = s.EndDate, Status = s.Status
WHEN NOT MATCHED THEN INSERT (ProjectId, ClientName, ProjectName, StartDate, EndDate, Status)
    VALUES (s.ProjectId, s.ClientName, s.ProjectName, s.StartDate, s.EndDate, s.Status);

-- Allocations for the current week (Monday) and the next two weeks.
DECLARE @monday date = DATEADD(DAY, -(DATEPART(WEEKDAY, GETUTCDATE()) + 5) % 7, CAST(GETUTCDATE() AS date));

MERGE [Allocations] AS t
USING (VALUES
    (NEWID(), @bob,   @proj1, @monday,               24),
    (NEWID(), @bob,   @proj2, @monday,               12),
    (NEWID(), @carol, @proj1, @monday,               32),
    (NEWID(), @dave,  @proj2, @monday,               20),
    (NEWID(), @bob,   @proj1, DATEADD(DAY, 7, @monday),  40),
    (NEWID(), @carol, @proj2, DATEADD(DAY, 7, @monday),  16),
    (NEWID(), @dave,  @proj1, DATEADD(DAY, 14, @monday), 8)
) AS s (AllocationId, PersonId, ProjectId, WeekStart, Hours)
ON t.PersonId = s.PersonId AND t.ProjectId = s.ProjectId AND t.WeekStart = s.WeekStart
WHEN MATCHED THEN UPDATE SET Hours = s.Hours
WHEN NOT MATCHED THEN INSERT (AllocationId, PersonId, ProjectId, WeekStart, Hours)
    VALUES (s.AllocationId, s.PersonId, s.ProjectId, s.WeekStart, s.Hours);
GO
