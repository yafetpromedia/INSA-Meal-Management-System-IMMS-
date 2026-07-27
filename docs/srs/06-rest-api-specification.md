# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

# Part 6 — REST API Specification

## 6.1 Overview

The INSA Meal Management System (IMMS) shall expose a RESTful API consumed by the web frontend and any future mobile applications.

The API shall:

- Follow REST principles
- Be versioned
- Use JSON exclusively
- Require authentication unless explicitly marked public
- Return consistent response formats
- Support pagination, filtering, sorting, and searching
- Be documented with Swagger/OpenAPI

## 6.2 Base URL

**Development**

```text
http://localhost:4000/api/v1
```

**Production**

```text
https://api.example.com/api/v1
```

All endpoints begin with `/api/v1/`. Future breaking changes use `/api/v2/`, `/api/v3/`, etc.

Interactive docs (development / configurable):

```text
http://localhost:4000/api/docs
```

## 6.3 Authentication

Protected endpoints require:

```http
Authorization: Bearer <access_token>
```

Missing or invalid token → **401 Unauthorized**.

## 6.4 Content Type

- JSON bodies: `Content-Type: application/json`
- File uploads: `multipart/form-data`

## 6.5 Standard Response Format

**Success**

```json
{
  "success": true,
  "message": "OK",
  "data": {},
  "meta": {}
}
```

**Failure**

```json
{
  "success": false,
  "message": "Student not found.",
  "errors": [
    {
      "field": "studentId",
      "message": "Student does not exist."
    }
  ],
  "statusCode": 404,
  "code": "Not Found",
  "path": "/api/v1/students/…",
  "timestamp": "2026-07-26T20:00:00.000Z"
}
```

## 6.6 Pagination

List endpoints support:

```text
?page=1&limit=20
```

Legacy `skip` / `take` remain accepted. Response `meta`:

```json
{
  "page": 2,
  "limit": 25,
  "total": 1248,
  "totalPages": 50
}
```

## 6.7 Sorting

```text
?sort=fullName&order=asc
```

## 6.8 Searching

```text
GET /students/search?q=yafet
```

Searches name, student ID, barcode, department.

## 6.9 Filtering

Supported filters (resource-dependent): campus, program, academic year, meal session, department, status, date range, mentor.

## 6.10 Authentication API

| Method | Path | Auth |
| ------ | ---- | ---- |
| POST | `/auth/login` | Public |
| POST | `/auth/refresh` | Public |
| POST | `/auth/logout` | Bearer |
| POST | `/auth/logout-all` | Bearer |
| GET | `/auth/me` | Bearer |
| POST | `/auth/forgot-password` | Public |
| POST | `/auth/reset-password` | Public |

Login `data` payload includes `accessToken`, `refreshToken`, and `user`.

## 6.11 Campus API

`GET/POST /campuses`, `GET/PATCH/DELETE /campuses/:id`, `PATCH /campuses/:id/status`

## 6.12 Academic Year API

`GET/POST /academic-years`, `POST /academic-years/:id/set-current`  
(Archive via soft-delete / status — extend with PATCH/DELETE as needed.)

## 6.13 Program API

`GET/POST /programs`, `GET/PATCH /programs/:id`, `POST /programs/:id/archive`

## 6.14 Student API

| Method | Path |
| ------ | ---- |
| GET | `/students` |
| GET | `/students/search?q=` |
| GET | `/students/:id` |
| GET | `/students/barcode/:barcode` |
| POST | `/students` |
| PATCH | `/students/:id` |
| DELETE | `/students/:id` (soft delete) |
| POST | `/students/import` (multipart) |
| GET | `/students/export` |

## 6.15 Mentor API

Mentors are users with Mentor / Food Staff roles:

`GET/POST /mentors`, `PATCH/DELETE /mentors/:id`

## 6.16 Meal Session API

| Method | Path |
| ------ | ---- |
| GET | `/meal-sessions` |
| PATCH | `/meal-sessions/:id` |
| GET/PUT | `/meals/sessions` (equivalent) |

## 6.17 Barcode Verification API

```http
POST /meals/verify
```

```json
{ "barcode": "CTC-1042-26" }
```

Returns eligibility without creating a meal record.

## 6.18 Serve Meal API

```http
POST /meals/serve
```

Accepts scanner-style `{ "barcode": "…" }` and/or `{ "studentId", "mealCode" }`.  
Creates meal record, enforces duplicates, writes audit log. Override: `override` + `overrideReason`.

## 6.19 Meal History API

```http
GET /meals/history?studentId=
GET /meals/history/:studentId
```

## 6.20 Reports API

| Path | Description |
| ---- | ----------- |
| `/reports/daily` | Daily meal summary |
| `/reports/weekly` | Weekly summary |
| `/reports/monthly` | Monthly summary |
| `/reports/campus` | By campus |
| `/reports/mentor` | By mentor |
| `/reports/export` | Export payload |
| `/reports/meals` | Legacy aggregate |

## 6.21 Audit Log API

`GET /audit-logs` — filter by date, user, action, entity. Deletes are rejected (immutable).

## 6.22 Settings API

`GET /settings`, `PUT /settings` — general, meal sessions, branding, security, notifications (via keys / categories).

## 6.23 Error Codes

| Code | Meaning |
| ---- | ------- |
| 200 | Success |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict (e..g. duplicate meal) |
| 422 | Validation Error |
| 429 | Too Many Requests |
| 500 | Internal Server Error |

## 6.24 Validation Rules

Every request is validated (required fields, email, UUID/CUID, dates, enums, file type/size, duplicates, referential integrity). Invalid → **422** with field-level `errors`.

## 6.25 Rate Limiting

- Auth endpoints are rate-limited.
- Meal verify/serve support high throughput with abuse protection.
- Excess → **429 Too Many Requests**.

## 6.26 API Documentation

Swagger/OpenAPI at `/api/docs` (enabled in development; production via `SWAGGER_ENABLED=true`).

## 6.27 API Versioning & Compatibility

- Breaking changes → new version prefix.
- Non-breaking additions may ship in the current version.
- Deprecation period for retired versions.
