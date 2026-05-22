#!/usr/bin/env python3
"""Fetch a daily snapshot of chimera's status via the local unraid-mcp server.

Runs on the self-hosted GitHub Actions runner colocated with chimera (see
`.github/workflows/chimera-status.yml`). Reads the MCP server over stdio
transport, calls a small fixed set of read tools, composes a JSON snapshot
matching the shape `src/components/desktop/apps/Status.astro` consumes,
and writes it to `src/data/chimera-status.json`.

Schema contract (must match the TypeScript interface in `Status.astro`):

    {
      "generated_at": "<ISO8601 UTC>",
      "uptime_seconds": int,
      "containers": {"running": int, "stopped": int},
      "array": {"used_tb": float, "total_tb": float, "parity_state": str},
      "smart_warnings": int,
      "last_updated": "<ISO8601 UTC>"
    }

`generated_at` is the freshness sentinel — the UI renders the
"awaiting first sync" state when it's null. The seed snapshot
committed at first runtime has `generated_at: null`; the runner
populates it on first successful run.

Requires `unraid-mcp` on PATH (the upstream README documents installation
via `uv pip install git+https://github.com/millsmillsymills/unraid-mcp.git`)
and `UNRAID_HOST` + `UNRAID_API_KEY` exported in the runner environment.
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "chimera-status.json"


async def call_unraid_mcp(tool_name: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    """Invoke a single unraid-mcp tool over stdio and return its JSON payload.

    `unraid-mcp` is run as a subprocess with JSON-RPC over stdin/stdout.
    """
    request_id = 1
    request = json.dumps(
        {
            "jsonrpc": "2.0",
            "id": request_id,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": params or {}},
        }
    )
    proc = subprocess.run(
        ["unraid-mcp"],
        input=request,
        capture_output=True,
        text=True,
        check=True,
        timeout=30,
    )
    payload = json.loads(proc.stdout.strip().splitlines()[-1])
    if "error" in payload:
        raise RuntimeError(f"unraid-mcp tool {tool_name} returned error: {payload['error']}")
    return payload["result"]


def to_tb(bytes_value: int) -> float:
    return round(bytes_value / (1024**4), 1)


async def fetch() -> dict[str, Any]:
    info = await call_unraid_mcp("unraid_get_info")
    array = await call_unraid_mcp("unraid_get_array")
    containers = await call_unraid_mcp("unraid_get_docker_containers")
    disks = await call_unraid_mcp("unraid_get_disks")

    uptime_seconds = int(info.get("uptime", {}).get("seconds", 0))
    running = sum(1 for c in containers if c.get("state") == "RUNNING")
    stopped = sum(1 for c in containers if c.get("state") != "RUNNING")

    used = array.get("capacity", {}).get("kilobytes", {}).get("used", 0) * 1024
    total = array.get("capacity", {}).get("kilobytes", {}).get("total", 0) * 1024

    smart_warnings = sum(
        1
        for d in disks
        if d.get("smartStatus") and d["smartStatus"] != "PASS"
    )

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    return {
        "generated_at": now,
        "uptime_seconds": uptime_seconds,
        "containers": {"running": running, "stopped": stopped},
        "array": {
            "used_tb": to_tb(used),
            "total_tb": to_tb(total),
            "parity_state": array.get("parity", [{}])[0].get("status", "unknown") if array.get("parity") else "no_parity",
        },
        "smart_warnings": smart_warnings,
        "last_updated": now,
    }


def main() -> int:
    snapshot = asyncio.run(fetch())
    OUTPUT_PATH.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"[fetch-chimera-status] wrote {OUTPUT_PATH} at {snapshot['generated_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
