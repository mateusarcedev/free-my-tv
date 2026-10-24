#!/usr/bin/env python3
"""Collect observed CLI token accounting without reading prompt contents or credentials.

Claude: unique assistant message usage from .claude/projects/*.jsonl.
Codex: last cumulative token_count event per rollout session in .codex/sessions.
Numbers are LOCAL LOG TOTALS, never paid-plan quota balances or API billing.
"""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import tempfile


def lines(path):
    try:
        with path.open("r", encoding="utf-8", errors="replace") as fp:
            for line in fp:
                if len(line) > 4_000_000:
                    continue
                try:
                    obj = json.loads(line)
                    if isinstance(obj, dict):
                        yield obj
                except ValueError:
                    continue
    except (OSError, PermissionError):
        return


def integer(value):
    if isinstance(value, bool):
        return 0
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return 0


def claude_tokens(root):
    """Use max usage for repeated streaming snapshots with one message id."""
    seen = {}
    count_files = 0
    if not root.is_dir():
        return None
    for path in root.rglob("*.jsonl"):
        count_files += 1
        for idx, row in enumerate(lines(path)):
            if row.get("type") != "assistant":
                continue
            message = row.get("message") or {}
            if not isinstance(message, dict):
                continue
            usage = message.get("usage") or {}
            if not isinstance(usage, dict):
                continue
            total = sum(integer(usage.get(k)) for k in (
                "input_tokens", "output_tokens",
                "cache_creation_input_tokens", "cache_read_input_tokens"))
            if total <= 0:
                continue
            marker = message.get("id") or row.get("uuid") or str(idx)
            identity = (str(path), str(marker))
            seen[identity] = max(seen.get(identity, 0), total)
    if not seen:
        return None
    return {"name": "Claude Code", "used_tokens": sum(seen.values()),
            "period": "histórico local disponível",
            "source": "transcrições locais (entrada, saída e cache)",
            "observed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "log_files": count_files}


def codex_tokens(roots):
    """Codex total_token_usage is cumulative per session: never sum every event."""
    grand_total, files_count = 0, 0
    for root in roots:
        if not root.is_dir():
            continue
        for path in root.rglob("rollout-*.jsonl"):
            latest = None
            for row in lines(path):
                payload = row.get("payload") or {}
                if row.get("type") != "event_msg" or not isinstance(payload, dict):
                    continue
                if payload.get("type") != "token_count":
                    continue
                info = payload.get("info") or {}
                usage = info.get("total_token_usage") or {}
                if not isinstance(usage, dict) or not usage:
                    continue
                if usage.get("total_tokens") is not None:
                    latest = integer(usage["total_tokens"])
                else:
                    latest = integer(usage.get("input_tokens")) + integer(usage.get("output_tokens"))
            if latest is not None:
                files_count += 1
                grand_total += latest
    if not files_count:
        return None
    return {"name": "Codex", "used_tokens": grand_total,
            "period": "histórico local disponível",
            "source": "último total acumulado por sessão local",
            "observed_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "log_files": files_count}


def write_private_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    content = json.dumps(data, ensure_ascii=False, indent=2) + "\n"
    fd, temp_path = tempfile.mkstemp(prefix=".usage-", suffix=".json", dir=str(path.parent))
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fp:
            fp.write(content)
        os.replace(temp_path, path)
    finally:
        if os.path.exists(temp_path):
            os.unlink(temp_path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--claude-dir", type=Path, default=Path.home()/".claude"/"projects")
    parser.add_argument("--codex-dir", type=Path, default=Path.home()/".codex"/"sessions")
    parser.add_argument("--codex-archived-dir", type=Path, default=Path.home()/".codex"/"archived_sessions")
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    providers = [x for x in (
        claude_tokens(args.claude_dir),
        codex_tokens((args.codex_dir, args.codex_archived_dir))
    ) if x]
    # The public gateway deliberately drops log_files; only aggregated usage leaves this PC.
    write_private_json(args.output, {"providers": providers})
    for item in providers:
        print("%s: %s tokens observados nos arquivos locais" %
              (item["name"], item["used_tokens"]))
    if not providers:
        print("Nenhum registro de tokens localizado. Não houve estimativa.")


if __name__ == "__main__":
    main()
