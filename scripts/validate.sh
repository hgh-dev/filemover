#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

node --check backend.js
node --check script.js
node --check service-worker.js

python3 - <<'PY'
import json
import struct
from html.parser import HTMLParser
from pathlib import Path


class StrictHTMLParser(HTMLParser):
    pass


root = Path.cwd()

manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
required_manifest_keys = {
    "name",
    "short_name",
    "start_url",
    "display",
    "background_color",
    "theme_color",
    "icons",
}
missing = required_manifest_keys.difference(manifest)
if missing:
    raise SystemExit(f"manifest.json is missing keys: {', '.join(sorted(missing))}")

StrictHTMLParser().feed((root / "index.html").read_text(encoding="utf-8"))

expected_icons = {
    "icon-192.png": (192, 192),
    "icon-512.png": (512, 512),
}
for filename, expected_size in expected_icons.items():
    data = (root / filename).read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n" or data[12:16] != b"IHDR":
        raise SystemExit(f"{filename} is not a valid PNG")
    actual_size = struct.unpack(">II", data[16:24])
    if actual_size != expected_size:
        raise SystemExit(
            f"{filename} must be {expected_size[0]}x{expected_size[1]}, "
            f"got {actual_size[0]}x{actual_size[1]}"
        )

declared_icons = {
    icon.get("src"): icon.get("sizes")
    for icon in manifest["icons"]
    if isinstance(icon, dict)
}
for filename, (width, height) in expected_icons.items():
    expected_declaration = f"{width}x{height}"
    if declared_icons.get(filename) != expected_declaration:
        raise SystemExit(
            f"manifest.json must declare {filename} as {expected_declaration}"
        )

print("File Mover validation passed")
PY
