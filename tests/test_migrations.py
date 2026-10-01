"""The migration baseline must preserve a manually initialized installation."""
from pathlib import Path
import sqlite3
import unittest

MIGRATIONS = Path(__file__).resolve().parents[1] / "src/web/research/migrations"


class MigrationTests(unittest.TestCase):
    def test_baseline_adoption_preserves_rows_and_does_not_reconsume_codes(self):
        with sqlite3.connect(":memory:") as db:
            baseline = [MIGRATIONS / "0001_research.sql", MIGRATIONS / "0002_reception.sql"]
            for path in baseline:
                db.executescript(path.read_text())
            db.execute("INSERT INTO jobs(id,company,issuer_id,as_of,status) VALUES('job','Microsoft','microsoft','2026-10-01','completed')")
            db.execute("INSERT INTO artifacts(job_id,name,part,content) VALUES('job','report',0,'{}')")
            db.execute("INSERT INTO access_codes(code_hash,session_id,ip_hash) VALUES('code','session','ip')")
            db.execute("INSERT INTO job_access(job_id,code_hash) VALUES('job','code')")
            for path in baseline:
                db.executescript(path.read_text())
            self.assertEqual(db.execute("SELECT content FROM artifacts WHERE job_id='job'").fetchone(), ('{}',))
            self.assertEqual(db.execute("SELECT uses FROM access_codes WHERE code_hash='code'").fetchone(), (1,))
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])

    def test_fresh_schema_enforces_access_limit_and_cascading_cleanup(self):
        with sqlite3.connect(":memory:") as db:
            for path in sorted(MIGRATIONS.glob("*.sql")):
                db.executescript(path.read_text())
            db.execute("INSERT INTO jobs(id,company,issuer_id,as_of,status) VALUES('job','Microsoft','microsoft','2026-10-01','completed')")
            db.execute("INSERT INTO artifacts(job_id,name,part,content) VALUES('job','report',0,'{}')")
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute("INSERT INTO access_codes(code_hash,session_id,ip_hash,uses) VALUES('code','session','ip',3)")
            db.execute("DELETE FROM jobs WHERE id='job'")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM artifacts").fetchone(), (0,))
