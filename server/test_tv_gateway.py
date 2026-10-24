"""Offline tests: provider secrets and network are never required."""
import json
import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest import mock
from urllib.error import HTTPError
from urllib.request import Request, urlopen

import tv_gateway as tv


class IntegrationTests(unittest.TestCase):
    def test_google_is_unconfigured_without_oauth(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(tv.calendar_data()["status"], "unconfigured")
            self.assertEqual(tv.gmail_data()["status"], "unconfigured")

    def test_todoist_unconfigured(self):
        with mock.patch.dict(os.environ, {}, clear=True):
            self.assertEqual(tv.todoist_data()["status"], "unconfigured")

    def test_ai_snapshot_observed_not_invented(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "usage.json"
            path.write_text(json.dumps({"providers": [
                {"name": "Claude Code", "used_tokens": 876, "source": "log-local"},
                {"name": "Codex", "used_tokens": "unknown"},
            ]}), encoding="utf-8")
            with mock.patch.dict(os.environ, {"AI_USAGE_JSON": str(path)}):
                result = tv.ai_data()
                self.assertEqual(result["status"], "ok")
                self.assertEqual(result["providers"][0]["used_tokens"], 876)
                self.assertNotIn("used_tokens", result["providers"][1])

    def test_provider_errors_have_status(self):
        def fail():
            raise RuntimeError("Service unavailable")
        self.assertEqual(tv.safe_source(fail)["status"], "error")

    def test_dashboard_requires_shared_key(self):
        tv.KEY = "integration-test-key-over-24-chars"
        with mock.patch.object(tv, "dashboard", return_value={"calendar": {"status": "ok"}}):
            httpd = tv.ThreadingHTTPServer(("127.0.0.1", 0), tv.Handler)
            thread = threading.Thread(target=httpd.serve_forever, daemon=True)
            thread.start()
            url = "http://127.0.0.1:%d/v1/dashboard" % httpd.server_port
            try:
                with self.assertRaises(HTTPError) as failure:
                    urlopen(Request(url), timeout=3)
                self.assertEqual(failure.exception.code, 401)
                with urlopen(Request(url, headers={"X-Dashboard-Key": tv.KEY}), timeout=3) as response:
                    self.assertEqual(json.load(response)["calendar"]["status"], "ok")
            finally:
                httpd.shutdown()
                httpd.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
