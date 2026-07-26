# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

# Part 3 — Role-Based Access Control (RBAC)

> Scope note: IMMS is a **meal management** system. Attendance and unrelated camp modules are out of scope. Permissions below apply to meal distribution workflows only.

## 3.1 Overview

ICOP shall implement comprehensive RBAC. Every authenticated user belongs to one or more roles. Permissions are assigned to roles, not directly to users. New roles can be created without changing application code.

## 3.2 Access Hierarchy

```
Super Admin
    → Admin
        → Campus Coordinator
            → Program Coordinator
                → Mentor
                    → Food Staff
                        → Viewer
```

There is no automatic inheritance unless configured by administrators.

## 3.3 Permission Categories

Dashboard, Campus, Programs, Students, Attendance, Meals, Mentors, Users, Reports, Audit Logs, Settings, Notifications.

## 3.4 Permission Types

View, Create, Update, Delete, Import, Export, Print, Approve, Override, Manage, Assign.

Example: `Student.View`, `Student.Create`, `Student.Import`, `Meal.Override`.

## 3.5 Super Admin

Owns the entire platform. Permissions: everything, including system settings, role/permission management, backups, API keys, security settings, branding, email templates. Restrictions: none.

## 3.6 Admin

Scope: one or more assigned campuses. Can manage students, mentors, programs, attendance, meals, import, export, override meals, view audit logs, create users, reset passwords. Cannot delete Super Admin, manage global settings/roles, restore DB, modify security policies, or delete audit logs.

## 3.7 Campus Coordinator

Responsible for one campus. Can manage students, attendance, meals; view reports; assign mentors; approve attendance corrections; view campus statistics. Cannot access other campuses.

## 3.8 Program Coordinator

Responsible for one program. Can manage attendance, meals (view), reports (limited), student profiles (view/edit), mentors, schedule. Cannot modify campus, delete students, or manage settings.

## 3.9 Mentor

Can login, view assigned students, scan barcode, record attendance, serve meals, view student profile, search students, view personal reports. Cannot delete records, import students, manage users, export reports, view other campuses, modify settings, or override meals.

## 3.10 Food Staff

Meal distribution only: login, scan barcode, serve meal, search student, view meal status. Cannot access attendance, reports, settings, students CRUD, mentors, users, or editing records.

## 3.11 Viewer

Read-only: dashboard, reports, statistics, student profiles, attendance, meals. Cannot edit, delete, import, export, scan, override, or manage.

## 3.12 Custom Roles

Administrators can create unlimited custom roles with individually selectable permissions.

## 3.13 Permission Matrix

| Module     | Super Admin | Admin   | Campus Coord. | Program Coord. | Mentor  | Food Staff | Viewer |
| ---------- | ----------- | ------- | ------------- | -------------- | ------- | ---------- | ------ |
| Dashboard  | Full        | Full    | Full          | Full           | Full    | Full       | Full   |
| Campuses   | Full        | View    | View          | None           | None    | None       | View   |
| Programs   | Full        | Full    | Full          | View           | None    | None       | View   |
| Students   | Full        | Full    | Full          | View/Edit      | View    | Search     | View   |
| Attendance | Full        | Full    | Full          | Full           | Create  | None       | View   |
| Meals      | Full        | Full    | Full          | View           | Create  | Create     | View   |
| Reports    | Full        | Full    | Full          | Limited        | Limited | None       | View   |
| Users      | Full        | Limited | None          | None           | None    | None       | None   |
| Audit Logs | Full        | View    | View          | None           | None    | None       | None   |
| Settings   | Full        | Limited | None          | None           | None    | None       | None   |

## 3.14 Campus Isolation

Users only access assigned campuses (except Super Admin).

## 3.15 Program Isolation

Users only access assigned programs (except roles with broader campus/global scope).

## 3.16 Record Ownership

Each record stores Created By, Updated By, Deleted By, Approved By, Campus, Program.

## 3.17 Approval Workflow

Meal Override → Admin Approval. Attendance Correction → Coordinator Approval. Student Deactivation → Admin Approval. Store Approver, Date/Time, Reason, Previous Value, New Value.

## 3.18 Account Status

Active, Inactive, Suspended, Locked, Pending Activation. Only Active users may log in.

## 3.19 Security Rules

- Lock account after configurable failed login attempts
- Expire inactive sessions after configurable timeout
- Re-authentication for sensitive actions
- Log every permission-sensitive action
- Prevent privilege escalation

## 3.20 Audit Requirements

Log login/logout, password changes, role/permission changes, user enable/disable, meal override and attendance correction approvals. Each entry: Timestamp, User, Role, Action, Resource, Previous/New Value, Campus, Program, IP Address, Device Information.

## 3.21 Future Enhancements

Design for multiple roles per user, temporary role assignments, delegated administration, department-level permissions, scoped API tokens, SSO, 2FA, and fine-grained policies — without schema redesign.
