-- Leave & Gate Pass (SRS Part 8)

CREATE TYPE "LeaveRequestStatus" AS ENUM (
  'PENDING',
  'APPROVED',
  'REJECTED',
  'CHECKED_OUT',
  'RETURNED',
  'OVERDUE',
  'CANCELLED',
  'EXPIRED'
);

CREATE TYPE "GateAction" AS ENUM ('EXIT', 'RETURN');

ALTER TYPE "MealRecordStatus" ADD VALUE 'MISSED_LEAVE';

CREATE TABLE "LeaveType" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeaveRequest" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leaveNumber" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "campusId" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "destination" TEXT NOT NULL,
  "expectedExitTime" TIMESTAMP(3) NOT NULL,
  "expectedReturnTime" TIMESTAMP(3) NOT NULL,
  "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "rejectionReason" TEXT,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "actualExitTime" TIMESTAMP(3),
  "actualReturnTime" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "cancelledAt" TIMESTAMP(3),
  "cancelledById" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GateLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "leaveRequestId" TEXT NOT NULL,
  "studentId" TEXT NOT NULL,
  "campusId" TEXT,
  "action" "GateAction" NOT NULL,
  "gateOfficerId" TEXT NOT NULL,
  "gateLocation" TEXT,
  "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GateLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "MealRecord" ADD COLUMN IF NOT EXISTS "leaveRequestId" TEXT;

CREATE UNIQUE INDEX "LeaveType_organizationId_name_key" ON "LeaveType"("organizationId", "name");
CREATE INDEX "LeaveType_organizationId_idx" ON "LeaveType"("organizationId");
CREATE INDEX "LeaveType_deletedAt_idx" ON "LeaveType"("deletedAt");

CREATE UNIQUE INDEX "LeaveRequest_organizationId_leaveNumber_key" ON "LeaveRequest"("organizationId", "leaveNumber");
CREATE INDEX "LeaveRequest_organizationId_status_idx" ON "LeaveRequest"("organizationId", "status");
CREATE INDEX "LeaveRequest_studentId_status_idx" ON "LeaveRequest"("studentId", "status");
CREATE INDEX "LeaveRequest_campusId_status_idx" ON "LeaveRequest"("campusId", "status");
CREATE INDEX "LeaveRequest_expectedReturnTime_idx" ON "LeaveRequest"("expectedReturnTime");
CREATE INDEX "LeaveRequest_deletedAt_idx" ON "LeaveRequest"("deletedAt");

CREATE INDEX "GateLog_organizationId_scannedAt_idx" ON "GateLog"("organizationId", "scannedAt");
CREATE INDEX "GateLog_leaveRequestId_idx" ON "GateLog"("leaveRequestId");
CREATE INDEX "GateLog_studentId_scannedAt_idx" ON "GateLog"("studentId", "scannedAt");
CREATE INDEX "GateLog_action_scannedAt_idx" ON "GateLog"("action", "scannedAt");

CREATE INDEX "MealRecord_leaveRequestId_idx" ON "MealRecord"("leaveRequestId");

ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_programId_fkey"
  FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey"
  FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_studentId_fkey"
  FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_campusId_fkey"
  FOREIGN KEY ("campusId") REFERENCES "Campus"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GateLog" ADD CONSTRAINT "GateLog_gateOfficerId_fkey"
  FOREIGN KEY ("gateOfficerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MealRecord" ADD CONSTRAINT "MealRecord_leaveRequestId_fkey"
  FOREIGN KEY ("leaveRequestId") REFERENCES "LeaveRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
