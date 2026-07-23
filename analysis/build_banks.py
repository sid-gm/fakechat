#!/usr/bin/env python3
"""
Build the ambient chat banks from the TwitchChat dataset (Ringer et al.).

Key idea: a message that appears across MANY different streams is generic
("lol", "gg", "KEKW", "?"), while one that appears in a single stream is
topic/event-specific. We use cross-stream document frequency (df) as a
label-free "genericness" score to extract universal filler for the ambient
(no-LLM) layer, plus an emote/slang frequency table.

Outputs (compact JSON shipped with the app):
  lib/chatbank/filler.json  - [{t, n, df, w}]  generic messages
  lib/chatbank/emotes.json  - [{t, n, df}]     single-token emote/reactions
  lib/chatbank/stats.json   - corpus baseline distribution (for evaluation)
"""
import os, sys, csv, json, re, collections

DATA = sys.argv[1] if len(sys.argv) > 1 else "/Users/sid/Downloads/twitch_chat/data_set/data"
OUT = os.path.join(os.path.dirname(__file__), "..", "lib", "chatbank")
os.makedirs(OUT, exist_ok=True)

MAX_WORDS = 6            # ambient lines stay short (matches data: median 2 words)
MIN_DF_FILLER = 8        # must appear in >= this many distinct streams to count as generic
MIN_DF_EMOTE = 15
TOP_FILLER = 4000
TOP_EMOTES = 250

# reject anything that looks stream/user/topic specific
BAD = re.compile(r"(@|https?://|www\.|\.(com|tv|gg)\b|#\d)")
csv.field_size_limit(10_000_000)

def norm(m: str) -> str:
    return re.sub(r"\s+", " ", m.strip().lower())

count = collections.Counter()          # message -> total occurrences
docs = collections.defaultdict(set)    # message -> set of stream ids
# corpus stats
n_msgs = 0
len_words = collections.Counter()
token_freq = collections.Counter()

files = [f for f in os.listdir(DATA) if f.endswith(".csv")]
print(f"scanning {len(files)} files ...")
for idx, fn in enumerate(files):
    stream_id = fn.split("_")[0]       # streamer hash is stable across their docs
    seen_here = set()
    path = os.path.join(DATA, fn)
    try:
        with open(path, encoding="utf-8", errors="ignore") as fh:
            for row in csv.DictReader(fh):
                m = row.get("Message") or ""
                m = norm(m)
                if not m:
                    continue
                n_msgs += 1
                ws = m.split()
                len_words[min(len(ws), 20)] += 1
                for w in ws:
                    token_freq[w] += 1
                if len(ws) > MAX_WORDS or len(m) > 45 or BAD.search(m):
                    continue
                count[m] += 1
                seen_here.add(m)
        for m in seen_here:
            docs[m].add(stream_id)
    except Exception as e:
        print("skip", fn, e)
    if (idx + 1) % 500 == 0:
        print(f"  {idx+1}/{len(files)}  uniq_candidates={len(count):,}")

print(f"messages: {n_msgs:,}   unique filler candidates: {len(count):,}")

# assemble ranked banks using df as the genericness gate
rows = []
for m, n in count.items():
    df = len(docs[m])
    if df < MIN_DF_FILLER:
        continue
    rows.append((m, n, df, len(m.split())))
rows.sort(key=lambda r: r[1], reverse=True)

filler = [{"t": t, "n": n, "df": df, "w": w} for (t, n, df, w) in rows][:TOP_FILLER]
emotes = [{"t": t, "n": n, "df": df} for (t, n, df, w) in rows if w == 1 and df >= MIN_DF_EMOTE][:TOP_EMOTES]

stats = {
    "messages_scanned": n_msgs,
    "streams": len(set(f.split("_")[0] for f in files)),
    "documents": len(files),
    "pct_1word": round(len_words[1] / n_msgs * 100, 1),
    "pct_le3words": round(sum(len_words[i] for i in range(1, 4)) / n_msgs * 100, 1),
    "word_len_hist": {str(k): len_words[k] for k in sorted(len_words)},
    "top_tokens": token_freq.most_common(60),
    "filler_bank_size": len(filler),
    "emote_bank_size": len(emotes),
}

json.dump(filler, open(os.path.join(OUT, "filler.json"), "w"), ensure_ascii=False)
json.dump(emotes, open(os.path.join(OUT, "emotes.json"), "w"), ensure_ascii=False)
json.dump(stats, open(os.path.join(OUT, "stats.json"), "w"), ensure_ascii=False, indent=2)

print(f"\nwrote {len(filler)} filler, {len(emotes)} emotes to {os.path.abspath(OUT)}")
print("emote bank (top 30):", ", ".join(e["t"] for e in emotes[:30]))
print("filler sample (rank 30-60):", " | ".join(r["t"] for r in filler[30:60]))
