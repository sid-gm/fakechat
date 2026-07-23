#!/usr/bin/env python3
"""
Generate a self-contained HTML labeling tool from the TwitchChat dataset.

Scans the dataset, extracts unique short messages ranked by frequency (so the
highest-impact ambient candidates come first), and bakes them into a single
HTML file. Open it in Chrome (double-click) and label:
    Enter        -> generic (keep for ambient filler)
    ArrowRight   -> skip (not generic / topic-specific)
    ArrowLeft    -> undo last
Progress auto-saves to localStorage; "Export" downloads labels.json.
"""
import os, sys, csv, json, re, collections, random

DATA = sys.argv[1] if len(sys.argv) > 1 else "/Users/sid/Downloads/twitch_chat/data_set/data"
SCAN_FILES = int(sys.argv[2]) if len(sys.argv) > 2 else 900   # sample for speed; top items are stable
N_CANDIDATES = int(sys.argv[3]) if len(sys.argv) > 3 else 2500
OUT_HTML = os.path.join(os.path.dirname(__file__), "label.html")

MAX_WORDS, MAX_CHARS = 6, 45
BAD = re.compile(r"(@|https?://|www\.|\.(com|tv|gg)\b)")
csv.field_size_limit(10_000_000)

def norm(m): return re.sub(r"\s+", " ", m.strip().lower())

count = collections.Counter()
docs = collections.defaultdict(set)

files = [f for f in os.listdir(DATA) if f.endswith(".csv")]
random.seed(7)
if SCAN_FILES < len(files):
    files = random.sample(files, SCAN_FILES)
print(f"scanning {len(files)} files ...")
for i, fn in enumerate(files):
    sid = fn.split("_")[0]
    seen = set()
    try:
        with open(os.path.join(DATA, fn), encoding="utf-8", errors="ignore") as fh:
            for row in csv.DictReader(fh):
                m = norm(row.get("Message") or "")
                if not m: continue
                ws = m.split()
                if len(ws) > MAX_WORDS or len(m) > MAX_CHARS or BAD.search(m):
                    continue
                count[m] += 1
                seen.add(m)
    except Exception as e:
        print("skip", fn, e)
    for m in seen: docs[m].add(sid)
    if (i+1) % 300 == 0: print(f"  {i+1}/{len(files)}")

ranked = sorted(count.items(), key=lambda kv: kv[1], reverse=True)[:N_CANDIDATES]
candidates = [{"t": m, "n": n, "df": len(docs[m])} for m, n in ranked]
print(f"prepared {len(candidates)} candidates (top freq {candidates[0]['n']}, lowest {candidates[-1]['n']})")

payload = json.dumps(candidates, ensure_ascii=False).replace("</", "<\\/")

HTML = """<!doctype html><html lang=en><head><meta charset=utf-8>
<meta name=viewport content="width=device-width,initial-scale=1">
<title>TwitchChat labeler — generic?</title>
<style>
*{box-sizing:border-box}
body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#0b0b12;color:#eee;font-family:system-ui,-apple-system,sans-serif}
#bar{position:fixed;top:0;left:0;height:4px;background:#38d9a9;transition:width .1s}
#meta{position:fixed;top:16px;width:100%;text-align:center;color:#7a7a8c;font-size:13px}
#card{max-width:720px;padding:0 24px;text-align:center}
#msg{font-size:44px;font-weight:700;line-height:1.2;word-break:break-word;min-height:120px;
  display:flex;align-items:center;justify-content:center}
#sub{margin-top:8px;color:#5a5a6a;font-size:14px}
#keys{position:fixed;bottom:28px;display:flex;gap:28px;color:#9a9aac;font-size:15px}
kbd{background:#1e1e2a;border:1px solid #333;border-bottom-width:2px;border-radius:6px;padding:3px 9px;
  font-family:ui-monospace,monospace;color:#fff;margin-right:6px}
#done{display:none;text-align:center}
button{background:#38d9a9;color:#04120d;border:0;border-radius:8px;padding:10px 18px;font-weight:700;
  font-size:15px;cursor:pointer;margin:6px}
.flash{position:fixed;inset:0;opacity:0;pointer-events:none;transition:opacity .18s}
.g{background:radial-gradient(circle,#38d9a955,transparent 70%)}
.s{background:radial-gradient(circle,#ff6b6b40,transparent 70%)}
</style></head><body>
<div id=bar></div>
<div id=meta></div>
<div id=card>
  <div id=live>
    <div id=msg></div>
    <div id=sub></div>
  </div>
  <div id=done>
    <h2>All labeled 🎉</h2>
    <p id=summary></p>
    <button onclick=exportLabels()>⤓ Export labels.json</button>
  </div>
</div>
<div id=keys>
  <span><kbd>Enter</kbd>generic ✓</span>
  <span><kbd>→</kbd>skip</span>
  <span><kbd>←</kbd>undo</span>
  <span><kbd>E</kbd>export</span>
</div>
<div class="flash g" id=fg></div><div class="flash s" id=fs></div>
<script>
const CANDIDATES = __PAYLOAD__;
const KEY='twitch_labels_v1';
let store = JSON.parse(localStorage.getItem(KEY) || '{}'); // {text: 1|0}
let i = 0;
while (i < CANDIDATES.length && store[CANDIDATES[i].t] !== undefined) i++;
const msg=document.getElementById('msg'), sub=document.getElementById('sub'),
      bar=document.getElementById('bar'), meta=document.getElementById('meta');
function counts(){let g=0,s=0;for(const k in store){store[k]?g++:s++;}return {g,s,done:g+s};}
function save(){localStorage.setItem(KEY, JSON.stringify(store));}
function flash(id){const el=document.getElementById(id);el.style.opacity=.9;setTimeout(()=>el.style.opacity=0,120);}
function render(){
  const c=counts();
  bar.style.width=(c.done/CANDIDATES.length*100)+'%';
  meta.textContent=`${c.done} / ${CANDIDATES.length}  ·  ${c.g} generic  ·  ${c.s} skipped`;
  if(i>=CANDIDATES.length){document.getElementById('live').style.display='none';
    document.getElementById('done').style.display='block';
    document.getElementById('summary').textContent=`${c.g} generic messages labeled.`;return;}
  const item=CANDIDATES[i];
  msg.textContent=item.t;
  sub.textContent=`seen ${item.n.toLocaleString()}×  ·  ${item.df} streams`;
}
function label(v){ if(i>=CANDIDATES.length)return; store[CANDIDATES[i].t]=v; save(); flash(v?'fg':'fs'); i++; render(); }
function undo(){ if(i<=0)return; i--; delete store[CANDIDATES[i].t]; save(); render(); }
function exportLabels(){
  const generic=[], notGeneric=[];
  for(const c of CANDIDATES){ if(store[c.t]===1)generic.push(c); else if(store[c.t]===0)notGeneric.push(c); }
  const blob=new Blob([JSON.stringify({generic,notGeneric},null,0)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='labels.json';a.click();
}
addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();label(1);}
  else if(e.key==='ArrowRight'){e.preventDefault();label(0);}
  else if(e.key==='ArrowLeft'){e.preventDefault();undo();}
  else if(e.key==='e'||e.key==='E'){exportLabels();}
});
render();
</script></body></html>"""

open(OUT_HTML, "w", encoding="utf-8").write(HTML.replace("__PAYLOAD__", payload))
print(f"\nwrote {OUT_HTML}")
print("open it: open " + OUT_HTML)
