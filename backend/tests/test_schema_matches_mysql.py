"""Compare the Django models with the real MySQL definitions (docs/live_schema_snapshot.txt).

Offline check: it reads the pasted SHOW CREATE output, never a database.
"""
import re
from pathlib import Path

from django.apps import apps
from django.conf import settings
from django.test import SimpleTestCase

SNAPSHOT = Path(settings.BASE_DIR) / "docs" / "live_schema_snapshot.txt"
TABLES = ["staff", "student", "hostel", "room", "booking", "payment",
          "maintenance_request", "visitor"]


def parse():
    text = SNAPSHOT.read_text()
    tables = {}
    for name, ddl in re.findall(r"-- (\w+)\n(CREATE .*?);\n", text, re.S):
        if not ddl.startswith("CREATE TABLE"):
            continue
        cols = {}
        for line in ddl.splitlines()[1:]:
            m = re.match(r"\s+(\w+) (int|varchar\((\d+)\)|decimal\((\d+),(\d+)\)|date|time|text)(?=[\s,]|$)(.*?),?$", line)
            if m and not line.strip().startswith(("PRIMARY", "UNIQUE", "KEY", "CONSTRAINT")):
                cols[m.group(1)] = {"type": m.group(2), "len": m.group(3),
                                    "null": "NOT NULL" not in m.group(6)}
        checks = {}
        for col, vals in re.findall(r"CHECK \(\((\w+) in \(([^)]*)\)\)\)", ddl):
            checks[col] = set(re.findall(r"'([^']+)'", vals)) or set(re.findall(r"\d+", vals))
        tables[name] = {"cols": cols, "checks": checks, "ddl": ddl}
    return tables


class SchemaMatchesMySQL(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.live = parse()

    def test_all_eight_tables_present_in_snapshot(self):
        self.assertEqual(sorted(self.live), sorted(TABLES))

    def test_every_column_matches(self):
        for model in apps.get_app_config("backend").get_models():
            table = model._meta.db_table
            live = self.live[table]["cols"]
            fields = {f.column: f for f in model._meta.concrete_fields}
            self.assertEqual(set(fields), set(live), f"{table}: column sets differ")
            for col, f in fields.items():
                spec = live[col]
                self.assertEqual(f.null, spec["null"] and not f.primary_key,
                                 f"{table}.{col} nullability")
                if f.get_internal_type() in ("CharField", "EmailField"):
                    self.assertEqual(str(f.max_length), spec["len"], f"{table}.{col} length")

    def test_status_check_constraints_match_model_choices(self):
        pairs = [("booking", "status", "Booking"), ("payment", "payment_status", "Payment"),
                 ("payment", "payment_method", "Payment"),
                 ("maintenance_request", "status", "MaintenanceRequest"),
                 ("maintenance_request", "priority", "MaintenanceRequest")]
        for table, col, name in pairs:
            model = apps.get_model("backend", name)
            choices = {str(c[0]) for c in model._meta.get_field(col).choices}
            self.assertEqual(choices, self.live[table]["checks"][col], f"{table}.{col}")

    def test_values_the_rules_rely_on(self):
        self.assertEqual(self.live["booking"]["checks"]["status"],
                         {"Pending", "Active", "Completed", "Cancelled"})
        self.assertEqual(self.live["payment"]["checks"]["payment_status"],
                         {"Pending", "Completed", "Failed", "Refunded"})

    def test_gender_column_is_free_text_without_constraint(self):
        """Documents that gender is free text, so the API does not rely on it for any rule."""
        gender = self.live["student"]["cols"]["gender"]
        self.assertEqual((gender["type"], gender["null"]), ("varchar(10)", True))
        self.assertNotIn("gender", self.live["student"]["checks"])
        self.assertNotIn("gender in", self.live["student"]["ddl"])
