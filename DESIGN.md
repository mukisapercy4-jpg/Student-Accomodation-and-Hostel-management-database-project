# Student Accommodation & Hostel Management System (SAHMS)
## System Architecture & Technical Design Document

---

## 1. Executive Summary
The Student Accommodation and Hostel Management System (SAHMS) is an enterprise-grade full-stack web application designed to manage student residential housing, booking lifecycles, real-time room inventory, fee reconciliation, and access control. 

The architecture strictly decouples presentation (React SPA), API orchestration (Django REST Framework), and relational persistence (MySQL 8.0/TiDB Cloud) while enforcing absolute immutability on core business schemas.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                       Client Layer                          │
│   React 19 + Vite + Tailwind CSS v4 (Hosted on Vercel)     │
│   - Student Portal (/student/dashboard)                     │
│   - Management Console (/admin, /manager, /staff)           │
│   - JWT Bearer Authentication + Auto-refresh                │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTPS / JSON REST API
┌──────────────────────────────▼──────────────────────────────┐
│                    Application / API Layer                  │
│       Django 5.2 + Django REST Framework (on Render)        │
│   - Gunicorn WSGI Server + WhiteNoise Static Engine         │
│   - Custom Permission Matrix (Role-Based Access Control)    │
│   - Append-Only Audit Logging & Status Transition Engine    │
│   - Dual Authentication (JWT SimpleJWT + DRF Token Auth)    │
└──────────────────────────────┬──────────────────────────────┘
                               │ MySQL Protocol (TLS/SSL via certifi)
┌──────────────────────────────▼──────────────────────────────┐
│                     Persistence Layer                       │
│           MySQL 8.0 / TiDB Cloud Serverless                 │
│   ┌──────────────────────────────┬──────────────────────┐   │
│   │   Business Tables (8)        │  Django-Managed (14) │   │
│   │   - student                  │  - accounts_*        │   │
│   │   - staff                    │  - audittrail_*      │   │
│   │   - hostel                   │  - auth_*            │   │
│   │   - room                     │  - authtoken_*       │   │
│   │   - booking                  │  - django_*          │   │
│   │   - payment                  │                      │   │
│   │   - maintenance_request      │                      │   │
│   │   - visitor                  │                      │   │
│   └──────────────────────────────┴──────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Database Architecture & Safety Controls

### 3.1 Business Schema Separation (`managed = False`)
The core database entities (`student`, `hostel`, `room`, `booking`, `payment`, `staff`, `maintenance_request`, `visitor`) are marked as `managed = False` in Django.
* **Database Router (`SAHMS.db_router.ProtectBusinessTablesRouter`)**:
  * Prevents Django migration runners from issuing `CREATE`, `ALTER`, or `DROP` statements against the existing business schema.
  * All custom extensions (such as authentication mappings and audit logs) exist exclusively in isolated tables (`accounts_studentaccount`, `audittrail_*`).

### 3.2 High-Concurrency Concurrency Safeguards
* Room allocation and booking creation execute inside atomic database transactions (`transaction.atomic()`).
* Room capacity checks utilize row-level pessimistic locking (`select_for_update()`) to prevent race conditions and overbooking.

---

## 4. Security & Role-Based Access Control (RBAC)

The system defines four staff roles plus an isolated student persona:

| Role | Scope & Permissions | Target View |
| :--- | :--- | :--- |
| **Superuser / Admin** | Unrestricted CRUD on all business resources, audit events, and user accounts. | `/admin/dashboard` |
| **Warden (Manager)** | Full management of Students, Rooms, Bookings, Payments, Maintenance, and Visitors. | `/manager/dashboard` |
| **Caretaker** | Read access to properties; operational management of Maintenance and Visitor logs. | `/staff/dashboard` |
| **ReadOnly** | Read-only access across all operational modules. No write/update permissions. | `/staff/dashboard` |
| **Student** | Strict row-level isolation: can view room availability, create pending bookings for themselves, view their own bookings, and initiate Mobile Money payments. | `/student/dashboard` |

---

## 5. API Specification & Endpoints

### 5.1 Authentication
- `POST /api/auth/token/`: SimpleJWT token generation (accepts username, email, or student reg number).
- `POST /api/auth/token/refresh/`: JWT access token renewal.
- `GET /api/auth/me/`: Returns authenticated user identity, role, target home URL, and fine-grained permission matrix.

### 5.2 Room Inventory & Bookings
- `GET /api/rooms/available/?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD[&hostel=ID]`: Dynamic room availability engine factoring in active bookings and blocking maintenance tickets.
- `POST /api/bookings/<id>/approve/`: Approves a student booking (Manager/Admin only).
- `POST /api/bookings/<id>/reject/`: Rejects a booking request.
- `POST /api/bookings/<id>/cancel/`: Cancels booking and records status history.

### 5.3 Simulated Mobile Money (MoMo) Gateway
- `POST /api/payments/momo/`: Initiates an MTN or Airtel Mobile Money transaction.
- `POST /api/payments/<id>/momo-confirm/`: Callback endpoint simulating gateway settlement (`success` or `failure`).

### 5.4 Audit & Compliance
- `GET /api/audit-logs/`: Immutable log recording actor, action, timestamp, and modified field metadata.
- `GET /api/booking-status-history/`: Historical audit trail of booking lifecycle transitions.
- `GET /api/payment-status-history/`: Historical audit trail of payment settlements.

---

## 6. Frontend Architecture (React 19 + Tailwind v4)

- **Component Tree:**
  - `Login.jsx`: Frosted glassmorphism interface with dev-only Quick Access demo bar and JWT persistence.
  - `StudentDashboard.jsx`: Modern card-based UI for room discovery, booking history, and Mobile Money modals.
  - `RoomsGrid.jsx` & `RoomCard.jsx`: Real-time room capacity visualizer with badge status (`Available`, `Occupied`, `Maintenance`).
  - `MobileChrome.jsx`: Responsive layout supporting bottom navigation on mobile devices and responsive sidebars on desktop.
- **Client-Side State & Networking (`api.js`):**
  - Centralized fetch client handling JWT refresh transparently upon receiving HTTP 401s.

---

## 7. Deployment & DevOps Strategy

- **Backend**: Hosted on Render as a Python Web Service via Gunicorn with automated migrations and role seeding inside `build.sh`.
- **Frontend**: Hosted on Vercel CDN with Single Page Application (SPA) routing managed via `vercel.json`.
- **Database**: TiDB Cloud Serverless MySQL 8.0 cluster with mandatory TLS transport verified by `certifi`.
