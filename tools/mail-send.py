#!/usr/bin/env python3
# entrosana mail sender for the Hub: reads JSON {to, subject, text[, reply_to]} on
# stdin and sends it FROM SMTP_USER TO the given address. Without reply_to the
# answer goes to the contributors' mailbox; the contact form of entrosana.com
# (POST /api/contact, 2026-11-16) passes the visitor's address instead. It took
# over from contact-send.py, the sender of the old site server on e14.
# Credentials: ~/.config/entrosana-smtp.env (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).
# exit codes: 0 sent · 2 unconfigured · 1 send failure or bad input
import json, os, re, smtplib, sys
from email.message import EmailMessage
from pathlib import Path

ENV = Path.home() / ".config" / "entrosana-smtp.env"
if not ENV.exists():
    print("unconfigured: missing ~/.config/entrosana-smtp.env", file=sys.stderr); sys.exit(2)
cfg = {}
for line in ENV.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith("#") and "=" in line:
        k, v = line.split("=", 1); cfg[k.strip()] = v.strip()
user, pw = cfg.get("SMTP_USER"), cfg.get("SMTP_PASS")
if not user or not pw:
    print("unconfigured: SMTP_USER/SMTP_PASS missing", file=sys.stderr); sys.exit(2)

ADDR = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}\.[A-Za-z]{2,}$")
try:
    data = json.loads(sys.stdin.read(32768))
    to = str(data.get("to", ""))[:254]
    subject = str(data.get("subject", ""))[:200].replace("\n", " ")
    text = str(data.get("text", ""))[:8000]
    reply_to = str(data.get("reply_to") or "").strip()[:254]
    if not ADDR.match(to) or not subject or not text or (reply_to and not ADDR.match(reply_to)):
        print("bad input", file=sys.stderr); sys.exit(1)
    m = EmailMessage()
    m["From"] = user
    m["To"] = to
    m["Subject"] = subject
    m["Reply-To"] = reply_to or cfg.get("MAIL_REPLY_TO", "sygnif@entrosana.com")   # sonst das Beitragspostfach, sortiert von SYGNIF
    m["Auto-Submitted"] = "auto-generated"
    m.set_content(text)
    with smtplib.SMTP(cfg.get("SMTP_HOST", "smtp.protonmail.ch"), int(cfg.get("SMTP_PORT", "587")), timeout=20) as s:
        s.starttls(); s.login(user, pw); s.send_message(m)
    print("sent")
except Exception as e:
    print(f"send failure: {e}", file=sys.stderr); sys.exit(1)
