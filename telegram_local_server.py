import json
import os
import re
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

ROOT_DIR = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = int(os.getenv("PORT", "8080"))


def load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(ROOT_DIR / ".env")


def clean(value: str, max_len: int = 200) -> str:
    text = str(value or "").strip()
    text = re.sub(r"\s+", " ", text)
    return text[:max_len]


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]{2,}$", email or ""))


def is_valid_phone(phone: str) -> bool:
    return bool(re.match(r"^[0-9+().\s-]{6,30}$", phone or ""))


def has_spam(text: str) -> bool:
    patterns = [
        r"https?://",
        r"(?:viagra|casino|escort|bitcoin giveaway|forex robot|onlyfans)",
        r"(.)\1{9,}",
    ]
    return any(re.search(pattern, text or "", flags=re.IGNORECASE) for pattern in patterns)


class TTBATHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        if self.path != "/api/contact":
            self.send_json(404, {"ok": False, "error": "Not Found"})
            return

        bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
        chat_id = os.getenv("TELEGRAM_CHAT_ID", "").strip()
        if not bot_token or not chat_id:
            self.send_json(500, {"ok": False, "error": "Configuration serveur incomplete"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload_raw = self.rfile.read(length).decode("utf-8")
            payload = json.loads(payload_raw or "{}")
        except Exception:
            self.send_json(400, {"ok": False, "error": "Payload invalide"})
            return

        fullname = clean(payload.get("fullname"), 120)
        phone = clean(payload.get("phone"), 40)
        email = clean(payload.get("email"), 160).lower()
        subject = clean(payload.get("subject"), 200)
        message = clean(payload.get("message"), 1200)

        if not fullname or len(fullname) < 2:
            self.send_json(422, {"ok": False, "error": "Nom invalide"})
            return
        if not is_valid_phone(phone):
            self.send_json(422, {"ok": False, "error": "Telephone invalide"})
            return
        if not is_valid_email(email):
            self.send_json(422, {"ok": False, "error": "Email invalide"})
            return
        if not subject or len(subject) < 2:
            self.send_json(422, {"ok": False, "error": "Sujet invalide"})
            return
        if has_spam(" ".join([fullname, phone, subject, message])):
            self.send_json(422, {"ok": False, "error": "Message rejete (spam)"})
            return

        now_paris = datetime.now(ZoneInfo("Europe/Paris")).strftime("%d/%m/%Y %H:%M:%S")
        text = "\n".join(
            [
                "NOUVELLE DEMANDE TTBAT",
                "",
                f"Nom : {fullname}",
                f"Telephone : {phone}",
                f"Email : {email}",
                f"Sujet : {subject}",
                f"Message : {message}" if message else "",
                "",
                now_paris,
            ]
        )

        body = json.dumps({"chat_id": chat_id, "text": text}).encode("utf-8")
        telegram_url = f"https://api.telegram.org/bot{bot_token}/sendMessage"

        try:
            request = Request(
                telegram_url,
                data=body,
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=12) as response:
                telegram_response = json.loads(response.read().decode("utf-8"))

            if not telegram_response.get("ok"):
                self.send_json(502, {"ok": False, "error": "Erreur envoi Telegram"})
                return

            self.send_json(200, {"ok": True, "message": "Message envoye avec succes"})
        except URLError:
            self.send_json(503, {"ok": False, "error": "Service indisponible"})
        except Exception:
            self.send_json(500, {"ok": False, "error": "Erreur serveur"})

    def send_json(self, code: int, payload: dict):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), TTBATHandler)
    print(f"TTBAT local server running on http://{HOST}:{PORT}")
    server.serve_forever()
