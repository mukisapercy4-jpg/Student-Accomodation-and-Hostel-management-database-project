# Migration plan – NOT executed. Needs your explicit approval.

## What `python manage.py migrate` will do
Rehearsed on a scratch SQLite copy that contained the eight business tables: **11 new tables, 0 changes to your tables.**
The `backend` app has no migrations and its models are `managed = False`, so Django emits no DDL for them.

New tables (all created, none altered):

| Table | From |
|-------|------|
| `django_migrations` | Django bookkeeping |
| `django_content_type` | contenttypes |
| `auth_permission`, `auth_group`, `auth_group_permissions` | auth |
| `auth_user`, `auth_user_groups`, `auth_user_user_permissions` | auth |
| `django_admin_log` | admin |
| `django_session` | sessions |
| `authtoken_token` | DRF token login |

Rows are also inserted (after migrate) into `django_content_type` and `auth_permission` for the eight business models. Those are rows in the new tables, not in yours.
Tables changed: **none**. Dropped: **none**. Your view and index `idx_student_last_name` are not touched.

Migration plan (22 steps): contenttypes 0001–0002, auth 0001–0012, admin 0001–0003, authtoken 0001–0004, sessions 0001.

Requirement: the MySQL user in `.env` needs CREATE (and INDEX, REFERENCES) on `student_accommodation`. MySQL DDL cannot be rolled back, so the backup below is your rollback.

## Procedure (run these yourself, in order)
1. **Backup** (Command Prompt, MySQL bin on PATH):
   `mysqldump -u root -p --single-transaction --routines --triggers --events student_accommodation > student_accommodation_BACKUP_2026-10-27.sql`
   (`*.sql` is in `.gitignore`, so it will not be committed.)
2. **Verify the backup**: `mysql -u root -p -e "CREATE DATABASE sa_verify"`, then `mysql -u root -p sa_verify < student_accommodation_BACKUP_2026-10-27.sql`. Compare row counts of the 8 tables and `SELECT * FROM room_occupancy_view` between the two databases. Drop `sa_verify` afterwards.
3. **Add to `.env`**: `DJANGO_SECRET_KEY=<long random string>` and, locally, `DJANGO_DEBUG=True`.
4. **Fingerprint before**: `python manage.py schema_fingerprint --save before.json` (read-only).
5. **Preview**: `python manage.py migrate --plan` and confirm only the apps listed above appear.
6. Tell me you approve → `python manage.py migrate`.
7. **Verify after**: `python manage.py schema_fingerprint --verify before.json` must print `OK`. Also compare row counts of the 8 tables with step 2.
8. `python manage.py seed_roles` (creates 4 rows in `auth_group`), then `python manage.py createsuperuser`; assign other users to a group in `/admin/`.

If step 7 ever reports `CHANGED`, stop and restore from the backup.

`schema_fingerprint` was proven on SQLite only; its MySQL branch (`SHOW CREATE TABLE`) has not run against your server, so treat step 4/7 as one extra check alongside the row counts, not a replacement.
