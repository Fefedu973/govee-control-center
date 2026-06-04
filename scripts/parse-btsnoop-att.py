#!/usr/bin/env python3
"""Extract ATT/GATT packets from Android btsnoop logs.

The output is intentionally simple JSONL so ADB action timestamps can be
correlated with Bluetooth writes without depending on Wireshark/tshark.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import struct
import sys
from collections import Counter
from pathlib import Path


BTSNOOP_EPOCH_DELTA_US = 0x00DC_DDB3_0F2F_8000
ATT_FIXED_CID = 0x0004

ATT_NAMES = {
    0x01: "error_response",
    0x02: "exchange_mtu_request",
    0x03: "exchange_mtu_response",
    0x04: "find_information_request",
    0x05: "find_information_response",
    0x08: "read_by_type_request",
    0x09: "read_by_type_response",
    0x10: "read_by_group_type_request",
    0x11: "read_by_group_type_response",
    0x12: "write_request",
    0x13: "write_response",
    0x1B: "handle_value_notification",
    0x1D: "handle_value_indication",
    0x52: "write_command",
}


def parse_iso(value: str | None) -> dt.datetime | None:
    if not value:
        return None
    parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt.timezone.utc)
    return parsed.astimezone(dt.timezone.utc)


def ts_to_iso(ts_hi: int, ts_lo: int) -> str:
    ts_us = ((ts_hi << 32) | ts_lo) - BTSNOOP_EPOCH_DELTA_US
    return dt.datetime.fromtimestamp(ts_us / 1_000_000, dt.timezone.utc).isoformat()


def uuid_from_att(raw: bytes) -> str:
    if len(raw) == 2:
        return f"0x{int.from_bytes(raw, 'little'):04x}"
    if len(raw) == 16:
        parts = (
            raw[12:16][::-1].hex(),
            raw[10:12][::-1].hex(),
            raw[8:10][::-1].hex(),
            raw[6:8][::-1].hex(),
            raw[0:6][::-1].hex(),
        )
        return "-".join(parts)
    return raw.hex()


def xor20_status(value: bytes) -> dict[str, object]:
    if len(value) != 20:
        return {}
    checksum = 0
    for byte in value[:19]:
        checksum ^= byte
    return {"xor20_expected": f"{checksum:02x}", "xor20_ok": checksum == value[19]}


def parse_att(att: bytes) -> dict[str, object]:
    if not att:
        return {"att_opcode": None, "att_name": "empty"}

    op = att[0]
    row: dict[str, object] = {
        "att_opcode": f"0x{op:02x}",
        "att_name": ATT_NAMES.get(op, "unknown"),
        "att_hex": att.hex(),
    }

    if op in (0x12, 0x52, 0x1B, 0x1D) and len(att) >= 3:
        handle = int.from_bytes(att[1:3], "little")
        value = att[3:]
        row.update(
            {
                "attribute_handle": f"0x{handle:04x}",
                "value_len": len(value),
                "value_hex": value.hex(),
            }
        )
        row.update(xor20_status(value))
        return row

    if op in (0x02, 0x03) and len(att) >= 3:
        row["mtu"] = int.from_bytes(att[1:3], "little")
        return row

    if op in (0x04, 0x08, 0x10) and len(att) >= 5:
        row.update(
            {
                "start_handle": f"0x{int.from_bytes(att[1:3], 'little'):04x}",
                "end_handle": f"0x{int.from_bytes(att[3:5], 'little'):04x}",
            }
        )
        if len(att) > 5:
            row["uuid"] = uuid_from_att(att[5:])
        return row

    if op == 0x05 and len(att) >= 2:
        fmt = att[1]
        entry_len = 4 if fmt == 1 else 18 if fmt == 2 else None
        entries = []
        if entry_len:
            for offset in range(2, len(att), entry_len):
                entry = att[offset : offset + entry_len]
                if len(entry) != entry_len:
                    break
                entries.append(
                    {
                        "handle": f"0x{int.from_bytes(entry[0:2], 'little'):04x}",
                        "uuid": uuid_from_att(entry[2:]),
                    }
                )
        row.update({"format": fmt, "entries": entries})
        return row

    if op in (0x09, 0x11) and len(att) >= 2:
        entry_len = att[1]
        entries = []
        if entry_len > 0:
            for offset in range(2, len(att), entry_len):
                entry = att[offset : offset + entry_len]
                if len(entry) != entry_len:
                    break
                item: dict[str, object] = {"handle": f"0x{int.from_bytes(entry[0:2], 'little'):04x}"}
                if op == 0x11 and entry_len in (6, 20):
                    item["end_group_handle"] = f"0x{int.from_bytes(entry[2:4], 'little'):04x}"
                    item["uuid"] = uuid_from_att(entry[4:])
                elif op == 0x09 and entry_len >= 7:
                    item["properties"] = f"0x{entry[2]:02x}"
                    item["value_handle"] = f"0x{int.from_bytes(entry[3:5], 'little'):04x}"
                    item["uuid"] = uuid_from_att(entry[5:])
                else:
                    item["value_hex"] = entry[2:].hex()
                entries.append(item)
        row.update({"entry_len": entry_len, "entries": entries})
        return row

    if op == 0x01 and len(att) >= 5:
        row.update(
            {
                "request_opcode": f"0x{att[1]:02x}",
                "error_handle": f"0x{int.from_bytes(att[2:4], 'little'):04x}",
                "error_code": f"0x{att[4]:02x}",
            }
        )

    return row


def iter_att_rows(path: Path):
    data = path.read_bytes()
    if len(data) < 16 or data[:8] != b"btsnoop\x00":
        raise ValueError(f"{path} is not a btsnoop log")

    pos = 16
    index = 0
    while pos + 24 <= len(data):
        orig_len, included_len, flags, drops, ts_hi, ts_lo = struct.unpack(">IIIIII", data[pos : pos + 24])
        pos += 24
        packet = data[pos : pos + included_len]
        pos += included_len
        if not packet:
            index += 1
            continue

        hci_type = packet[0]
        if hci_type != 0x02 or len(packet) < 9:
            index += 1
            continue

        handle_flags, acl_len = struct.unpack_from("<HH", packet, 1)
        payload = packet[5 : 5 + acl_len]
        if len(payload) < 5:
            index += 1
            continue

        l2cap_len, cid = struct.unpack_from("<HH", payload, 0)
        if cid != ATT_FIXED_CID:
            index += 1
            continue

        att = payload[4 : 4 + l2cap_len]
        row = {
            "timestamp": ts_to_iso(ts_hi, ts_lo),
            "hci_index": index,
            "direction": "in" if (flags & 1) else "out",
            "flags": f"0x{flags:x}",
            "acl_handle": f"0x{handle_flags & 0x0FFF:04x}",
            "pb_flag": (handle_flags >> 12) & 0x3,
            "bc_flag": (handle_flags >> 14) & 0x3,
            "l2cap_len": l2cap_len,
        }
        row.update(parse_att(att))
        yield row
        index += 1


def print_table(rows: list[dict[str, object]]) -> None:
    for row in rows:
        fields = [
            str(row.get("timestamp", "")),
            str(row.get("direction", "")),
            str(row.get("att_opcode", "")),
            str(row.get("att_name", "")),
        ]
        if "attribute_handle" in row:
            fields.extend([str(row.get("attribute_handle")), str(row.get("value_len")), str(row.get("value_hex"))])
        elif "uuid" in row:
            fields.append(str(row.get("uuid")))
        elif "entries" in row:
            fields.append(json.dumps(row.get("entries"), ensure_ascii=False))
        else:
            fields.append(str(row.get("att_hex", "")))
        print(" | ".join(fields))


def print_summary(rows: list[dict[str, object]]) -> None:
    op_counts = Counter(str(row.get("att_opcode")) for row in rows)
    writes = Counter()
    notifications = Counter()
    for row in rows:
        key = (row.get("attribute_handle"), row.get("value_hex"))
        if row.get("att_opcode") in ("0x12", "0x52"):
            writes[key] += 1
        if row.get("att_opcode") in ("0x1b", "0x1d"):
            notifications[key] += 1

    print("ATT opcodes:")
    for op, count in op_counts.most_common():
        print(f"  {op}: {count}")
    print("Writes:")
    for (handle, value), count in writes.most_common():
        print(f"  {handle} {value} x{count}")
    print("Notifications:")
    for (handle, value), count in notifications.most_common():
        print(f"  {handle} {value} x{count}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("btsnoop", type=Path)
    parser.add_argument("--start", help="UTC ISO timestamp lower bound, e.g. 2026-06-04T11:19:47Z")
    parser.add_argument("--end", help="UTC ISO timestamp upper bound")
    parser.add_argument("--writes-only", action="store_true")
    parser.add_argument("--summary", action="store_true")
    parser.add_argument("--format", choices=("table", "jsonl", "csv"), default="table")
    args = parser.parse_args()

    start = parse_iso(args.start)
    end = parse_iso(args.end)
    rows = []
    for row in iter_att_rows(args.btsnoop):
        timestamp = parse_iso(str(row["timestamp"]))
        if start and timestamp and timestamp < start:
            continue
        if end and timestamp and timestamp > end:
            continue
        if args.writes_only and row.get("att_opcode") not in ("0x12", "0x52", "0x1b", "0x1d"):
            continue
        rows.append(row)

    if args.summary:
        print_summary(rows)
    elif args.format == "jsonl":
        for row in rows:
            print(json.dumps(row, ensure_ascii=False, sort_keys=True))
    elif args.format == "csv":
        fieldnames = sorted({key for row in rows for key in row})
        writer = csv.DictWriter(sys.stdout, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
    else:
        print_table(rows)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
