-- CreateEnum
CREATE TYPE "ActivityReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "ActivityCategory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT,
    "academicYearId" TEXT NOT NULL,
    "reportDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "location" TEXT,
    "objectives" TEXT,
    "description" TEXT NOT NULL,
    "activitiesPerformed" TEXT,
    "outcomes" TEXT,
    "challenges" TEXT,
    "recommendations" TEXT,
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ActivityReportStatus" NOT NULL DEFAULT 'DRAFT',
    "reviewNotes" TEXT,
    "submittedById" TEXT NOT NULL,
    "reviewedById" TEXT,
    "submittedAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityMedia" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storagePath" TEXT NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityMedia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityParticipant" (
    "id" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityCategory_organizationId_idx" ON "ActivityCategory"("organizationId");
CREATE INDEX "ActivityCategory_deletedAt_idx" ON "ActivityCategory"("deletedAt");
CREATE UNIQUE INDEX "ActivityCategory_organizationId_name_key" ON "ActivityCategory"("organizationId", "name");

CREATE INDEX "ActivityReport_organizationId_status_idx" ON "ActivityReport"("organizationId", "status");
CREATE INDEX "ActivityReport_campusId_reportDate_idx" ON "ActivityReport"("campusId", "reportDate");
CREATE INDEX "ActivityReport_categoryId_idx" ON "ActivityReport"("categoryId");
CREATE INDEX "ActivityReport_submittedById_idx" ON "ActivityReport"("submittedById");
CREATE INDEX "ActivityReport_reportDate_idx" ON "ActivityReport"("reportDate");
CREATE INDEX "ActivityReport_deletedAt_idx" ON "ActivityReport"("deletedAt");
CREATE UNIQUE INDEX "ActivityReport_organizationId_reportNumber_key" ON "ActivityReport"("organizationId", "reportNumber");

CREATE INDEX "ActivityMedia_reportId_idx" ON "ActivityMedia"("reportId");
CREATE INDEX "ActivityMedia_fileType_idx" ON "ActivityMedia"("fileType");
CREATE INDEX "ActivityMedia_uploadedById_idx" ON "ActivityMedia"("uploadedById");

CREATE UNIQUE INDEX "ActivityParticipant_reportId_studentId_key" ON "ActivityParticipant"("reportId", "studentId");
CREATE INDEX "ActivityParticipant_studentId_idx" ON "ActivityParticipant"("studentId");

-- AddForeignKey
ALTER TABLE "ActivityCategory" ADD CONSTRAINT "ActivityCategory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ActivityCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityReport" ADD CONSTRAINT "ActivityReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityMedia" ADD CONSTRAINT "ActivityMedia_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ActivityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityMedia" ADD CONSTRAINT "ActivityMedia_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "ActivityReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ActivityParticipant" ADD CONSTRAINT "ActivityParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
