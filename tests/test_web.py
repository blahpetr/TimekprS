import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from server import main


def config_text():
    lines = [f"# preserved setting {number}\n" for number in range(20)]
    for day in range(7):
        lines[day + 9] = f"ALLOWED_HOURS_{day + 1} = 8;9;10\n"
    lines[17] = "ALLOWED_WEEKDAYS = 1;2;3;4;5\n"
    return "".join(lines)


class WebIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.sync_dir = Path(self.directory.name)
        self.patcher = patch.object(main, "SYNC_DIR", self.sync_dir)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.client = TestClient(main.app)
        self.addCleanup(self.client.close)
        self.profile = self.sync_dir / "timekpr.alex.conf"
        self.profile.write_text(config_text())

    def test_dashboard_and_assets_are_served(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("Weekly schedule", response.text)
        for asset in ("app.js", "styles.css", "favicon.svg"):
            self.assertEqual(self.client.get(f"/static/{asset}").status_code, 200)

    def test_profile_discovery_filters_and_sorts(self):
        (self.sync_dir / "timekpr.zoe.conf").write_text(config_text())
        (self.sync_dir / "notes.txt").write_text("private notes")
        (self.sync_dir / "timekpr.backup.conf.bak").write_text(config_text())
        (self.sync_dir / "timekpr.directory.conf").mkdir()
        self.assertEqual(self.client.get("/api/timekpr/files").json(), {
            "files": ["timekpr.alex.conf", "timekpr.zoe.conf"]
        })
        with patch.object(main, "SYNC_DIR", self.sync_dir / "missing"):
            self.assertEqual(self.client.get("/api/timekpr/files").json(), {"files": []})

    def test_authenticated_save_round_trip_preserves_other_settings(self):
        response = self.client.get("/api/timekpr/file", params={"item": self.profile.name, "file": "false"})
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        payload["monday"] = [0, 12, 23]
        payload["tuesday"] = []
        payload["week"] = [1, 3, 6]
        response = self.client.put("/api/timekpr/file", json=payload, auth=("admin", "admin"))
        self.assertEqual(response.status_code, 205)
        saved_lines = self.profile.read_text().splitlines()
        self.assertEqual(saved_lines[9], "ALLOWED_HOURS_1 = 0;12;23")
        self.assertEqual(saved_lines[10], "ALLOWED_HOURS_2 = ")
        self.assertEqual(saved_lines[17], "ALLOWED_WEEKDAYS = 1;3;6")
        original_lines = config_text().splitlines()
        for index in list(range(9)) + [16, 18, 19]:
            self.assertEqual(saved_lines[index], original_lines[index])
        download = self.client.get("/api/timekpr/file", params={"item": self.profile.name, "file": "true"})
        self.assertEqual(download.text, self.profile.read_text())

    def test_invalid_auth_and_hours_do_not_change_file(self):
        payload = {"name": self.profile.name, **{day: [8] for day in main.File.model_fields if day not in ("name", "week")}, "week": [1]}
        before = self.profile.read_text()
        self.assertEqual(self.client.put("/api/timekpr/file", json=payload).status_code, 401)
        self.assertEqual(self.client.put("/api/timekpr/file", json=payload, auth=("admin", "wrong")).status_code, 403)
        payload["monday"] = [24]
        self.assertEqual(self.client.put("/api/timekpr/file", json=payload, auth=("admin", "admin")).status_code, 422)
        self.assertEqual(self.profile.read_text(), before)

    def test_traversal_and_external_symlinks_are_rejected(self):
        for name in ("../secret.conf", "..\\secret.conf", ""):
            self.assertEqual(self.client.get("/api/timekpr/file", params={"item": name, "file": "false"}).status_code, 400)
        with tempfile.TemporaryDirectory() as outside:
            target = Path(outside) / "private.conf"
            target.write_text(config_text())
            (self.sync_dir / "timekpr.link.conf").symlink_to(target)
            self.assertEqual(self.client.get("/api/timekpr/files").json(), {"files": [self.profile.name]})
            self.assertEqual(self.client.get("/api/timekpr/file", params={"item": "timekpr.link.conf", "file": "false"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
