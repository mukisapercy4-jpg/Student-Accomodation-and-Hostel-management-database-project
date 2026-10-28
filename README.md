# Student Accommodation and Hostel Management Database Project

Database course unit project (CS Year 2, Semester 1) — a relational database
design for managing student accommodation in university hostels: students,
hostels, rooms, bookings, payments, staff, maintenance requests, and a
visitor log.

## Repo structure

```
.
├── docs/
│   ├── ER_design.md       # Entities, attributes, relationships, normalization notes
│   ├── ER_diagram.mmd     # Mermaid source for the ER diagram (render at mermaid.live)
│   └── normalization.md   # Full 1NF/2NF/3NF justification for the report
├── sql/
│   ├── 01_schema.sql      # PostgreSQL DDL (tables, types, constraints)
│   ├── 02_sample_data.sql # Sample seed data for demo/testing
│   └── 03_queries.sql     # Demonstration queries for the report
└── README.md
```

## Setup (PostgreSQL)

```bash
createdb hostel_management
psql -d hostel_management -f sql/01_schema.sql
psql -d hostel_management -f sql/02_sample_data.sql
psql -d hostel_management -f sql/03_queries.sql
```

## Team

- Mukisa
  
- (add teammates here)

## Status

- [x] Entity list and ER design drafted
- [x] Schema DDL written
- [x] ER diagram drawn (see `docs/ER_diagram.mmd`)
- [x] Normalization write-up drafted (see `docs/normalization.md`)
- [ ] Schema run against a real PostgreSQL instance and extra queries added
- [ ] Final report assembled


## Backend (Django REST) – current state
* Decisions and rules: `docs/DECISIONS.md`. Migration/backup plan: `docs/MIGRATION_PLAN.md` (nothing migrated yet).
* `.env` (project root): `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DJANGO_SECRET_KEY`, and for local work `DJANGO_DEBUG=True`. Optional: `MALE_ONLY_ENFORCED` (default True). See `.env.example`.
* Tests (isolated in-memory SQLite, never MySQL): `python manage.py test --settings=SAHMS.test_settings`
* Note: the PostgreSQL files in `sql/` are an early draft; the live MySQL schema is the source of truth.
* Before relying on the male-only rule, run `python manage.py check_student_gender` (read-only) to see the real `student.gender` values.
