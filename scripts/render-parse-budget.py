#!/usr/bin/env python3
"""The render→parse ratchet — the emitter asking a type question through a string.

The emitter should decide a node's rep from its checked TYPE. Where it instead
renders the type (`tyToEmitName`) and hands the spelling to a parser written for
annotation spellings, the parser answers for the spelling, not the type: a second
producer by construction (docs/ARCHITECTURE.md §4.1; code-quality-2026-10.md L2).
This ratchet holds the two halves of that shape per emitter file, and either may
only FALL:

  ty-render        a `tyToEmitName(` call
  ty-string-parse  a call to one of the ten type-string parsers in PARSERS

SCOPE. The emitter — `compiler/emit_*.vl` and `compiler/wasmEmit.vl` — minus the
bodies of the renderers and the parsers themselves, whose calls to each other are
how they are written. The checker and `tyname.vl` are the annotation path and the
renderers' home, and are not scanned. An emitter-side parse of a real ANNOTATION
spelling is counted too: nothing in the call separates it from a parse of a render,
so the baseline holds it, and `--list [code]` shows each hit's function to read
(`--root DIR` lists another tree, which is how the test grades its controls).

Counted on comment-stripped source with string CONTENT blanked
(scripts/sentinel-census.py's `strip_line`), so a name in a message is not a call.
Baseline schema and `--check`/`--write-baseline`/`--why` are scripts/ratchet.py.
"""

import importlib.util
import os
import re
import sys

import ratchet

BASELINE = os.path.join(ratchet.ROOT, "scripts", "render-parse-budget-baseline.json")
RENDER = "ty-render"
PARSE = "ty-string-parse"
CODES = (RENDER, PARSE)

# The destringify program's parser list as the emitter survey re-derived it
# (code-quality-survey-2026-09/emitter.md §6.4): the ten with the most call sites.
PARSERS = (
    "nameIsArray", "nullablePartOf", "nameIsLitUnionType", "splitUnionAtoms",
    "annArrowAt", "nameIsRefArray", "unionMemberCount", "mapValNameOf",
    "refArrElemName", "isTopLevelFuncTypeName",
)
CALL = re.compile(r"(?<![A-Za-z0-9_.])(tyToEmitName|" + "|".join(PARSERS) + r")\s*\(")

_CENSUS = None


def census():
    """scripts/sentinel-census.py by path, for its `strip_line` and `functions`: one
    stripper and one function-extent walk for every per-function ratchet."""
    global _CENSUS
    if _CENSUS is None:
        path = os.path.join(ratchet.ROOT, "scripts", "sentinel-census.py")
        spec = importlib.util.spec_from_file_location("sentinel_census", path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _CENSUS = mod
    return _CENSUS


def emitter_files(root):
    d = os.path.join(root, "compiler")
    for name in sorted(os.listdir(d)):
        if name.endswith(".vl") and (name.startswith("emit_") or name == "wasmEmit.vl"):
            yield f"compiler/{name}", os.path.join(d, name)


def exempt(fn):
    """A renderer's or a parser's own body."""
    return fn.startswith("tyToEmitName") or fn in PARSERS


def hits(root):
    """`(rel, line, function, code, callee)` for every counted call under `root`."""
    sc = census()
    out = []
    for rel, path in emitter_files(root):
        lines = ratchet.read_source(path).split("\n")
        owner = [""] * len(lines)
        for name, lo, hi in sc.functions(lines):
            for n in range(lo, hi + 1):
                owner[n] = name
        for n, raw in enumerate(lines):
            if "(" not in raw:
                continue
            text = sc.strip_line(raw)
            for m in CALL.finditer(text):
                callee = m.group(1)
                if text[:m.start()].rstrip().endswith("function"):
                    continue
                fn = owner[n]
                if exempt(fn):
                    continue
                code = RENDER if callee == "tyToEmitName" else PARSE
                out.append((rel, n + 1, fn, code, callee))
    return out


def current(root=ratchet.ROOT):
    out = {}
    for rel, _line, _fn, code, _callee in hits(root):
        v = out.setdefault(rel, {c: 0 for c in CODES})
        v[code] += 1
    return out


def named(root):
    """{code: {`file:function`: hits}} — the entries `--why` compares."""
    out = {c: {} for c in CODES}
    for rel, _line, fn, code, _callee in hits(root):
        k = f"{rel}:{fn or '<top level>'}"
        out[code][k] = out[code].get(k, 0) + 1
    return out


R = ratchet.Ratchet(
    script="render-parse-budget.py",
    label="render-parse",
    baseline=BASELINE,
    codes=CODES,
    ok_line=lambda t: f"render-parse budget ok — {t[RENDER]} tyToEmitName calls, "
                      f"{t[PARSE]} type-string parses in the emitter (baseline or below)",
    remedy="The emitter answers a type question from the TYPE: use the type-taking twin\n"
           "(`valueAtomKindOfTy`, `mvValKindOfTy`, an `*OfTy` / `*Ty` reader) rather than\n"
           "rendering with `tyToEmitName` and parsing the spelling back. Rendering is for\n"
           "output — module names, diagnostics, printable keys (docs/ARCHITECTURE.md §4.1).\n"
           "After a conversion, lower the baseline with",
    wrote_line=lambda t: f"{t[RENDER]} tyToEmitName calls, {t[PARSE]} type-string parses",
    extras=lambda: (("commit", ratchet.head_commit()),),
    named=named,
)


def cmd_list(root, code):
    for rel, line, fn, c, callee in hits(root):
        if code and c != code:
            continue
        print(f"{rel}:{line}  {fn}  {callee}")
    return 0


def main():
    args = sys.argv[1:]
    if "--why" in args:
        return R.why(ratchet.flag_value(args, "--why"))
    if "--list" in args:
        root = ratchet.flag_value(args, "--root") if "--root" in args else ratchet.ROOT
        code = ratchet.flag_value(args, "--list")
        return cmd_list(root, "" if code.startswith("--") else code)
    cur = current()
    if "--write-baseline" in args:
        return R.write_baseline(cur)
    if "--check" in args:
        return R.check(cur)
    tot = R.totals(cur)
    print(f"{'file':<32}{RENDER:>12}{PARSE:>18}")
    for rel, v in sorted(cur.items(), key=lambda kv: -(kv[1][RENDER] + kv[1][PARSE])):
        print(f"{rel:<32}{v[RENDER]:>12}{v[PARSE]:>18}")
    print(f"{'TOTAL':<32}{tot[RENDER]:>12}{tot[PARSE]:>18}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
