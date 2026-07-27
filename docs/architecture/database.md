# IMMS Database Architecture

Full specification: [SRS Part 5](../srs/05-database-design-and-entity-relationships.md).

## Stack

PostgreSQL + Prisma (`apps/meal-api/prisma/schema.prisma`).

## Key constraints

| Rule | Enforcement |
| ---- | ----------- |
| One meal / student / session / day | `@@unique([studentId, mealDate, mealCode])` |
| External student ID | `Student.studentId` + `barcode` (org-unique) |
| Soft deletes | `deletedAt` on Campus, Program, AcademicYear, Student, User, MealSessionConfig |
| Immutable history | No app delete for `MealRecord`, `AuditLog`, `ImportJob` |

## Mentor model

Mentors are `User` rows with role + `UserCampusAssignment`, not a separate table.
