#!/usr/bin/env python3
"""Fetch a daily snapshot of chimera's status via the local unraid-mcp server.

Runs on the self-hosted GitHub Actions runner colocated with chimera (see
`.github/workflows/chimera-status.yml`). Talks to the MCP server over stdio
JSON-RPC, calls a small fixed set of read tools, composes a JSON snapshot
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

This script is deliberately stdlib-only: the workflow runs it under the
runner's system ``python3``, which does not have an MCP client library
installed. ``unraid-mcp`` itself lives in a separate interpreter and is
on PATH as a console script (the upstream README documents installation
via ``uv pip install git+https://github.com/millsmillsymills/unraid-mcp.git``).
``UNRAID_HOST`` + ``UNRAID_API_KEY`` must be exported in the runner env.
"""

from __future__ import annotations

import json
import subprocess
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

OUTPUT_PATH = Path(__file__).resolve().parent.parent / "src" / "data" / "chimera-status.json"

# MCP stdio handshake protocol version. unraid-mcp rejects any tools/call
# that arrives before initialize + initialized with JSON-RPC -32602.
PROTOCOL_VERSION = "2024-11-05"


def _send(proc: subprocess.Popen[str], message: dict[str, Any]) -> None:
    """Write one newline-delimited JSON-RPC message to the server's stdin."""
    assert proc.stdin is not None
    proc.stdin.write(json.dumps(message) + "\n")
    proc.stdin.flush()


def _read_response(proc: subprocess.Popen[str], expected_id: int) -> dict[str, Any]:
    """Read stdout lines until the JSON-RPC response with ``expected_id`` arrives.

    Notifications and log lines (no matching ``id``) are skipped.
    """
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if not line:
            continue
        message = json.loads(line)
        if message.get("id") == expected_id:
            return message
    raise RuntimeError(f"unraid-mcp closed stdout before responding to id={expected_id}")


def _extract(result: dict[str, Any]) -> Any:
    """Pull the tool payload out of an MCP tools/call result.

    fastmcp returns typed tool output as ``structuredContent`` (objects as
    a dict; list-returning tools are wrapped as ``{"result": [...]}``). Fall
    back to parsing the first text content block as JSON for servers that
    only populate ``content``.
    """
    structured = result.get("structuredContent")
    if structured is not None:
        return structured
    for block in result.get("content") or []:
        if block.get("type") == "text":
            try:
                return json.loads(block["text"])
            except (ValueError, KeyError):
                pass
    return None


def call_unraid_mcp(tool_name: str, arguments: dict[str, Any] | None = None) -> Any:
    """Invoke a single unraid-mcp tool over stdio JSON-RPC and return its payload.

    Performs the MCP ``initialize`` + ``notifications/initialized`` handshake
    before the ``tools/call``. stdin is held open until the response is read —
    closing it early races the server's shutdown against the in-flight Unraid
    GraphQL round-trip and can drop the response.
    """
    proc = subprocess.Popen(
        ["unraid-mcp"],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    try:
        _send(proc, {
            "jsonrpc": "2.0",
            "id": 0,
            "method": "initialize",
            "params": {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": "fetch-chimera-status", "version": "1.0"},
            },
        })
        _read_response(proc, 0)
        _send(proc, {"jsonrpc": "2.0", "method": "notifications/initialized"})
        _send(proc, {
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
        })
        message = _read_response(proc, 1)
    finally:
        if proc.stdin is not None:
            proc.stdin.close()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    if "error" in message:
        raise RuntimeError(f"unraid-mcp tool {tool_name} returned error: {message['error']}")
    result = message.get("result") or {}
    if result.get("isError"):
        raise RuntimeError(f"unraid-mcp tool {tool_name} reported error: {result.get('content')}")
    return _extract(result)


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: Any) -> list[dict[str, Any]]:
    """Normalize a tool payload to a list of records.

    Object-returning tools yield a dict; fastmcp wraps list returns as
    ``{"result": [...]}``. Tolerate both, plus a bare list, and degrade to
    an empty list rather than crashing on an unexpected shape.
    """
    if isinstance(value, list):
        return value
    if isinstance(value, dict) and isinstance(value.get("result"), list):
        return value["result"]
    return []


def _pick(record: dict[str, Any], *keys: str) -> Any:
    """Return the first non-null value among ``keys`` (snake/camel tolerant)."""
    for key in keys:
        candidate = record.get(key)
        if candidate is not None:
            return candidate
    return None


def _to_int(value: Any) -> int:
    """Coerce a value (Unraid serializes capacity as a string) to int, else 0."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _uptime_seconds(info: dict[str, Any]) -> int:
    """Derive uptime in seconds from ``info.os.uptime`` (a boot ISO timestamp)."""
    raw = _as_dict(info.get("os")).get("uptime")
    if not isinstance(raw, str) or not raw:
        return 0
    try:
        boot = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return 0
    return max(0, int((datetime.now(UTC) - boot).total_seconds()))


def to_tb(bytes_value: int) -> float:
    return round(bytes_value / (1024**4), 1)


def fetch() -> dict[str, Any]:
    info = _as_dict(call_unraid_mcp("unraid_get_info"))
    array = _as_dict(call_unraid_mcp("unraid_get_array"))
    containers = _as_list(call_unraid_mcp("unraid_list_containers"))
    disks = _as_list(call_unraid_mcp("unraid_list_disks"))

    running = sum(1 for c in containers if c.get("state") == "RUNNING")
    stopped = sum(1 for c in containers if c.get("state") != "RUNNING")

    kilobytes = _as_dict(_as_dict(array.get("capacity")).get("kilobytes"))
    used = _to_int(kilobytes.get("used")) * 1024
    total = _to_int(kilobytes.get("total")) * 1024

    parities = array.get("parities") or []
    parity_state = (
        parities[0].get("status", "unknown")
        if parities and isinstance(parities[0], dict)
        else "no_parity"
    )

    smart_warnings = sum(
        1 for d in disks if _pick(d, "smart_status", "smartStatus") not in (None, "", "PASS")
    )

    now = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    return {
        "generated_at": now,
        "uptime_seconds": _uptime_seconds(info),
        "containers": {"running": running, "stopped": stopped},
        "array": {
            "used_tb": to_tb(used),
            "total_tb": to_tb(total),
            "parity_state": parity_state,
        },
        "smart_warnings": smart_warnings,
        "last_updated": now,
    }


def main() -> int:
    snapshot = fetch()
    OUTPUT_PATH.write_text(json.dumps(snapshot, indent=2) + "\n")
    print(f"[fetch-chimera-status] wrote {OUTPUT_PATH} at {snapshot['generated_at']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
