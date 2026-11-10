#!/usr/bin/env python3
"""Copies every custom request to Google Drive, one folder per request.

    Sublime Encargos/ENC-5003 - Ana Perez - Stickers/
        detalle.txt            number, contact, type, quantity, idea, panel link
        Originales/            the customer's files
        Vistas previas/        what the customer saw (sticker, sheet, T-shirt mockup)
        Produccion/            plotter PSDs and 300 dpi prints
        Referencia/            reference file of the classic request form

Run by cron as root (it reads /srv/sublime/rclone.conf): see deploy/README.md.
Uses the plain Drive remote (not the encrypted backup one) so files open
directly in Drive. Requests already copied are listed in .drive-synced; a
request that fails is retried on the next run. Prints no personal data.
"""
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path("/srv/sublime")
MEDIA = ROOT / "media" / "staging" / "private"
STATE = ROOT / ".drive-synced"
RCLONE = ["rclone", "--config", str(ROOT / "rclone.conf")]
DRIVE_ROOT = "gdrive:Sublime Encargos"
KIND = {"sticker": "Stickers", "tshirt": "Remeras", "free": "Encargo"}
ROLE_FOLDER = {"original": "Originales", "preview": "Vistas previas", "production": "Produccion", "reference": "Referencia"}

QUERY = """
SELECT coalesce(json_agg(r ORDER BY r.number), '[]') FROM (
  SELECT r.id, r.number, r.contact_name, r.contact_email, r.product_type, r.quantity, r.idea, r.kind,
         to_char(r.created_at AT TIME ZONE 'America/Argentina/Buenos_Aires', 'DD/MM/YYYY HH24:MI') AS created,
         coalesce((SELECT json_agg(json_build_object('pathname', f.pathname, 'name', f.original_name, 'role', f.role))
                   FROM custom_request_files f WHERE f.request_id = r.id), '[]') AS files
  FROM custom_requests r
  WHERE r.created_at > now() - interval '30 days'
) r
"""


def safe(text: str, limit: int = 60) -> str:
    """Folder and file names Drive and rclone accept everywhere."""
    text = re.sub(r"[\\/:*?\"<>|\x00-\x1f]+", " ", text).strip()
    return re.sub(r"\s+", " ", text)[:limit] or "sin nombre"


def site_url() -> str:
    for line in (ROOT / "staging.env").read_text().splitlines():
        if line.startswith("BETTER_AUTH_URL="):
            return line.split("=", 1)[1].strip()
    return ""


def requests() -> list:
    out = subprocess.run(
        ["docker", "exec", "-i", "sublime-postgres-1", "psql", "-U", "sublime_admin", "-d", "sublime_staging", "-At", "-v", "ON_ERROR_STOP=1"],
        input=QUERY, capture_output=True, text=True, check=True,
    ).stdout.strip()
    return json.loads(out or "[]")


def rclone_copy(source: Path, destination: str) -> None:
    subprocess.run([*RCLONE, "copyto", str(source), destination], check=True, capture_output=True, timeout=600)


def sync(request: dict, base_url: str) -> None:
    folder = f"{DRIVE_ROOT}/ENC-{request['number']} - {safe(request['contact_name'], 40)} - {KIND.get(request['kind'], 'Encargo')}"
    detail = "\n".join([
        f"Encargo ENC-{request['number']}",
        f"Fecha: {request['created']}",
        f"Tipo: {request['product_type']}",
        f"Cantidad: {request['quantity']}",
        f"Cliente: {request['contact_name']} <{request['contact_email']}>",
        f"Panel: {base_url}/admin/encargos/{request['id']}" if base_url else "",
        "",
        request["idea"],
        "",
    ])
    with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as handle:
        handle.write(detail)
        detail_path = Path(handle.name)
    try:
        rclone_copy(detail_path, f"{folder}/detalle.txt")
    finally:
        detail_path.unlink(missing_ok=True)
    for file in request["files"]:
        source = (MEDIA / file["pathname"]).resolve()
        if MEDIA.resolve() not in source.parents or not source.is_file():
            raise RuntimeError(f"archivo faltante en ENC-{request['number']}")
        rclone_copy(source, f"{folder}/{ROLE_FOLDER.get(file['role'], 'Otros')}/{safe(file['name'], 120)}")


def main() -> int:
    done = set(STATE.read_text().split()) if STATE.exists() else set()
    base_url = site_url()
    failures = 0
    for request in requests():
        if request["id"] in done:
            continue
        try:
            sync(request, base_url)
        except Exception as error:  # retried on the next run
            failures += 1
            print(f"✖ ENC-{request['number']}: {type(error).__name__}", file=sys.stderr)
            continue
        with STATE.open("a") as handle:
            handle.write(request["id"] + "\n")
        print(f"✔ ENC-{request['number']} copiado a Drive")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
