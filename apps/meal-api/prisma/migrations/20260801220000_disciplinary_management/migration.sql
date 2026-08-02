-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'UNDER_INVESTIGATION', 'AWAITING_DECISION', 'ACTION_ASSIGNED', 'CLOSED', 'APPEALED');

-- CreateEnum
CREATE TYPE "DisciplinaryActionStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "IncidentType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IncidentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryActionType" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "affectsMeals" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryActionType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryIncident" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentNumber" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "campusId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "incidentTypeId" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'LOW',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "description" TEXT NOT NULL,
    "witnesses" TEXT,
    "evidenceUrl" TEXT,
    "investigationNotes" TEXT,
    "decisionNotes" TEXT,
    "acknowledgmentNotes" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "leaveRequestId" TEXT,
    "reportedById" TEXT NOT NULL,
    "assignedToId" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DisciplinaryAction" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "actionTypeId" TEXT NOT NULL,
    "description" TEXT,
    "assignedById" TEXT NOT NULL,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "status" "DisciplinaryActionStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DisciplinaryAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IncidentType_organizationId_idx" ON "IncidentType"("organizationId");

-- CreateIndex
CREATE INDEX "IncidentType_deletedAt_idx" ON "IncidentType"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentType_organizationId_category_name_key" ON "IncidentType"("organizationId", "category", "name");

-- CreateIndex
CREATE INDEX "DisciplinaryActionType_organizationId_idx" ON "DisciplinaryActionType"("organizationId");

-- CreateIndex
CREATE INDEX "DisciplinaryActionType_deletedAt_idx" ON "DisciplinaryActionType"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplinaryActionType_organizationId_name_key" ON "DisciplinaryActionType"("organizationId", "name");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_organizationId_status_idx" ON "DisciplinaryIncident"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_studentId_status_idx" ON "DisciplinaryIncident"("studentId", "status");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_campusId_status_idx" ON "DisciplinaryIncident"("campusId", "status");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_severity_status_idx" ON "DisciplinaryIncident"("severity", "status");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_reportedById_idx" ON "DisciplinaryIncident"("reportedById");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_occurredAt_idx" ON "DisciplinaryIncident"("occurredAt");

-- CreateIndex
CREATE INDEX "DisciplinaryIncident_deletedAt_idx" ON "DisciplinaryIncident"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DisciplinaryIncident_organizationId_incidentNumber_key" ON "DisciplinaryIncident"("organizationId", "incidentNumber");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_incidentId_idx" ON "DisciplinaryAction"("incidentId");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_organizationId_status_idx" ON "DisciplinaryAction"("organizationId", "status");

-- CreateIndex
CREATE INDEX "DisciplinaryAction_actionTypeId_idx" ON "DisciplinaryAction"("actionTypeId");

-- AddForeignKey
ALTER TABLE "IncidentType" ADD CONSTRAINT "IncidentType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryActionType" ADD CONSTRAINT "DisciplinaryActionType_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_campusId_fkey" FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_incidentTypeId_fkey" FOREIGN KEY ("incidentTypeId") REFERENCES "IncidentType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryIncident" ADD CONSTRAINT "DisciplinaryIncident_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "DisciplinaryIncident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_actionTypeId_fkey" FOREIGN KEY ("actionTypeId") REFERENCES "DisciplinaryActionType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DisciplinaryAction" ADD CONSTRAINT "DisciplinaryAction_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
