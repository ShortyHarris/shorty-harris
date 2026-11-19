#!/usr/bin/env python3
"""Open skill_pay SPA with pay_code; poll until balance is ready."""

from __future__ import annotations

import argparse
import sys
import time

from _common import (
    PAY_POLL_INTERVAL,
    PAY_TIMEOUT_SEC,
    ApiError,
    access_token,
    api_base,
    ensure_logged_in,
    load_config,
    open_browser,
    pay_ready,
    request,
)


def run_pay(*, document_id: int, pay_type: str, token: str | None = None) -> dict:
    if pay_type not in ("turnitin_check", "humanizer"):
        raise ApiError("--type must be turnitin_check or humanizer")

    tok = token or ensure_logged_in()
    cfg = load_config()

    ready = pay_ready(tok, document_id, pay_type)
    if ready.get("ready"):
        print(f"Already ready for {pay_type} (document_id={document_id})")
        return ready

    code_resp = request(
        "POST",
        "/api/skill/pay/code",
        token=tok,
        json_body={"document_id": document_id, "type": pay_type},
    )
    if not isinstance(code_resp, dict) or not code_resp.get("pay_code"):
        raise ApiError(f"Unexpected pay/code response: {code_resp}")

    pay_code = code_resp["pay_code"]
    # NEVER put JWT in the URL — only pay_code
    # No trailing slash: Vue Router redirect /skill_pay/ → /skill_pay can stack-overflow.
    url = f"{api_base(cfg)}/skill_pay?c={pay_code}"
    open_browser(url)
    print(f"Complete PayPal checkout in the browser (pay_code={pay_code[:4]}...). Waiting...")

    start_ts = time.time()
    while True:
        status = pay_ready(tok, document_id, pay_type)
        if status.get("ready"):
            print(f"Payment ready for {pay_type} (document_id={document_id})")
            return status
        elapsed = time.time() - start_ts
        if elapsed >= PAY_TIMEOUT_SEC:
            raise ApiError(
                f"Timed out waiting for payment after {PAY_TIMEOUT_SEC // 60} minutes. "
                "Re-run pay or the check/humanize command."
            )
        remaining = int(PAY_TIMEOUT_SEC - elapsed)
        print(f"Waiting for payment... ({remaining}s left)")
        time.sleep(PAY_POLL_INTERVAL)


def main() -> int:
    parser = argparse.ArgumentParser(description="Turnitin0 skill payment via browser SPA")
    parser.add_argument("--document-id", type=int, required=True)
    parser.add_argument("--type", dest="pay_type", required=True, choices=["turnitin_check", "humanizer"])
    args = parser.parse_args()
    try:
        # Validate login first
        if not access_token():
            ensure_logged_in()
        run_pay(document_id=args.document_id, pay_type=args.pay_type)
        return 0
    except ApiError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
