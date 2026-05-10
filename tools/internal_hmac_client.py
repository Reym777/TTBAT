import hashlib
import hmac
import json
import os
import time
import urllib.request

endpoint = os.getenv("INTERNAL_CONTACT_URL", "http://localhost:8787/api/internal/contact")
secret = os.getenv("INTERNAL_HMAC_SECRET", "")

if not secret:
    raise SystemExit("Missing INTERNAL_HMAC_SECRET environment variable.")

payload = {
    "name": "Client Interne",
    "company": "TTBAT",
    "email": "interne@ttbat.fr",
    "phone": "+33123456789",
    "projectType": "Bardage",
    "message": "Message interne signe pour validation du flux HMAC.",
    "website": "",
}

raw_body = json.dumps(payload, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
timestamp = str(int(time.time() * 1000))
message = (timestamp + ".").encode("utf-8") + raw_body
signature = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()

request = urllib.request.Request(
    endpoint,
    data=raw_body,
    headers={
        "Content-Type": "application/json",
        "X-TTBAT-Internal": "1",
        "X-TTBAT-Timestamp": timestamp,
        "X-TTBAT-Signature": signature,
    },
    method="POST",
)

try:
    with urllib.request.urlopen(request, timeout=20) as response:
        body = response.read().decode("utf-8", errors="replace")
        print("status:", response.status)
        print("response:", body)
except urllib.error.HTTPError as err:
    error_body = err.read().decode("utf-8", errors="replace")
    print("status:", err.code)
    print("response:", error_body)
