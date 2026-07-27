# SOFTWARE REQUIREMENTS SPECIFICATION (SRS)

# Part 7 — Frontend Architecture & UI/UX Specification

## 7.1 Overview

The **INSA Meal Management System (IMMS)** frontend is a modern, responsive Next.js web application for Super Admins, Administrators, Campus Coordinators, Mentors, and Food Staff.

Priorities: **speed**, **clarity**, and **ease of use** during peak meal distribution. Optimized for desktop, laptop, tablet, and mobile.

**Implementation:** `apps/meal-web` (Next.js App Router).

## 7.2 Design Principles

Minimal, modern, professional, fast, accessible, consistent, responsive. Minimum clicks. Barcode workflow requires **zero mouse interaction** after login whenever possible.

## 7.3 Design System

| Token | Value |
| ----- | ----- |
| Primary accent | Orange `#F97316` (sparingly; not large backgrounds) |
| Neutrals | Slate / gray surfaces (`#FFFFFF`, `#F8FAFC`, `#0F172A`) |
| Success / Warning / Error | `#22C55E` / `#F59E0B` / `#EF4444` |
| Typography | Inter 400–700 |
| Radius | 10–14px (`12px` default) |
| Spacing | 8px grid |
| Icons | Lucide (outline) |

CSS variables live in `globals.css`. Light/dark via `data-theme`.

## 7.4 Layout Structure

Fixed sidebar · sticky header · independently scrolling main content.

## 7.5 Authentication Pages

Login, Forgot Password, Reset Password — logo, email/password, remember me, real-time validation.

## 7.6 Application Layout

Header: logo, search, notifications, current user, campus context, theme switch, profile menu.

Sidebar (authorized modules only): Dashboard, Campuses, Academic Years, Programs, Students, Meal Sessions, Meal Distribution, Meal History, Mentors, Reports, Audit Logs, Settings.

## 7.7–7.10 Feature Screens

Dashboard cards/charts/activity · Student list/profile · Excel import wizard (upload → validate → preview → import → summary).

## 7.11–7.15 Meal Distribution (highest priority)

Always-focused barcode input · auto verify on Enter · student card · eligible / duplicate / not-found states · sounds · auto-reset · recent scans.

## 7.16–7.19

Meal History timeline · Reports with filters/exports · Audit logs (read-only) · Settings tabs (General, Meal Sessions, Branding, Security, Notifications, Users, Permissions).

## 7.20–7.25

Responsive (drawer on mobile) · skeletons · empty states · toasts · WCAG AA where practical · performance (lazy pages, virtualization for large tables later).

## 7.26 Component Library

Button, Input, Password Input, Search, Select, Modal, Drawer, Sidebar, Header, Card, Data Table, Pagination, Badge, Status Chip, Toast, Skeleton, Empty State, File Upload, Barcode Input, Student Information Card, Meal Status Card, etc.

## 7.27 Barcode Scanner Experience

Retain focus · process on Enter · feedback &lt; 1s · visual + optional sound · auto reset · recent scans visible.

## 7.28 UI Design Philosophy

The INSA Meal Management System shall have a **modern, premium, minimal, and enterprise-grade interface**.

The application must **not** resemble a generic dashboard template or low-quality admin panel.

The design should feel like professionally designed software rather than a collection of components.

The user experience should emphasize:

- Simplicity
- Speed
- Clarity
- Visual hierarchy
- Consistency
- Accessibility

Every screen should feel calm, spacious, and intentional.

## 7.29 Design Inspiration

Visual language should take inspiration from products such as Linear, Stripe Dashboard, Vercel, Notion, Raycast, GitHub, Figma, and Framer.

**Do not copy** these products directly; use them as references for interaction quality, spacing, typography, and polish.

Avoid inspiration from generic dashboard templates (AdminLTE, CoreUI, Metronic, “vibe” admin kits, etc.).

## 7.30 Visual Style

- Clean layouts
- Plenty of whitespace
- Soft borders
- Subtle shadows
- Rounded corners (10–14 px)
- Minimal gradients (used sparingly)
- Limited color palette
- High-quality typography
- Consistent spacing using an **8 px** spacing system

Modern without excessive effects.

## 7.31 Color Usage

Orange is the **brand accent**, not a primary background.

Use orange for:

- Active navigation item
- Primary buttons
- Selected tabs
- Focus rings
- Progress indicators
- Occasional success highlights where appropriate

Avoid large orange backgrounds. Most of the UI uses neutral tones.

## 7.32 Dashboard Philosophy

The dashboard should answer one question:

> **"What do I need to know right now?"**

Avoid filling the screen with unnecessary statistics.

Prioritize:

- Current meal session
- Meals served today
- Remaining eligible students (when available)
- Active scanning stations
- Duplicate scan alerts
- Recent activity

Every widget must have a clear purpose.

## 7.33 Cards

Simple cards: thin borders, soft shadows, large titles, clear spacing.

Avoid heavy gradients, thick borders, decorative icons, and busy backgrounds.

## 7.34 Tables

Modern tables: sticky header, optional zebra rows, hover highlight, compact-but-readable spacing, rounded container, column visibility / density controls (where useful), keyboard navigation support.

## 7.35 Animations

Subtle and purposeful (fade, scale, slide, smooth transitions). Duration **150–250 ms**.

Avoid bounce, flash, spin-heavy, or excessive motion.

## 7.36 Icons

Use **Lucide Icons** (outline only, consistent stroke). Icons support text—they must not replace labels.

## 7.37 Forms

Generous spacing, real-time validation, inline errors, clear labels, minimize required fields, logical grouping.

## 7.38 Typography

- **Inter** for UI
- Weights: 400, 500, 600, 700
- Avoid decorative fonts, all-uppercase headings, and unreadable small text
- Clear type scale for headings, body, captions, and labels

## 7.39 Mobile Experience

Not a compressed desktop layout: larger touch targets, simplified navigation, full-width forms, optimized barcode scanning, bottom sheets for actions where appropriate.

## 7.40 Component Quality Standards

Reusable, accessible, responsive, fully typed, documented, consistent. Avoid duplicate components with similar behavior.

## 7.41 Overall User Experience

Users should immediately feel the product is fast, reliable, modern, professional, and purpose-built for meal management. Design inspires confidence without distraction. The primary goal is helping staff serve meals quickly and accurately—the interface stays out of the way.

### Cursor / implementation instruction

> Do not use generic admin dashboard templates or "vibe-coded" UI patterns. Design as a premium enterprise SaaS product: clean, modern, usable, whitespace-forward, typographically strong, with subtle animation and a focused workflow. Optimize especially for meal distribution speed.

---

After Parts **1–7**, recommended next: **Part 8 – Business Rules & Meal Distribution Workflows**.
