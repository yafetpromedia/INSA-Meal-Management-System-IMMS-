-- Part 5: soft deletes, meal field rename, indexes, import/settings columns

-- Soft deletes
ALTER TABLE "AcademicYear" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Campus" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Program" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "Student" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);
ALTER TABLE "MealSessionConfig" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMP(3);

-- MealRecord: week/day -> weekNumber/dayOfWeek
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MealRecord' AND column_name = 'week'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MealRecord' AND column_name = 'weekNumber'
  ) THEN
    ALTER TABLE "MealRecord" RENAME COLUMN "week" TO "weekNumber";
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MealRecord' AND column_name = 'day'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'MealRecord' AND column_name = 'dayOfWeek'
  ) THEN
    ALTER TABLE "MealRecord" RENAME COLUMN "day" TO "dayOfWeek";
  END IF;
END $$;

ALTER TABLE "MealRecord" ADD COLUMN IF NOT EXISTS "weekNumber" INTEGER;
ALTER TABLE "MealRecord" ADD COLUMN IF NOT EXISTS "dayOfWeek" TEXT;

-- Import / settings
ALTER TABLE "ImportJob" ADD COLUMN IF NOT EXISTS "totalRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SystemSetting" ADD COLUMN IF NOT EXISTS "description" TEXT;

-- Indexes (IF NOT EXISTS via DO blocks for older PG compatibility)
CREATE INDEX IF NOT EXISTS "AcademicYear_deletedAt_idx" ON "AcademicYear"("deletedAt");
CREATE INDEX IF NOT EXISTS "Campus_deletedAt_idx" ON "Campus"("deletedAt");
CREATE INDEX IF NOT EXISTS "Program_deletedAt_idx" ON "Program"("deletedAt");
CREATE INDEX IF NOT EXISTS "Student_department_idx" ON "Student"("department");
CREATE INDEX IF NOT EXISTS "Student_studentId_idx" ON "Student"("studentId");
CREATE INDEX IF NOT EXISTS "Student_deletedAt_idx" ON "Student"("deletedAt");
CREATE INDEX IF NOT EXISTS "MealSessionConfig_deletedAt_idx" ON "MealSessionConfig"("deletedAt");
CREATE INDEX IF NOT EXISTS "MealRecord_studentId_idx" ON "MealRecord"("studentId");
CREATE INDEX IF NOT EXISTS "MealRecord_mentorId_idx" ON "MealRecord"("mentorId");
CREATE INDEX IF NOT EXISTS "MealRecord_mealDate_idx" ON "MealRecord"("mealDate");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_idx" ON "AuditLog"("resource");
