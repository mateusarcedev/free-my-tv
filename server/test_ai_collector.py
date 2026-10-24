"""Offline checks: count usage snapshots once and never expose log contents."""
import json
import tempfile
import unittest
from pathlib import Path

from collect_ai_usage import claude_tokens, codex_tokens


class UsageCollectionTests(unittest.TestCase):
    def test_claude_stream_snapshots_are_not_double_counted(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            data = [
                {"type": "assistant", "message": {"id": "m1", "usage": {"input_tokens": 5, "output_tokens": 2}}},
                {"type": "assistant", "message": {"id": "m1", "usage": {"input_tokens": 5, "output_tokens": 7}}},
                {"type": "assistant", "message": {"id": "m2", "usage": {"input_tokens": 2, "output_tokens": 3}}},
                {"type": "user", "message": {"usage": {"input_tokens": 9000}}},
            ]
            (root / "chat.jsonl").write_text("\n".join(map(json.dumps, data)))
            self.assertEqual(claude_tokens(root)["used_tokens"], 17)

    def test_codex_uses_last_cumulative_total_per_file(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            events = [
                {"type": "event_msg", "payload": {"type": "token_count",
                    "info": {"total_token_usage": {"total_tokens": 30}}}},
                {"type": "event_msg", "payload": {"type": "token_count",
                    "info": {"total_token_usage": {"total_tokens": 55}}}},
                {"type": "event_msg", "payload": {"type": "token_count",
                    "info": None}},
            ]
            (root / "rollout-session.jsonl").write_text("\n".join(map(json.dumps, events)))
            self.assertEqual(codex_tokens([root])["used_tokens"], 55)

    def test_missing_logs_means_unavailable_not_zero_usage(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            self.assertIsNone(claude_tokens(root))
            self.assertIsNone(codex_tokens([root]))


if __name__ == "__main__":
    unittest.main()
