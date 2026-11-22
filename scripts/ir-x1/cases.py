# usage: cases.py <compiler.wasm> <out.json> [rootdir]
import sys, os, re, json, subprocess, tempfile, shutil, collections
from concurrent.futures import ThreadPoolExecutor
comp, outp = sys.argv[1], sys.argv[2]
root = sys.argv[3] if len(sys.argv) > 3 else "tests/cases"
VL = "/home/user/vl/scripts/vl-host/target/release/vl"
cases = []
for d, _, fs in os.walk(root):
    for f in fs:
        if not f.endswith(".vl"): continue
        p = os.path.join(d, f)
        s = open(p, errors="replace").read()
        logs = re.findall(r"^\s*//\s*@log (.*)$", s, re.M)
        logs += [""] * 0
        has_run = re.search(r"^\s*//\s*@run\b", s, re.M) is not None
        has_log = re.search(r"^\s*//\s*@log\b", s, re.M) is not None
        trap = re.search(r"^\s*//\s*@trap\b", s, re.M) is not None
        if re.search(r"^\s*//\s*@(error|no-instantiate)\b", s, re.M): continue
        if has_run or has_log or trap:
            # @log with empty payload
            logs = [m for m in re.findall(r"^\s*//\s*@log(?: (.*))?$", s, re.M)]
            cases.append((p, logs, trap))
cases.sort()
mult = collections.Counter(os.path.basename(p) for p, _, _ in cases)
n = max(mult.values())
waves = [[] for _ in range(n)]; taken = [set() for _ in range(n)]
for c in cases:
    b = os.path.basename(c[0])
    best = min((i for i in range(n) if b not in taken[i]), key=lambda i: len(waves[i]))
    waves[best].append(c); taken[best].add(b)
# split big waves into chunks of 150
chunks = []
for w in waves:
    for i in range(0, len(w), 150): chunks.append(w[i:i+150])
res = {}
def run(ch):
    d = tempfile.mkdtemp(prefix="x1-", dir=os.environ.get("TMPDIR", "/tmp"))
    try:
        env = dict(os.environ, RUST_BACKTRACE="0", VL_STD="/home/user/vl/std")
        r = subprocess.run([VL, "run", "--batch", "--out-dir", d] + [c[0] for c in ch] + ["--compiler", comp],
                           capture_output=True, text=True, env=env, timeout=1800)
        out = {}
        for p, logs, trap in ch:
            b = os.path.basename(p)
            try: o = open(f"{d}/{b}.out", errors="replace").read()
            except FileNotFoundError: o = None
            try: e = open(f"{d}/{b}.err", errors="replace").read()
            except FileNotFoundError: e = None
            out[p] = (o, e, logs, trap, r.returncode, r.stderr[-500:] if o is None else "")
        return out
    finally:
        shutil.rmtree(d, ignore_errors=True)
with ThreadPoolExecutor(int(os.environ.get("J", "4"))) as ex:
    for o in ex.map(run, chunks): res.update(o)
def classify(o, e, logs, trap):
    if o is None: return ("batch-abort", "")
    if e:
        if "IR-only miss" in e:
            m = re.search(r"IR-only miss \[(.*?)\] in (function \S+|the start body)", e)
            return ("b-irmiss", m.group(1) if m else e[:200])
        if "wasm trap" in e:
            return ("a-pass", "") if trap else ("d-trap", e.strip()[:300])
        if re.search(r"invalid|validat|type mismatch", e, re.I): return ("d-invalid", e.strip()[:300])
        return ("compile-error", e.strip()[:300])
    if trap: return ("c-notrap", "")
    got = o.split("\n")
    if got and got[-1] == "": got = got[:-1]
    return ("a-pass", "") if got == logs else ("c-wrong", "")
summary = {p: classify(*v[:4]) for p, v in res.items()}
json.dump(summary, open(outp, "w"), indent=0)
c = collections.Counter(k for k, _ in summary.values())
print(len(cases), dict(c))
