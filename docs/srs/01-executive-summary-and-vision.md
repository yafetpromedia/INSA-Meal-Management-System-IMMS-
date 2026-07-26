# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

# Part 1 — Executive Summary & Vision

## Project Name

**INSA Meal Management System (IMMS)**

Internal / repository naming (brand-agnostic):

- Repository: `meal-management-system`
- Backend API: `meal-api`
- Frontend: `meal-web`

## Purpose

The **INSA Meal Management System (IMMS)** is a centralized web application designed to manage and monitor meal distribution for INSA training programs across multiple universities and training centers in Ethiopia.

The system verifies student eligibility using barcode scanning, prevents duplicate meal claims, records meal history, tracks meal distribution in real time, manages mentors and food staff, and generates detailed reports for administrators.

## Scope

This system is **only responsible for meal management**.

### In scope

- Organizations, campuses, programs, academic years
- Students (Excel import; Student ID = barcode)
- Mentors and food staff (users + RBAC)
- Meal sessions (Breakfast, Lunch, Dinner — configurable)
- Barcode verification and meal distribution
- Meal history, reports, audit logs, settings

### Out of scope

- Attendance
- Dormitories
- Certificates
- Events
- Medical records
- Asset tracking
- Learning management

## Architecture principles

- Multi-tenant: multiple organizations, campuses, programs, and academic years
- No hard-coded university, camp, or year
- Schedules, roles, and business rules are data-driven
- Every feature must directly support the meal distribution workflow
