#!/usr/bin/env python3
"""Capture Android btsnoop_net from an adb-forwarded TCP port."""

from __future__ import annotations

import argparse
import socket
import time
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8872)
    parser.add_argument("--duration", type=float, default=60.0)
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    deadline = time.monotonic() + args.duration
    total = 0

    with socket.create_connection((args.host, args.port), timeout=args.timeout) as sock:
        sock.settimeout(0.5)
        with args.output.open("wb") as handle:
            while time.monotonic() < deadline:
                try:
                    chunk = sock.recv(65536)
                except socket.timeout:
                    continue
                if not chunk:
                    break
                handle.write(chunk)
                total += len(chunk)

    print(f"captured {total} bytes to {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
