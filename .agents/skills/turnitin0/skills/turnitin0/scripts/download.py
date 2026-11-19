#!/usr/bin/env python3
"""Download Turnitin reports or humanized documents into downloads/."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from _common import (
    ApiError,
    download_follow,
    downloads_dir,
    ensure_logged_in,
)


def download_report(token: str, report_id: int, dest: Path | None = None) -> Path:
    out_dir = dest if dest is not None else downloads_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    path = download_follow(
        f"/api/files/reports/{report_id}/download",
        token=token,
        dest=out_dir,
    )
    print(f"Saved report #{report_id} -> {path}")
    return path


def download_document(token: str, document_id: int, dest: Path | None = None) -> Path:
    out_dir = dest if dest is not None else downloads_dir()
    out_dir.mkdir(parents=True, exist_ok=True)
    path = download_follow(
        f"/api/files/documents/{document_id}/download",
        token=token,
        dest=out_dir,
    )
    print(f"Saved document #{document_id} -> {path}")
    return path


def main() -> int:
    parser = argparse.ArgumentParser(description="Download Turnitin0 reports/documents")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--report-id", type=int, help="Report id (AI or similarity)")
    group.add_argument("--document-id", type=int, help="Document id (humanized result)")
    parser.add_argument("--out", type=str, default=None, help="Output directory (default: downloads/)")
    args = parser.parse_args()
    try:
        token = ensure_logged_in()
        dest = Path(args.out) if args.out else downloads_dir()
        if args.report_id is not None:
            download_report(token, args.report_id, dest)
        else:
            download_document(token, args.document_id, dest)
        return 0
    except ApiError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
