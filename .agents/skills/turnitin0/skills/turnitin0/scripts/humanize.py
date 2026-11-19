#!/usr/bin/env python3
"""Upload text/file, pay if needed, run AI Humanizer, download result document."""

from __future__ import annotations

import argparse
import sys
import time

from _common import (
    HUMANIZER_TIMEOUT_SEC,
    TASK_POLL_INTERVAL,
    ApiError,
    ensure_logged_in,
    ensure_paid,
    resolve_existing_file,
    request,
    upload_file,
    upload_text,
)
from download import download_document
from login import login


def create_humanizer_task(token: str, document_id: int, ai_report_id: int | None) -> dict:
    body: dict = {"document_id": document_id}
    if ai_report_id is not None:
        body["ai_report_id"] = ai_report_id
    try:
        return request("POST", "/api/humanizer/tasks", token=token, json_body=body)
    except ApiError as exc:
        if exc.status == 402:
            ensure_paid(token, document_id, "humanizer")
            return request("POST", "/api/humanizer/tasks", token=token, json_body=body)
        raise


def poll_humanizer_task(token: str, task_id: int) -> dict:
    start = time.time()
    while True:
        data = request("GET", f"/api/humanizer/tasks/{task_id}", token=token)
        if not isinstance(data, dict):
            raise ApiError(f"Unexpected task response: {data}")
        status = data.get("status")
        progress = data.get("progress_json")
        extra = f" progress={progress}" if progress else ""
        print(f"Humanizer task #{task_id}: status={status}{extra}")
        if status == "completed":
            return data
        if status == "failed":
            raise ApiError(f"Humanizer task failed: {data}")
        if time.time() - start >= HUMANIZER_TIMEOUT_SEC:
            raise ApiError(f"Timed out waiting for Humanizer task #{task_id}")
        time.sleep(TASK_POLL_INTERVAL)


def run_humanize(
    *,
    text: str | None,
    file_path: str | None,
    title: str,
    ai_report_id: int | None,
) -> dict:
    try:
        token = ensure_logged_in()
    except ApiError:
        token = login()

    if text is not None:
        doc = upload_text(token, text, title=title)
    elif file_path is not None:
        path = resolve_existing_file(file_path)
        # humanizer accepts .docx/.txt (txt converted server-side)
        doc = upload_file(token, path, purpose="humanizer_document")
    else:
        raise ApiError("Provide --text or --file")

    document_id = int(doc["id"])
    print(f"Uploaded document_id={document_id} filename={doc.get('filename')} words={doc.get('word_count')}")

    ensure_paid(token, document_id, "humanizer")

    created = create_humanizer_task(token, document_id, ai_report_id)
    if not isinstance(created, dict) or not created.get("id"):
        raise ApiError(f"Unexpected create task response: {created}")
    task_id = int(created["id"])
    print(f"Created Humanizer task #{task_id} words_charged={created.get('words_charged')}")

    result = poll_humanizer_task(token, task_id)
    result_doc_id = result.get("result_document_id")
    if not result_doc_id:
        raise ApiError(f"Task completed but no result_document_id: {result}")

    saved = download_document(token, int(result_doc_id))
    print(f"Done. Humanized document saved: {saved}")
    return {"task": result, "file": str(saved)}


def main() -> int:
    parser = argparse.ArgumentParser(description="Turnitin0 AI Humanizer")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text", type=str, help="Plain text to humanize")
    group.add_argument("--file", type=str, help="Path to .docx/.txt (runtime-provided only)")
    parser.add_argument("--title", type=str, default="document", help="Title when using --text")
    parser.add_argument(
        "--ai-report-id",
        type=int,
        default=None,
        help="Optional AI report id from a prior Turnitin check",
    )
    args = parser.parse_args()
    try:
        run_humanize(
            text=args.text,
            file_path=args.file,
            title=args.title,
            ai_report_id=args.ai_report_id,
        )
        return 0
    except ApiError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
