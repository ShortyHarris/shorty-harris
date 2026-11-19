#!/usr/bin/env python3
"""Pair Google login via browser SPA; save JWT to config.json."""

from __future__ import annotations

import argparse
import sys

from _common import (
    LOGIN_POLL_INTERVAL,
    LOGIN_TIMEOUT_SEC,
    ApiError,
    access_token,
    api_base,
    gen_login_r,
    iso_now,
    load_config,
    mask_token,
    open_browser,
    request,
    save_config,
)


def login(*, force: bool = False) -> str:
    cfg = load_config()
    token = access_token(cfg)

    if token and not force:
        try:
            me = request("GET", "/api/me", token=token)
            if isinstance(me, dict) and me.get("id") is not None:
                email = me.get("gmail_account_name") or me.get("alias") or me.get("id")
                print(f"Already logged in as {email} (token {mask_token(token)})")
                return token
        except ApiError as exc:
            print(f"Existing token invalid ({mask_token(token)}): {exc}")
            print("Starting new login...")

    r = gen_login_r()
    print(f"Login pairing code: {r}")

    try:
        start = request("POST", "/api/skill/login/start", json_body={"r": r})
        print(f"Registered pairing: {start}")
    except ApiError as exc:
        # Still open browser; query may create pending semantics for unknown r
        print(f"Warning: login/start failed ({exc}); continuing with browser pairing.")

    # No trailing slash: Vue Router redirect /skill_login/ → /skill_login can stack-overflow.
    url = f"{api_base(cfg)}/skill_login?r={r}"
    open_browser(url)
    print("Complete Google sign-in in the browser. Waiting for pairing...")

    def _poll():
        data = request("GET", "/api/skill/login/query", query={"r": r})
        if not isinstance(data, dict):
            return None
        status = data.get("status")
        if status == "ready":
            tok = data.get("token")
            if not tok:
                raise ApiError("login/query returned ready without token")
            return tok
        if status in ("expired", "consumed"):
            raise ApiError(f"Login pairing {status}")
        # pending or unknown → keep waiting
        return None

    import time

    start_ts = time.time()
    while True:
        result = _poll()
        if result:
            new_cfg = {
                **cfg,
                "access_token": result,
                "api_base": api_base(cfg),
                "updated_at": iso_now(),
            }
            save_config(new_cfg)
            print(f"Login OK. Token saved to config.json ({mask_token(result)})")
            try:
                me = request("GET", "/api/me", token=result)
                if isinstance(me, dict):
                    print(
                        f"User: {me.get('gmail_account_name') or me.get('alias')} | "
                        f"checks={me.get('turnitin_check_balance')} | "
                        f"humanizer_words={me.get('ai_humanizer_word_balance')}"
                    )
            except ApiError:
                pass
            return result
        elapsed = time.time() - start_ts
        if elapsed >= LOGIN_TIMEOUT_SEC:
            raise ApiError(
                f"Timed out waiting for login after {LOGIN_TIMEOUT_SEC // 60} minutes. "
                "Re-run: python scripts/login.py"
            )
        remaining = int(LOGIN_TIMEOUT_SEC - elapsed)
        print(f"Waiting for login... ({remaining}s left)")
        time.sleep(LOGIN_POLL_INTERVAL)


def main() -> int:
    parser = argparse.ArgumentParser(description="Turnitin0 skill login (Google via browser)")
    parser.add_argument("--force", action="store_true", help="Force new login even if token exists")
    args = parser.parse_args()
    try:
        login(force=args.force)
        return 0
    except ApiError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
