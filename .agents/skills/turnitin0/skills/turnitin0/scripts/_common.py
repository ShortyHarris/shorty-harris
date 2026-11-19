"""Shared helpers for Turnitin0 skill scripts."""

from __future__ import annotations

import http.client
import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
import webbrowser
from pathlib import Path
from typing import Any

SKILL_ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = SKILL_ROOT / "config.json"
DOWNLOADS_DIR = SKILL_ROOT / "downloads"
DEFAULT_API_BASE = "https://www.turnitin0.com"
USER_AGENT = "turnitin0-skill/1.0 (+https://www.turnitin0.com)"
LOGIN_POLL_INTERVAL = 5
PAY_POLL_INTERVAL = 5
LOGIN_TIMEOUT_SEC = 5 * 60
PAY_TIMEOUT_SEC = 5 * 60
TASK_POLL_INTERVAL = 8
TURNITIN_TIMEOUT_SEC = 60 * 60
HUMANIZER_TIMEOUT_SEC = 2 * 60 * 60


class ApiError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


def skill_root() -> Path:
    return SKILL_ROOT


def downloads_dir() -> Path:
    DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    return DOWNLOADS_DIR


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        return {}
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ApiError(f"Failed to read config.json: {exc}") from exc
    if not isinstance(data, dict):
        raise ApiError("config.json must be a JSON object")
    return data


def save_config(data: dict[str, Any]) -> None:
    CONFIG_PATH.write_text(
        json.dumps(data, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def api_base(config: dict[str, Any] | None = None) -> str:
    cfg = config if config is not None else load_config()
    base = (cfg.get("api_base") or os.environ.get("TURNITIN0_API_BASE") or DEFAULT_API_BASE).rstrip("/")
    return base


def access_token(config: dict[str, Any] | None = None) -> str | None:
    cfg = config if config is not None else load_config()
    token = cfg.get("access_token")
    if isinstance(token, str) and token.strip():
        return token.strip()
    return None


def mask_token(token: str | None) -> str:
    if not token:
        return "(none)"
    if len(token) <= 12:
        return "***"
    return f"{token[:6]}...{token[-4:]}"


def gen_login_r() -> str:
    # 16-digit numeric pairing code
    return f"{secrets.randbelow(10**16):016d}"


def open_browser(url: str) -> None:
    print(f"Opening browser: {url}")
    try:
        webbrowser.open(url, new=2)
    except Exception as exc:  # noqa: BLE001
        print(f"Could not auto-open browser ({exc}). Please open the URL manually.", file=sys.stderr)


def _detail_message(body: Any) -> str:
    if body is None:
        return ""
    if isinstance(body, dict):
        detail = body.get("detail", body)
        if isinstance(detail, dict):
            code = detail.get("code")
            message = detail.get("message") or detail.get("msg")
            parts = [p for p in (code, message) if p]
            if parts:
                return ": ".join(str(p) for p in parts)
            return json.dumps(detail, ensure_ascii=False)
        if isinstance(detail, str):
            return detail
        return json.dumps(body, ensure_ascii=False)
    if isinstance(body, str):
        return body
    return str(body)


def _parse_json(raw: bytes) -> Any:
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def _encode_multipart(fields: dict[str, str]) -> tuple[bytes, str]:
    boundary = f"----turnitin0{secrets.token_hex(16)}"
    lines: list[bytes] = []
    for name, value in fields.items():
        lines.append(f"--{boundary}".encode())
        lines.append(f'Content-Disposition: form-data; name="{name}"'.encode())
        lines.append(b"")
        lines.append(str(value).encode("utf-8"))
    lines.append(f"--{boundary}--".encode())
    lines.append(b"")
    return b"\r\n".join(lines), f"multipart/form-data; boundary={boundary}"


def request(
    method: str,
    path: str,
    *,
    token: str | None = None,
    json_body: Any = None,
    form_fields: dict[str, str] | None = None,
    query: dict[str, Any] | None = None,
    follow_redirects: bool = True,
    raw: bool = False,
    timeout: float = 60.0,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    """HTTP helper. path is absolute URL or /api/... relative to api_base."""
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    else:
        if not path.startswith("/"):
            path = "/" + path
        url = api_base() + path

    if query:
        qs = urllib.parse.urlencode({k: v for k, v in query.items() if v is not None})
        url = f"{url}?{qs}" if "?" not in url else f"{url}&{qs}"

    headers = {"User-Agent": USER_AGENT, "Accept": "application/json, */*"}
    data: bytes | None = None

    if json_body is not None:
        data = json.dumps(json_body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    elif form_fields is not None:
        # FastAPI Form(...) expects multipart (or urlencoded); use multipart
        data, content_type = _encode_multipart(form_fields)
        headers["Content-Type"] = content_type

    if token:
        headers["Authorization"] = f"Bearer {token}"
    if extra_headers:
        headers.update(extra_headers)

    req = urllib.request.Request(url, data=data, headers=headers, method=method.upper())

    opener = urllib.request.build_opener()
    if not follow_redirects:
        class _NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: N802
                return None

        opener = urllib.request.build_opener(_NoRedirect)

    try:
        with opener.open(req, timeout=timeout) as resp:
            body_bytes = resp.read()
            content_type = resp.headers.get("Content-Type", "")
            if raw:
                return {
                    "status": getattr(resp, "status", 200),
                    "headers": dict(resp.headers.items()),
                    "url": resp.geturl(),
                    "body": body_bytes,
                }
            if "application/json" in content_type or body_bytes[:1] in (b"{", b"["):
                parsed = _parse_json(body_bytes)
                return parsed if parsed is not None else body_bytes.decode("utf-8", errors="replace")
            return body_bytes.decode("utf-8", errors="replace")
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read() if exc.fp else b""
        parsed = _parse_json(body_bytes)
        # Handle redirect responses when follow_redirects=False
        if not follow_redirects and exc.code in (301, 302, 303, 307, 308):
            location = exc.headers.get("Location")
            return {
                "status": exc.code,
                "headers": dict(exc.headers.items()),
                "url": location,
                "body": body_bytes,
                "location": location,
            }
        msg = _detail_message(parsed) or exc.reason or str(exc)
        raise ApiError(f"HTTP {exc.code} {method.upper()} {url}: {msg}", status=exc.code, body=parsed) from exc
    except urllib.error.URLError as exc:
        raise ApiError(f"Network error {method.upper()} {url}: {exc.reason}") from exc


def put_bytes(url: str, content: bytes, *, timeout: float = 120.0) -> None:
    """PUT file bytes to OSS presigned URL.

    Must not send Content-Type / User-Agent that were not part of the signature.
    urllib.request auto-adds Content-Type: application/x-www-form-urlencoded when
    data= is set, which causes Aliyun OSS SignatureDoesNotMatch (HTTP 403).
    Match the browser: bare PUT + body only (Content-Length is fine).
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname:
        raise ApiError(f"Invalid OSS upload URL: {url[:80]}")

    path = parsed.path or "/"
    if parsed.query:
        path = f"{path}?{parsed.query}"

    headers = {"Content-Length": str(len(content))}
    conn: http.client.HTTPConnection
    if parsed.scheme == "https":
        conn = http.client.HTTPSConnection(parsed.hostname, parsed.port or 443, timeout=timeout)
    else:
        conn = http.client.HTTPConnection(parsed.hostname, parsed.port or 80, timeout=timeout)

    try:
        conn.request("PUT", path, body=content, headers=headers)
        resp = conn.getresponse()
        body = resp.read()
        if resp.status >= 400:
            text = body.decode("utf-8", errors="replace")
            raise ApiError(f"OSS PUT failed HTTP {resp.status}: {text[:300]}", status=resp.status)
    except ApiError:
        raise
    except OSError as exc:
        raise ApiError(f"OSS PUT network error: {exc}") from exc
    finally:
        conn.close()


def download_follow(
    path: str,
    *,
    token: str,
    dest: Path,
    timeout: float = 120.0,
) -> Path:
    """GET path (Bearer), follow redirects, write to dest. Returns final path."""
    if path.startswith("http://") or path.startswith("https://"):
        url = path
    else:
        url = api_base() + (path if path.startswith("/") else "/" + path)

    headers = {"User-Agent": USER_AGENT, "Authorization": f"Bearer {token}"}
    req = urllib.request.Request(url, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            data = resp.read()
            cd = resp.headers.get("Content-Disposition", "")
            filename = _filename_from_content_disposition(cd)
            out = dest
            if filename and dest.is_dir():
                out = dest / filename
            elif filename and not dest.suffix:
                out = dest.with_name(filename)
            out.parent.mkdir(parents=True, exist_ok=True)
            out.write_bytes(data)
            return out
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read() if exc.fp else b""
        parsed = _parse_json(body_bytes)
        msg = _detail_message(parsed) or exc.reason
        raise ApiError(f"Download failed HTTP {exc.code}: {msg}", status=exc.code, body=parsed) from exc


def _filename_from_content_disposition(cd: str) -> str | None:
    if not cd:
        return None
    # filename*=UTF-8''... or filename="..."
    for part in cd.split(";"):
        part = part.strip()
        if part.lower().startswith("filename*="):
            val = part.split("=", 1)[1].strip()
            if "''" in val:
                val = val.split("''", 1)[1]
            return urllib.parse.unquote(val.strip('"'))
        if part.lower().startswith("filename="):
            return part.split("=", 1)[1].strip().strip('"')
    return None


def require_token(*, validate: bool = True) -> tuple[str, dict[str, Any]]:
    cfg = load_config()
    token = access_token(cfg)
    if not token:
        raise ApiError("Not logged in. Run: python scripts/login.py")
    if validate:
        try:
            me = request("GET", "/api/me", token=token)
        except ApiError as exc:
            if exc.status in (401, 403):
                raise ApiError(
                    f"Saved token is invalid ({mask_token(token)}). Run: python scripts/login.py"
                ) from exc
            raise
        if not isinstance(me, dict) or "id" not in me:
            raise ApiError("Unexpected /api/me response; please re-login.")
    return token, cfg


def ensure_logged_in() -> str:
    token, _ = require_token(validate=True)
    return token


def poll_until(
    *,
    label: str,
    interval: float,
    timeout: float,
    fn,
):
    """Call fn() until it returns a truthy stop value or timeout."""
    start = time.time()
    while True:
        result = fn()
        if result is not None:
            return result
        elapsed = time.time() - start
        if elapsed >= timeout:
            raise ApiError(f"Timed out waiting for {label} after {int(timeout)}s")
        remaining = int(timeout - elapsed)
        print(f"Waiting for {label}... ({remaining}s left)")
        time.sleep(interval)


def resolve_existing_file(path_str: str) -> Path:
    """Only accept an explicit runtime-provided path that exists and is a file."""
    if not path_str or not str(path_str).strip():
        raise ApiError("File path is required")
    path = Path(path_str).expanduser()
    if not path.is_file():
        raise ApiError(f"File not found or not a regular file: {path}")
    try:
        # Ensure readable
        with path.open("rb") as f:
            f.read(1)
    except OSError as exc:
        raise ApiError(f"Cannot read file: {path} ({exc})") from exc
    return path.resolve()


def format_upload_rejection(payload: Any, *, purpose: str = "turnitin_check") -> str:
    """Translate server upload validation (fails / error_code) into product copy.

    Matches turnitin0.com homeFileValidation.js messages.
    In fails{}, True means that check failed.
    """
    if not isinstance(payload, dict):
        return f"Upload rejected: {payload}"

    is_humanizer = purpose in ("humanizer_document", "humanizer", "from-text")
    brand = "Turnitin0" if is_humanizer else "Turnitin"

    messages = {
        "word_count": (
            "Word count does not meet Turnitin requirements "
            "(>300 words and <30,000 words)."
        ),
        "language": f"Language does not meet {brand} requirements (English).",
        "size": f"File size does not meet {brand} requirements (<90 MB).",
        "parse": "Failed to parse file — check if the file is corrupted.",
        "server": "Internal server error — please try again later.",
    }

    code = str(payload.get("error_code") or payload.get("errorCode") or "").strip()
    if code == "word_count":
        wc = payload.get("word_count")
        if wc is not None:
            try:
                return (
                    "Word count does not meet Turnitin requirements "
                    f"(>300 and <30,000 words; found {int(wc):,})."
                )
            except (TypeError, ValueError):
                pass
        return messages["word_count"]
    if code in messages:
        return messages[code]

    fails = payload.get("fails")
    if isinstance(fails, dict):
        if fails.get("size"):
            return messages["size"]
        if fails.get("language"):
            return messages["language"]
        if fails.get("wordCount") and not is_humanizer:
            wc = payload.get("word_count")
            if wc is not None:
                try:
                    return (
                        "Word count does not meet Turnitin requirements "
                        f"(>300 and <30,000 words; found {int(wc):,})."
                    )
                except (TypeError, ValueError):
                    pass
            return messages["word_count"]
        if fails.get("wordCount") and is_humanizer:
            return messages["parse"]
        # All false but still rejected
        if any(bool(v) for v in fails.values()):
            failed = [k for k, v in fails.items() if v]
            return f"Upload rejected ({', '.join(failed)}). Check file type, English text, size (<90 MB)."

    if payload.get("detail"):
        return _detail_message(payload)

    return "This document does not meet upload requirements."


def upload_text(token: str, text: str, title: str = "document") -> dict[str, Any]:
    body = request(
        "POST",
        "/api/documents/from-text",
        token=token,
        json_body={"text": text, "title": title or "document"},
    )
    if not isinstance(body, dict):
        raise ApiError("Unexpected from-text response")
    if not body.get("ok") or not body.get("id"):
        raise ApiError(format_upload_rejection(body, purpose="from-text"))
    return body


def upload_file(token: str, file_path: Path, purpose: str) -> dict[str, Any]:
    """purpose: turnitin_check | humanizer_document"""
    size = file_path.stat().st_size
    if size < 1:
        raise ApiError("File is empty")
    if size > 90 * 1024 * 1024:
        raise ApiError(
            "File size does not meet Turnitin requirements (<90 MB)."
            if purpose == "turnitin_check"
            else "File size does not meet Turnitin0 requirements (<90 MB)."
        )

    # Client-side extension hints (server still validates)
    suffix = file_path.suffix.lower()
    if purpose == "turnitin_check" and suffix not in (".docx", ".pdf", ".txt"):
        raise ApiError(
            "Unsupported file type for Turnitin check. Use .docx, .pdf, or .txt."
        )
    if purpose == "humanizer_document" and suffix not in (".docx", ".txt"):
        raise ApiError(
            "Unsupported file type for AI Humanizer. Use .docx or .txt (PDF not supported)."
        )

    presign = request(
        "GET",
        "/api/oss/presign_upload",
        token=token,
        query={
            "purpose": purpose,
            "filename": file_path.name,
            "size": size,
        },
    )
    if not isinstance(presign, dict) or not presign.get("upload_url") or not presign.get("object_key"):
        raise ApiError(f"Unexpected presign response: {presign}")

    content = file_path.read_bytes()
    put_bytes(presign["upload_url"], content)

    confirmed = request(
        "POST",
        "/api/oss/confirm_upload",
        token=token,
        form_fields={
            "purpose": purpose,
            "object_key": presign["object_key"],
        },
    )
    if not isinstance(confirmed, dict):
        raise ApiError("Unexpected confirm_upload response")
    if confirmed.get("ok") is False or not confirmed.get("id"):
        raise ApiError(format_upload_rejection(confirmed, purpose=purpose))
    return confirmed


def pay_ready(token: str, document_id: int, pay_type: str) -> dict[str, Any]:
    body = request(
        "GET",
        "/api/skill/pay/ready",
        token=token,
        query={"document_id": document_id, "type": pay_type},
    )
    if not isinstance(body, dict):
        raise ApiError("Unexpected pay/ready response")
    return body


def ensure_paid(token: str, document_id: int, pay_type: str) -> None:
    """If not ready, run pay flow (inline) until ready."""
    status = pay_ready(token, document_id, pay_type)
    if status.get("ready"):
        print(f"Balance OK for {pay_type} (document_id={document_id})")
        return

    print(f"Payment required for {pay_type} (document_id={document_id})")
    # Inline pay to avoid subprocess dependency issues
    from pay import run_pay  # local import

    run_pay(document_id=document_id, pay_type=pay_type, token=token)


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
