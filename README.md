# INSA Meal Management System (IMMS)

Centralized multi-tenant **meal management** for training programs across multiple campuses.

> This is **not** a general camp operations platform. Every feature supports meal distribution: verification, serving, history, reporting, and staff access control.

## Stack

| Layer | Package | Technology |
| ----- | ------- | ---------- |
| API | `@imms/meal-api` | NestJS, Prisma, PostgreSQL |
| Web | `@imms/meal-web` | Next.js (App Router), TypeScript |
| Auth | — | JWT (access + refresh), Argon2 |
| Realtime | — | Socket.io (meal activity) |

## Documentation

- [Vision & scope](docs/srs/01-executive-summary-and-vision.md)
- [Functional requirements](docs/srs/02-functional-requirements.md)
- [RBAC](docs/srs/03-rbac.md)
- [System architecture & domain model](docs/srs/04-system-architecture-and-domain-model.md)
- [Multi-tenancy](docs/architecture/multi-tenancy.md)

## Modules

Authentication, Dashboard, Organizations, Campuses, Programs, Academic Years, Students, Excel Import, Barcode / Meal Distribution, Meal Sessions, Meal History, Mentors & Food Staff, Reports, Audit Logs, Settings, Roles

## Quick start

```bash
npm install
copy apps\meal-api\.env.example apps\meal-api\.env
# Set DATABASE_URL to your PostgreSQL instance

npm run db:migrate
npm run db:seed
npm run dev
```

- API: http://localhost:4000/api
- Web: http://localhost:3000
- Default Super Admin: `superadmin@insa.gov.et` / `ChangeMe!123`

## Scripts

| Script | Description |
| ------ | ----------- |
| `npm run dev` | Start API + web |
| `npm run db:migrate` | Prisma migrate |
| `npm run db:seed` | Seed roles, sample org, meal windows |
| `npm run smoke` | API smoke tests |
