"""Read-only before/after check that the eight business tables are unchanged.

    python manage.py schema_fingerprint --save before.json
    ... run the approved migrate ...
    python manage.py schema_fingerprint --verify before.json

On MySQL it hashes SHOW CREATE TABLE / SHOW CREATE VIEW (the AUTO_INCREMENT=n
counter is removed so row inserts do not matter). On SQLite (used only for
local rehearsals) it hashes sqlite_master. It never writes to the database.
"""
import hashlib
import json
import re

from django.core.management.base import BaseCommand, CommandError
from django.db import connection

TABLES = ["staff", "student", "hostel", "room", "booking", "payment",
          "maintenance_request", "visitor"]
VIEWS = ["room_occupancy_view"]


def normalise(sql):
    return re.sub(r"\s+AUTO_INCREMENT=\d+", "", sql or "").strip()


def collect():
    out = {}
    with connection.cursor() as c:
        for name in TABLES + VIEWS:
            if connection.vendor == "mysql":
                kind = "VIEW" if name in VIEWS else "TABLE"
                try:
                    c.execute(f"SHOW CREATE {kind} `{name}`")
                except Exception:
                    out[name] = None
                    continue
                sql = c.fetchone()[1]
            else:
                c.execute("SELECT sql FROM sqlite_master WHERE name=%s", [name])
                row = c.fetchone()
                sql = row[0] if row else None
            out[name] = (hashlib.sha256(normalise(sql).encode()).hexdigest()
                         if sql else None)
    return out


class Command(BaseCommand):
    help = "Save or verify a fingerprint of the business table definitions (read-only)."

    def add_arguments(self, parser):
        g = parser.add_mutually_exclusive_group(required=True)
        g.add_argument("--save", metavar="FILE")
        g.add_argument("--verify", metavar="FILE")

    def handle(self, *args, save=None, verify=None, **opts):
        current = collect()
        if save:
            with open(save, "w") as fh:
                json.dump(current, fh, indent=2)
            self.stdout.write(f"Saved fingerprint of {len(current)} objects to {save}")
            for k, v in current.items():
                self.stdout.write(f"  {k:22} {(v or 'MISSING')[:16]}")
            return
        with open(verify) as fh:
            before = json.load(fh)
        diffs = [k for k in before if before[k] != current.get(k)]
        if diffs:
            raise CommandError("CHANGED: " + ", ".join(diffs))
        self.stdout.write(self.style.SUCCESS(
            f"OK: all {len(before)} business tables/views identical to {verify}"))
