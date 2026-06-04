#!/usr/bin/env python3
"""Correlate adb-govee-capture actions with ATT writes from a btsnoop log."""

from __future__ import annotations

import argparse
import datetime as dt
import importlib.util
import json
from collections import OrderedDict
from pathlib import Path


def load_parser():
    script = Path(__file__).with_name("parse-btsnoop-att.py")
    spec = importlib.util.spec_from_file_location("parse_btsnoop_att", script)
    if not spec or not spec.loader:
        raise RuntimeError(f"Unable to load {script}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def parse_time(value: str) -> dt.datetime:
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def unique_by_value(rows):
    seen = OrderedDict()
    for row in rows:
        value = row.get("value_hex")
        if value and value not in seen:
            seen[value] = row
    return list(seen.values())


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=Path)
    parser.add_argument("btsnoop", type=Path)
    parser.add_argument("--prefix", default="live-", help="Only map action labels with this prefix")
    parser.add_argument("--pad-before", type=float, default=0.5)
    parser.add_argument("--pad-after", type=float, default=0.5)
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()

    att_parser = load_parser()
    rows = list(att_parser.iter_att_rows(args.btsnoop))
    actions = []
    for line in (args.session / "actions.jsonl").read_text(encoding="utf-8").splitlines():
        record = json.loads(line)
        if record.get("type") not in {"tap", "swipe"}:
            continue
        if args.prefix and not str(record.get("label", "")).startswith(args.prefix):
            continue
        actions.append(record)

    mapped = []
    for action in actions:
        start = parse_time(action["before"]["at"]) - dt.timedelta(seconds=args.pad_before)
        end = parse_time(action["after"]["at"]) + dt.timedelta(seconds=args.pad_after)
        window_rows = [
            row
            for row in rows
            if row.get("att_opcode") in {"0x52", "0x12", "0x1b", "0x1d"} and start <= parse_time(str(row["timestamp"])) <= end
        ]
        outgoing = unique_by_value([row for row in window_rows if row.get("direction") == "out"])
        incoming = unique_by_value([row for row in window_rows if row.get("direction") == "in"])
        mapped.append(
            {
                "label": action["label"],
                "type": action["type"],
                "window": {"start": action["before"]["at"], "end": action["after"]["at"]},
                "outgoing": outgoing,
                "incoming": incoming,
            }
        )

    if args.json:
        print(json.dumps(mapped, ensure_ascii=False, indent=2))
        return 0

    for item in mapped:
        print(f"\n## {item['label']}")
        print(f"{item['window']['start']} -> {item['window']['end']}")
        print("out:")
        for row in item["outgoing"]:
            print(f"  {row['timestamp']} {row.get('attribute_handle')} {row.get('value_hex')}")
        print("in:")
        for row in item["incoming"]:
            print(f"  {row['timestamp']} {row.get('attribute_handle')} {row.get('value_hex')}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
