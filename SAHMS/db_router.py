"""Hard guard: Django may never create, alter or drop the eight business tables.

The backend models are managed = False and backend/migrations is empty, so
`migrate` already emits no DDL for them. This router makes that a rule: even
if someone later runs `makemigrations`, no migration operation for the
`backend` app is allowed to run. Framework apps (auth, admin, sessions,
contenttypes, authtoken) are untouched and may create their own new tables.
"""


class ProtectBusinessTablesRouter:
    protected_apps = {"backend"}

    def allow_migrate(self, db, app_label, model_name=None, **hints):
        if app_label in self.protected_apps:
            return False
        return None
