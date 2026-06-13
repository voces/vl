#!/usr/bin/env python3
# Differential harness: for each .vl file given, run the TS oracle
# (compiler/format.ts via deno) and the VL port (compiler/format.vl assembled by
# build-format.sh + vl run), and report byte-identity. The VL run cannot read
# files, so the file's source is embedded as an escaped VL string literal in a
# generated driver tail.
#
#   format-diff.py FILE [FILE ...]
#
# Env: VL (vl binary), SEED (vl-compiler.wasm), DENO (deno binary).
import os, sys, subprocess, tempfile, json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VL   = os.environ.get("VL", os.path.join(ROOT, "scripts/vl-host/target/release/vl"))
SEED = os.environ.get("SEED", os.path.join(ROOT, "build/vl-compiler.wasm"))
DENO = os.environ.get("DENO", "deno")
TS_DRIVER = os.path.join(tempfile.gettempdir(), "ts-fmt-driver.ts")

with open(TS_DRIVER, "w") as f:
    f.write(
        'import { format } from "%s/compiler/format.ts";\n'
        "const src = await Deno.readTextFile(Deno.args[0]);\n"
        "await Deno.stdout.write(new TextEncoder().encode(format(src)));\n" % ROOT
    )

def vl_escape(s: str) -> str:
    out = []
    for ch in s:
        if ch == "\\": out.append("\\\\")
        elif ch == '"': out.append('\\"')
        elif ch == "\n": out.append("\\n")
        elif ch == "\t": out.append("\\t")
        elif ch == "\r": out.append("\\r")
        else: out.append(ch)
    return "".join(out)

def ts_format(path: str):
    r = subprocess.run([DENO, "run", "-A", "--no-check", TS_DRIVER, path],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None, r.stderr
    return r.stdout, None

def vl_format(path: str):
    src = open(path).read()
    driver = 'print(format("%s"))\n' % vl_escape(src)
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False) as df:
        df.write(driver); drv = df.name
    asm = subprocess.run(["bash", os.path.join(ROOT, "scripts/build-format.sh"), drv],
                         capture_output=True, text=True)
    if asm.returncode != 0:
        return None, "assembly: " + asm.stderr
    with tempfile.NamedTemporaryFile("w", suffix=".vl", delete=False) as pf:
        pf.write(asm.stdout); prog = pf.name
    r = subprocess.run([VL, "run", prog, "--compiler", SEED],
                       capture_output=True, text=True)
    if r.returncode != 0:
        return None, "run: " + (r.stderr or r.stdout)
    # `print` appends a trailing newline; format() output already ends in "\n"
    # (or is ""), so print yields out + "\n". Strip exactly one trailing newline
    # that print added.
    out = r.stdout
    if out.endswith("\n"):
        out = out[:-1]
    return out, None

def main():
    files = sys.argv[1:]
    npass = nfail = nerr = 0
    fails = []
    for path in files:
        ts, tserr = ts_format(path)
        if ts is None:
            nerr += 1; fails.append((path, "TS-ERR", tserr)); continue
        vl, vlerr = vl_format(path)
        if vl is None:
            nfail += 1; fails.append((path, "VL-ERR", vlerr)); continue
        if vl == ts:
            npass += 1
        else:
            nfail += 1
            fails.append((path, "DIFF", None))
    print("PASS=%d FAIL=%d TS_ERR=%d / %d" % (npass, nfail, nerr, len(files)))
    for p, kind, msg in fails[:40]:
        print("  %-7s %s" % (kind, p))
        if msg and kind == "VL-ERR":
            print("         " + msg.strip().splitlines()[-1][:160])
    return fails

if __name__ == "__main__":
    main()
