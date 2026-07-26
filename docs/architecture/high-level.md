# IMMS High-Level Architecture

See the full specification in [SRS Part 4](../srs/04-system-architecture-and-domain-model.md).

## Stack mapping

| Spec layer | Package / tech |
| ---------- | -------------- |
| Admin / Mentor portals | `apps/meal-web` (Next.js) |
| REST API | `apps/meal-api` (NestJS) |
| ORM | Prisma |
| Database | PostgreSQL |

## Domain hierarchy (meal-focused)

```
Organization → Campus → AcademicYear → Program → Student / Mentor → MealRecord
                                         MealSessionConfig (org / campus)
```

All meal business rules (one meal per session per day, override with reason, barcode = student ID) are enforced in the NestJS meal service layer and backed by unique database constraints.
