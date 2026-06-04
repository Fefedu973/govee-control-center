#!/usr/bin/env python3
import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
import time
import zipfile
from pathlib import Path
from xml.etree import ElementTree


ROOT = Path.cwd()
DEFAULT_OUT = ROOT / ".adb-capture" / "sessions"


def run_adb(args, *, binary=False, check=True, timeout=None):
  command = ["adb", *args]
  result = subprocess.run(
    command,
    check=False,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    timeout=timeout,
  )
  if check and result.returncode != 0:
    stderr = result.stderr.decode("utf-8", errors="replace").strip()
    raise SystemExit(f"adb failed: {' '.join(command)}\n{stderr}")
  if binary:
    return result.stdout
  return result.stdout.decode("utf-8", errors="replace")


def now_iso():
  return dt.datetime.now(dt.timezone.utc).isoformat(timespec="milliseconds")


def safe_name(value):
  return re.sub(r"[^a-zA-Z0-9_.-]+", "-", value.strip()).strip("-") or "capture"


def session_dir(args):
  if args.session:
    return Path(args.session).resolve()
  stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
  return (DEFAULT_OUT / f"{stamp}-{safe_name(args.name)}").resolve()


def ensure_session(path):
  path.mkdir(parents=True, exist_ok=True)
  (path / "screens").mkdir(exist_ok=True)
  (path / "ui").mkdir(exist_ok=True)
  return path


def append_jsonl(path, record):
  with (path / "actions.jsonl").open("a", encoding="utf-8") as handle:
    handle.write(json.dumps(record, ensure_ascii=False, sort_keys=True) + "\n")


def device_time():
  epoch_ms = run_adb(["shell", "date", "+%s%3N"], check=False).strip()
  human = run_adb(["shell", "date", "-Iseconds"], check=False).strip()
  return {"device_epoch_ms": epoch_ms, "device_iso": human}


def screencap(path, label):
  data = run_adb(["exec-out", "screencap", "-p"], binary=True, timeout=15)
  target = path / "screens" / f"{safe_name(label)}.png"
  target.write_bytes(data)
  return str(target)


def ui_dump(path, label):
  raw = run_adb(["exec-out", "uiautomator", "dump", "/dev/tty"], timeout=15)
  marker = "UI hierchary dumped"
  xml = raw.split(marker, 1)[0].strip()
  target = path / "ui" / f"{safe_name(label)}.xml"
  target.write_text(xml, encoding="utf-8")
  return target


def node_bounds(node):
  match = re.match(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
  if not match:
    return None
  left, top, right, bottom = map(int, match.groups())
  return {
    "left": left,
    "top": top,
    "right": right,
    "bottom": bottom,
    "center_x": (left + right) // 2,
    "center_y": (top + bottom) // 2,
  }


def list_visible_text(xml_path):
  root = ElementTree.fromstring(xml_path.read_text(encoding="utf-8"))
  rows = []
  for node in root.iter("node"):
    text = node.attrib.get("text", "").strip()
    rid = node.attrib.get("resource-id", "").strip()
    clickable = node.attrib.get("clickable") == "true"
    bounds = node_bounds(node)
    if not bounds or not (text or rid or clickable):
      continue
    rows.append({
      "text": text,
      "resource_id": rid,
      "class": node.attrib.get("class", ""),
      "clickable": clickable,
      "bounds": bounds,
    })
  return rows


def cmd_start(args):
  path = ensure_session(session_dir(args))
  metadata = {
    "session": str(path),
    "name": args.name,
    "started_at": now_iso(),
    "device": run_adb(["devices", "-l"]).strip(),
    "screen_size": run_adb(["shell", "wm", "size"], check=False).strip(),
    "density": run_adb(["shell", "wm", "density"], check=False).strip(),
    "focus": run_adb(["shell", "dumpsys", "window"], check=False),
  }
  (path / "metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
  ui_path = ui_dump(path, "initial")
  screen = screencap(path, "initial")
  append_jsonl(path, {"type": "session-start", "at": now_iso(), **device_time(), "screen": screen, "ui": str(ui_path)})
  print(path)


def cmd_snapshot(args):
  path = ensure_session(Path(args.session).resolve())
  label = args.label or f"snapshot-{int(time.time())}"
  ui_path = ui_dump(path, label)
  screen = screencap(path, label)
  record = {"type": "snapshot", "label": label, "at": now_iso(), **device_time(), "screen": screen, "ui": str(ui_path)}
  append_jsonl(path, record)
  print(json.dumps(record, ensure_ascii=False, indent=2))


def cmd_list_ui(args):
  path = ensure_session(Path(args.session).resolve())
  label = args.label or f"ui-{int(time.time())}"
  ui_path = ui_dump(path, label)
  rows = list_visible_text(ui_path)
  if args.query:
    query = args.query.casefold()
    rows = [row for row in rows if query in row["text"].casefold() or query in row["resource_id"].casefold()]
  print(json.dumps(rows, ensure_ascii=False, indent=2))


def cmd_tap(args):
  path = ensure_session(Path(args.session).resolve())
  label = args.label or f"tap-{args.x}-{args.y}"
  before = {"at": now_iso(), **device_time()}
  screen_before = screencap(path, f"{label}-before")
  run_adb(["shell", "input", "tap", str(args.x), str(args.y)], timeout=10)
  time.sleep(args.wait)
  after = {"at": now_iso(), **device_time()}
  ui_after = ui_dump(path, f"{label}-after")
  screen_after = screencap(path, f"{label}-after")
  record = {
    "type": "tap",
    "label": label,
    "x": args.x,
    "y": args.y,
    "before": before,
    "after": after,
    "screen_before": screen_before,
    "screen_after": screen_after,
    "ui_after": str(ui_after),
  }
  append_jsonl(path, record)
  print(json.dumps(record, ensure_ascii=False, indent=2))


def cmd_swipe(args):
  path = ensure_session(Path(args.session).resolve())
  label = args.label or f"swipe-{args.x1}-{args.y1}-{args.x2}-{args.y2}"
  before = {"at": now_iso(), **device_time()}
  screen_before = screencap(path, f"{label}-before")
  run_adb(["shell", "input", "swipe", str(args.x1), str(args.y1), str(args.x2), str(args.y2), str(args.duration_ms)], timeout=10)
  time.sleep(args.wait)
  after = {"at": now_iso(), **device_time()}
  ui_after = ui_dump(path, f"{label}-after")
  screen_after = screencap(path, f"{label}-after")
  record = {
    "type": "swipe",
    "label": label,
    "before": before,
    "after": after,
    "screen_before": screen_before,
    "screen_after": screen_after,
    "ui_after": str(ui_after),
    "from": [args.x1, args.y1],
    "to": [args.x2, args.y2],
    "duration_ms": args.duration_ms,
  }
  append_jsonl(path, record)
  print(json.dumps(record, ensure_ascii=False, indent=2))


def cmd_bugreport(args):
  path = ensure_session(Path(args.session).resolve())
  target = path / f"bugreport-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.zip"
  print(f"Writing bugreport to {target}", file=sys.stderr)
  result = subprocess.run(["adb", "bugreport", str(target)], check=False)
  if result.returncode != 0:
    raise SystemExit(f"adb bugreport failed with exit code {result.returncode}")
  append_jsonl(path, {"type": "bugreport", "at": now_iso(), "path": str(target)})
  print(target)


def cmd_extract_btsnoop(args):
  bugreport = Path(args.bugreport).resolve()
  output = Path(args.output).resolve() if args.output else bugreport.with_suffix("")
  output.mkdir(parents=True, exist_ok=True)
  extracted = []
  with zipfile.ZipFile(bugreport) as archive:
    for info in archive.infolist():
      lower = info.filename.lower()
      if "btsnoop" not in lower and "bt_snoop" not in lower and "btsnooz" not in lower:
        continue
      target = output / Path(info.filename).name
      target.write_bytes(archive.read(info))
      extracted.append(str(target))
  print(json.dumps(extracted, ensure_ascii=False, indent=2))


def build_parser():
  parser = argparse.ArgumentParser(description="ADB-driven Govee BLE capture helper")
  sub = parser.add_subparsers(required=True)

  start = sub.add_parser("start", help="create a timestamped capture session")
  start.add_argument("--name", default="govee-ble")
  start.add_argument("--session")
  start.set_defaults(func=cmd_start)

  snapshot = sub.add_parser("snapshot", help="capture screen + UI XML")
  snapshot.add_argument("session")
  snapshot.add_argument("--label")
  snapshot.set_defaults(func=cmd_snapshot)

  list_ui = sub.add_parser("list-ui", help="dump clickable/text UI nodes")
  list_ui.add_argument("session")
  list_ui.add_argument("--label")
  list_ui.add_argument("--query")
  list_ui.set_defaults(func=cmd_list_ui)

  tap = sub.add_parser("tap", help="tap and log before/after timestamps")
  tap.add_argument("session")
  tap.add_argument("x", type=int)
  tap.add_argument("y", type=int)
  tap.add_argument("--label")
  tap.add_argument("--wait", type=float, default=2.0)
  tap.set_defaults(func=cmd_tap)

  swipe = sub.add_parser("swipe", help="swipe and log before/after timestamps")
  swipe.add_argument("session")
  swipe.add_argument("x1", type=int)
  swipe.add_argument("y1", type=int)
  swipe.add_argument("x2", type=int)
  swipe.add_argument("y2", type=int)
  swipe.add_argument("--duration-ms", type=int, default=350)
  swipe.add_argument("--label")
  swipe.add_argument("--wait", type=float, default=2.0)
  swipe.set_defaults(func=cmd_swipe)

  bugreport = sub.add_parser("bugreport", help="collect an Android bugreport")
  bugreport.add_argument("session")
  bugreport.set_defaults(func=cmd_bugreport)

  extract = sub.add_parser("extract-btsnoop", help="extract btsnoop-like files from a bugreport zip")
  extract.add_argument("bugreport")
  extract.add_argument("--output")
  extract.set_defaults(func=cmd_extract_btsnoop)

  return parser


def main():
  args = build_parser().parse_args()
  args.func(args)


if __name__ == "__main__":
  main()
