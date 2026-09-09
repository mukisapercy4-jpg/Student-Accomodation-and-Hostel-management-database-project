# Student Accommodation and Hostel Management Database Project

Database course unit project (CS Year 2, Semester 1) — a relational database
design for managing student accommodation in university hostels: students,
hostels, rooms, bookings, payments, staff, maintenance requests, and a
visitor log.

## Repo structure

```
.
├── docs/
│   └── ER_design.md      # Entities, attributes, relationships, normalization notes
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

- Mukisa (Kagabane Peace)
- (add teammates here)

## Status

- [x] Entity list and ER design drafted
- [x] Schema DDL written
- [ ] ER diagram drawn (visual)
- [ ] Report written
