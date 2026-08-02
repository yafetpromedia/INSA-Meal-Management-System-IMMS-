-- CreateTable
CREATE TABLE "Mentor" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mentor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mentor_userId_key" ON "Mentor"("userId");

-- CreateIndex
CREATE INDEX "Mentor_campusId_idx" ON "Mentor"("campusId");

-- CreateIndex
CREATE INDEX "Mentor_programId_idx" ON "Mentor"("programId");

-- CreateIndex
CREATE INDEX "Mentor_academicYearId_idx" ON "Mentor"("academicYearId");

-- CreateIndex
CREATE INDEX "Mentor_status_idx" ON "Mentor"("status");

-- AddForeignKey
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mentor" ADD CONSTRAINT "Mentor_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill mentors from users with Mentor role + at least one campus assignment
INSERT INTO "Mentor" ("id", "userId", "campusId", "programId", "academicYearId", "status", "createdAt", "updatedAt")
SELECT
  replace(gen_random_uuid()::text, '-', ''),
  u."id",
  uca."campusId",
  (
    SELECT upa."programId"
    FROM "UserProgramAssignment" upa
    WHERE upa."userId" = u."id"
    LIMIT 1
  ),
  COALESCE(
    (
      SELECT ay."id"
      FROM "AcademicYear" ay
      INNER JOIN "Campus" c ON c."id" = uca."campusId"
      WHERE ay."organizationId" = c."organizationId"
        AND ay."deletedAt" IS NULL
      ORDER BY ay."isCurrent" DESC, ay."createdAt" DESC
      LIMIT 1
    ),
    (
      SELECT ay."id"
      FROM "AcademicYear" ay
      INNER JOIN "Campus" c ON c."id" = uca."campusId"
      WHERE ay."organizationId" = c."organizationId"
        AND ay."deletedAt" IS NULL
      LIMIT 1
    )
  ),
  u."status",
  NOW(),
  NOW()
FROM "User" u
INNER JOIN "UserRole" ur ON ur."userId" = u."id"
INNER JOIN "Role" r ON r."id" = ur."roleId" AND r."name" = 'Mentor'
INNER JOIN LATERAL (
  SELECT "campusId"
  FROM "UserCampusAssignment"
  WHERE "userId" = u."id"
  ORDER BY "assignedAt" ASC
  LIMIT 1
) uca ON TRUE
WHERE u."deletedAt" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "Mentor" m WHERE m."userId" = u."id")
  AND EXISTS (
    SELECT 1
    FROM "AcademicYear" ay
    INNER JOIN "Campus" c ON c."id" = uca."campusId"
    WHERE ay."organizationId" = c."organizationId"
      AND ay."deletedAt" IS NULL
  );
