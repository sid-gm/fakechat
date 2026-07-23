#!/usr/bin/env python3
"""Turn the hand-labeled labels.json into the app's ambient generic bank."""
import json, os, sys

LABELS = sys.argv[1] if len(sys.argv) > 1 else "/Users/sid/Downloads/labels.json"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "chatbank")
os.makedirs(OUT, exist_ok=True)

d = json.load(open(LABELS))
generic = d.get("generic", [])
# keep text + freq; drop df. sort by freq desc for readability.
bank = [{"t": x["t"], "n": int(x.get("n", 1))} for x in generic if x.get("t")]
bank.sort(key=lambda r: r["n"], reverse=True)

path = os.path.join(OUT, "generic.json")
json.dump(bank, open(path, "w"), ensure_ascii=False)
print(f"wrote {len(bank)} generic lines -> {os.path.abspath(path)}")
