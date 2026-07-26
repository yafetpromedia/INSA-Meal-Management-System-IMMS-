# IMMS Multi-Tenancy (Meal-Focused)

IMMS is a multi-tenant **meal management** system. No feature assumes a specific university, campus, program, or academic year.

## Tenant hierarchy

```
Organization (tenant)
  └── Campus
        └── Program (per Academic Year)
              └── Students / Mentors / Food Staff / Meals
```

## Configuration

| Concern | Storage |
| ------- | ------- |
| Meal session windows | `MealSessionConfig` (org-wide or campus override) |
| Dictionaries | `ReferenceDataCategory` / `ReferenceDataItem` |
| Business rules | `BusinessRule` (e.g. one meal per session per day) |
| Settings | `SystemSetting` |
| Roles | Platform system roles + org custom roles |
| Extra fields | `CustomFieldDefinition` / `CustomFieldValue` |

## Identity

- Student IDs / barcodes are external and unique per organization
- Permissions use `Module.Action` on roles
- Queries are scoped by organization / campus / program

## Explicit non-goals

Attendance, dormitory, certificates, events, medical, and LMS features are not part of this product.
