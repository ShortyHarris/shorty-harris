"""Forward repo-root script entrypoints to skills/turnitin0/scripts (dual-entry)."""

from __future__ import annotations

import runpy
import sys
from pathlib import Path


def forward(script_name: str) -> None:
    target = (
        Path(__file__).resolve().parent.parent
        / "skills"
        / "turnitin0"
        / "scripts"
        / script_name
    )
    if not target.is_file():
        raise SystemExit(f"Skill script not found: {target}")
    # Make nested scripts/ importable (_common, download, login, …)
    nested_dir = str(target.parent)
    if nested_dir not in sys.path:
        sys.path.insert(0, nested_dir)
    runpy.run_path(str(target), run_name="__main__")
