#!/usr/bin/env python3
"""Read-only MateusArce TV data gateway; Python 3.10+, stdlib only.

Deploy on a trusted machine, bind loopback, publish through an HTTPS reverse
proxy with authentication at this API. Provider credentials NEVER go in the
LG IPK. Run with environment variables (see gateway.example.env).
"""
import datetime as dt
import hmac
import json
import os
from pathlib import Path
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

KEY = os.environ.get("GATEWAY_KEY", "")
BIND = os.environ.get("GATEWAY_BIND", "127.0.0.1")
PORT = int(os.environ.get("GATEWAY_PORT", "18777"))
CACHE_SECONDS = 120
_CACHE = {"value": None, "time": 0.0}
_MUTEX = threading.RLock()
_GOOGLE = {"token": "", "expires": 0.0}
_USER_AGENT = "MateusArceTV-Gateway/1.0 (personal read-only dashboard)"


def fetch_json(url, bearer=None, method="GET", data=None):
    headers = {"Accept": "application/json", "User-Agent": _USER_AGENT}
    if bearer:
        headers["Authorization"] = "Bearer " + bearer
    if data is not None:
        headers["Content-Type"] = "application/x-www-form-urlencoded"
        data = urlencode(data).encode("utf-8")
    req = Request(url, headers=headers, method=method, data=data)
    try:
        with urlopen(req, timeout=10) as response:
            return json.load(response)
    except HTTPError as exc:
        # Never include request headers or OAuth secrets in error messages.
        raise RuntimeError("Serviço remoto respondeu HTTP " + str(exc.code)) from exc
    except (URLError, TimeoutError) as exc:
        raise RuntimeError("Serviço remoto indisponível ou sem conexão") from exc


def google_access_token():
    cid = os.environ.get("GOOGLE_CLIENT_ID", "")
    secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")
    refresh = os.environ.get("GOOGLE_REFRESH_TOKEN", "")
    if not cid or not secret or not refresh:
        raise RuntimeError("Credenciais do Google incompletas")
    now = time.time()
    if _GOOGLE["token"] and now < _GOOGLE["expires"]:
        return _GOOGLE["token"]
    result = fetch_json(
        "https://oauth2.googleapis.com/token",
        method="POST",
        data={"client_id": cid, "client_secret": secret,
              "refresh_token": refresh, "grant_type": "refresh_token"},
    )
    if not result.get("access_token"):
        raise RuntimeError("Não foi possível renovar o acesso Google")
    _GOOGLE.update(token=result["access_token"],
                   expires=now + max(60, int(result.get("expires_in", 3600)) - 90))
    return _GOOGLE["token"]


def google_configured():
    return all(os.environ.get(key) for key in
               ("GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"))


def calendar_data():
    if not google_configured():
        return {"status": "unconfigured", "items": []}
    token = google_access_token()
    now = dt.datetime.now(dt.timezone.utc)
    args = urlencode({
        "timeMin": now.isoformat().replace("+00:00", "Z"),
        "timeMax": (now + dt.timedelta(days=14)).isoformat().replace("+00:00", "Z"),
        "singleEvents": "true", "orderBy": "startTime", "maxResults": 12,
    })
    raw = fetch_json(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + args,
        token,
    )
    events = []
    for e in raw.get("items", []):
        if e.get("status") == "cancelled":
            continue
        start = e.get("start", {})
        events.append({
            "title": str(e.get("summary") or "(Sem título)")[:160],
            "start": start.get("dateTime") or start.get("date") or "",
            "all_day": bool(start.get("date") and not start.get("dateTime")),
        })
    return {"status": "ok", "items": events}


def todoist_data():
    token = os.environ.get("TODOIST_API_TOKEN", "")
    if not token:
        return {"status": "unconfigured", "items": []}
    raw = fetch_json("https://api.todoist.com/api/v1/tasks?limit=30", token)
    if isinstance(raw, list):
        tasks = raw
    else:
        tasks = raw.get("results", [])
    items = []
    for task in tasks[:20]:
        due = task.get("due") or {}
        items.append({
            "id": str(task.get("id", "")),
            "title": str(task.get("content") or "(Sem título)")[:160],
            "due": str(due.get("date") or "")[:32],
            "priority": task.get("priority"),
        })
    return {"status": "ok", "items": items}


def github_data():
    token = os.environ.get("GITHUB_TOKEN", "")
    username = os.environ.get("GITHUB_USERNAME", "")
    if not token and not username:
        return {"status": "unconfigured", "items": []}
    if token:
        user = fetch_json("https://api.github.com/user", token)
        username = user.get("login") or username
        notifications = fetch_json(
            "https://api.github.com/notifications?per_page=10", token
        )
        items = []
        for n in notifications:
            repo = n.get("repository") or {}
            subject = n.get("subject") or {}
            items.append({
                "title": str(subject.get("title") or "(Sem título)")[:160],
                "repository": str(repo.get("full_name") or ""),
            })
        return {"status": "ok", "username": username, "notifications": len(notifications),
                "items": items, "note": "Notificações recentes; limite de 10"}
    # Public-only mode makes no claims about private notifications.
    repos = fetch_json(
        "https://api.github.com/users/" + quote(username, safe="") +
        "/repos?sort=updated&per_page=8"
    )
    items = []
    for repo in repos:
        items.append({"title": str(repo.get("name") or "")[:160],
                      "repository": "Repositório público · " + str(repo.get("full_name") or "")})
    return {"status": "ok", "username": username, "notifications": None,
            "items": items, "note": "Somente repositórios públicos (sem token)"}


def gmail_data():
    if not google_configured():
        return {"status": "unconfigured", "items": []}
    token = google_access_token()
    info = fetch_json(
        "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX", token
    )
    listing = fetch_json(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&maxResults=6",
        token,
    )
    items = []
    for summary in listing.get("messages", [])[:6]:
        mid = quote(summary.get("id", ""), safe="")
        if not mid:
            continue
        detail = fetch_json(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/" + mid +
            "?format=metadata&metadataHeaders=Subject&metadataHeaders=From", token
        )
        headers = {}
        for header in detail.get("payload", {}).get("headers", []):
            headers[header.get("name", "").lower()] = header.get("value", "")
        items.append({
            "subject": str(headers.get("subject") or "(Sem assunto)")[:160],
            "from": str(headers.get("from") or "")[:120],
        })
    return {"status": "ok", "unread": info.get("messagesUnread", 0), "items": items}


def ai_data():
    path = os.environ.get("AI_USAGE_JSON", "")
    if not path:
        return {"status": "unconfigured", "providers": [],
                "note": "Configure AI_USAGE_JSON com um snapshot local"}
    file = Path(path).expanduser()
    raw = json.loads(file.read_text(encoding="utf-8"))
    providers = raw.get("providers", [])
    if not isinstance(providers, list):
        raise ValueError("providers precisa ser uma lista")
    result = []
    for p in providers[:8]:
        if not isinstance(p, dict):
            continue
        entry = {"name": str(p.get("name", ""))[:60],
                 "period": str(p.get("period", ""))[:40],
                 "source": str(p.get("source", ""))[:80],
                 "observed_at": str(p.get("observed_at", ""))[:40]}
        for fld in ("used_tokens", "remaining_percent"):
            value = p.get(fld)
            if isinstance(value, (int, float)) and not isinstance(value, bool):
                entry[fld] = value
        if entry["name"]:
            result.append(entry)
    return {"status": "ok", "providers": result,
            "note": "Medições reportadas pela máquina; não são necessariamente cotas oficiais"}


def safe_source(fn):
    try:
        return fn()
    except (RuntimeError, ValueError, OSError, KeyError, TypeError, json.JSONDecodeError) as exc:
        # No tracebacks, headers, account secrets or OAuth response bodies in the TV payload.
        print("Gateway source error:", type(exc).__name__, str(exc)[:120], flush=True)
        return {"status": "error", "error": str(exc)[:120]}


def dashboard():
    with _MUTEX:
        now = time.monotonic()
        if _CACHE["value"] is not None and now - _CACHE["time"] < CACHE_SECONDS:
            return _CACHE["value"]
        out = {
            "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
            "calendar": safe_source(calendar_data),
            "todoist": safe_source(todoist_data),
            "github": safe_source(github_data),
            "gmail": safe_source(gmail_data),
            "ai": safe_source(ai_data),
        }
        _CACHE.update(value=out, time=now)
        return out


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print("%s %s" % (self.address_string(), fmt % args), flush=True)

    def headers_common(self, status, content_type="application/json; charset=utf-8"):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "X-Dashboard-Key, Content-Type")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()

    def respond(self, code, payload):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.headers_common(code)
        self.wfile.write(raw)

    def do_OPTIONS(self):
        self.headers_common(204)

    def do_GET(self):
        if self.path == "/health":
            self.respond(200, {"status": "ok"})
            return
        if self.path != "/v1/dashboard":
            self.respond(404, {"error": "Not found"})
            return
        supplied = self.headers.get("X-Dashboard-Key", "")
        if not hmac.compare_digest(supplied, KEY):
            self.respond(401, {"error": "Unauthorized"})
            return
        self.respond(200, dashboard())


if __name__ == "__main__":
    if len(KEY) < 24 or KEY.lower() in ("changeme", "senha"):
        raise SystemExit("Configure GATEWAY_KEY forte (pelo menos 24 caracteres).")
    if BIND not in ("127.0.0.1", "::1", "localhost"):
        print("WARNING: exposed bind address; use HTTPS and firewall.", flush=True)
    print("MateusArce TV gateway on %s:%s (behind HTTPS proxy recommended)" %
          (BIND, PORT), flush=True)
    ThreadingHTTPServer((BIND, PORT), Handler).serve_forever()
