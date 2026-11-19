#!/usr/bin/env python3
"""Upload text/file, pay if needed, run Turnitin check, download reports."""

from __future__ import annotations

import argparse
import sys
import time

from _common import (
    TASK_POLL_INTERVAL,
    TURNITIN_TIMEOUT_SEC,
    ApiError,
    ensure_logged_in,
    ensure_paid,
    resolve_existing_file,
    request,
    upload_file,
    upload_text,
)
from download import download_report
from login import login


def create_turnitin_task(token: str, document_id: int) -> dict:
    try:
        return request(
            "POST",
            "/api/turnitin/tasks",
            token=token,
            json_body={"document_id": document_id},
        )
    except ApiError as exc:
        if exc.status == 402:
            ensure_paid(token, document_id, "turnitin_check")
            return request(
                "POST",
                "/api/turnitin/tasks",
                token=token,
                json_body={"document_id": document_id},
            )
        raise


def poll_turnitin_task(token: str, task_id: int) -> dict:
    start = time.time()
    while True:
        data = request("GET", f"/api/turnitin/tasks/{task_id}", token=token)
        if not isinstance(data, dict):
            raise ApiError(f"Unexpected task response: {data}")
        status = data.get("status")
        print(f"Turnitin task #{task_id}: status={status}")
        if status == "completed":
            return data
        if status == "failed":
            raise ApiError(f"Turnitin task failed: {data.get('fail_reason') or data}")
        if time.time() - start >= TURNITIN_TIMEOUT_SEC:
            raise ApiError(f"Timed out waiting for Turnitin task #{task_id}")
        time.sleep(TASK_POLL_INTERVAL)


def run_check(*, text: str | None, file_path: str | None, title: str) -> dict:
    try:
        token = ensure_logged_in()
    except ApiError:
        token = login()

    if text is not None:
        doc = upload_text(token, text, title=title)
    elif file_path is not None:
        path = resolve_existing_file(file_path)
        doc = upload_file(token, path, purpose="turnitin_check")
    else:
        raise ApiError("Provide --text or --file")

    document_id = int(doc["id"])
    print(f"Uploaded document_id={document_id} filename={doc.get('filename')} words={doc.get('word_count')}")

    ensure_paid(token, document_id, "turnitin_check")

    created = create_turnitin_task(token, document_id)
    if not isinstance(created, dict) or not created.get("id"):
        raise ApiError(f"Unexpected create task response: {created}")
    task_id = int(created["id"])
    print(f"Created Turnitin task #{task_id}")

    result = poll_turnitin_task(token, task_id)
    sim_id = result.get("result_similarity_report_id")
    ai_id = result.get("result_ai_report_id")
    if not sim_id and not ai_id:
        raise ApiError(f"Task completed but no report ids: {result}")

    saved = []
    if sim_id:
        saved.append(str(download_report(token, int(sim_id))))
    if ai_id:
        saved.append(str(download_report(token, int(ai_id))))

    print("Done. Reports saved:")
    for p in saved:
        print(f"  - {p}")
    return {"task": result, "files": saved}


def main() -> int:
    parser = argparse.ArgumentParser(description="Turnitin0 similarity + AI detection check")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", type=str, help="Plain text to check")
    group.add_argument("--file", type=str, help="Path to .docx/.pdf/.txt (runtime-provided only)")
    parser.add_argument("--title", type=str, default="document", help="Title when using --text")
    args = parser.parse_args()
    try:
        run_check(text=args.text, file_path=args.file, title=args.title)
        return 0
    except ApiError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
