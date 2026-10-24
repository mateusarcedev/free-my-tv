#!/usr/bin/env python3
"""One-time Google Calendar + Gmail read-only OAuth authorization, on YOUR computer.

Run with GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET for a Google Cloud OAuth
"Desktop app" client. A local callback receives the authorization code.
Refresh token is printed to this terminal only; store in a protected .env file.
"""
import base64
import hashlib
import http.server
import json
import os
import secrets
import urllib.parse
import urllib.request
import webbrowser

CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
SCOPES = [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/gmail.readonly",
]


def main():
    if not CLIENT_ID or not CLIENT_SECRET:
        raise SystemExit("Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no seu terminal.")
    state = secrets.token_urlsafe(30)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).rstrip(b"=").decode("ascii")
    pending = {"code": None, "error": None}
    class Callback(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            parsed = urllib.parse.urlparse(self.path)
            values = urllib.parse.parse_qs(parsed.query)
            if parsed.path != "/callback" or values.get("state") != [state]:
                self.send_error(400, "OAuth state inválido")
                return
            pending["code"] = values.get("code", [None])[0]
            pending["error"] = values.get("error", [None])[0]
            body = b"<html><body><h2>Autorizacao recebida.</h2>Volte ao terminal.</body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    with http.server.HTTPServer(("127.0.0.1", 0), Callback) as server:
        server.timeout = 300
        redirect = "http://127.0.0.1:%d/callback" % server.server_port
        query = urllib.parse.urlencode({
            "client_id": CLIENT_ID, "response_type": "code", "redirect_uri": redirect,
            "scope": " ".join(SCOPES), "access_type": "offline", "prompt": "consent",
            "state": state, "code_challenge": challenge,
            "code_challenge_method": "S256",
        })
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + query
        print("Abra esta URL no navegador do computador:\n" + url + "\n", flush=True)
        webbrowser.open(url)
        server.handle_request()
    if pending["error"]:
        raise SystemExit("Google recusou o acesso: " + pending["error"])
    if not pending["code"]:
        raise SystemExit("Nenhum código recebido. Execute novamente.")
    payload = urllib.parse.urlencode({
        "code": pending["code"], "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
        "redirect_uri": redirect, "grant_type": "authorization_code",
        "code_verifier": verifier,
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://oauth2.googleapis.com/token", data=payload,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        result = json.load(response)
    if not result.get("refresh_token"):
        raise SystemExit("Não foi emitido refresh_token. Verifique consentimento OAuth e tente novamente.")
    print("\nGuarde somente no servidor, NUNCA no GitHub ou na TV:")
    print("GOOGLE_REFRESH_TOKEN=" + result["refresh_token"])


if __name__ == "__main__":
    main()
