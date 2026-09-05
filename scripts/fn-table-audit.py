#!/usr/bin/env python3
"""Audit a module's function table against the functions it names.

The emitter fills the `funcref` table only at the entries whose function was used as a VALUE
(`emitClosureValueCore` is the one site that mints a closure id), so a function called only by
name must be absent from every element segment. That absence is the whole point of the narrowed
segment, and no test that reads `WebAssembly.Module` metadata can see it: element segments are
not reflected. This reads the bytes.

    scripts/fn-table-audit.py <module.wasm> [--names] [--expect-absent NAME ...]

Without a name section (the default emit), a function is identified by its index. Pass
`--names` when the module was built with `--emit-names` so the report can print them, and
`--expect-absent` to fail when a named function IS in a segment.
"""
import sys


def uleb(b, i):
    r = 0
    s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7f) << s
        s += 7
        if not x & 0x80:
            return r, i


def sleb(b, i):
    r = 0
    s = 0
    while True:
        x = b[i]
        i += 1
        r |= (x & 0x7f) << s
        s += 7
        if not x & 0x80:
            if s < 32 and x & 0x40:
                r -= 1 << s
            return r, i


def sections(b):
    i = 8
    while i < len(b):
        sid = b[i]
        i += 1
        n, i = uleb(b, i)
        yield sid, b[i:i + n]
        i += n


def func_names(body):
    """The `name` custom section's function-name subsection (id 1), as {index: name}."""
    out = {}
    n, i = uleb(body, 0)
    if body[1:1 + n] != b"name":
        return out
    i = 1 + n
    while i < len(body):
        sub = body[i]
        i += 1
        sz, i = uleb(body, i)
        if sub == 1:
            j = i
            cnt, j = uleb(body, j)
            for _ in range(cnt):
                idx, j = uleb(body, j)
                ln, j = uleb(body, j)
                out[idx] = body[j:j + ln].decode("utf-8", "replace")
                j += ln
        i += sz
    return out


def elem_entries(body):
    """Every function index any element segment writes, with the table slot it writes it to."""
    out = []
    cnt, j = uleb(body, 0)
    for _ in range(cnt):
        flags = body[j]
        j += 1
        if flags != 0:
            raise SystemExit("fn-table-audit: element segment flags %d not handled" % flags)
        if body[j] != 0x41:
            raise SystemExit("fn-table-audit: element offset is not an i32.const")
        j += 1
        off, j = sleb(body, j)
        if body[j] != 0x0b:
            raise SystemExit("fn-table-audit: element offset expr is not terminated")
        j += 1
        n, j = uleb(body, j)
        for k in range(n):
            v, j = uleb(body, j)
            out.append((off + k, v))
    return out


def main(argv):
    if not argv or argv[0] in ("-h", "--help"):
        print(__doc__)
        return 2
    path = argv[0]
    absent = []
    a = 1
    while a < len(argv):
        if argv[a] == "--expect-absent":
            a += 1
            while a < len(argv) and not argv[a].startswith("--"):
                absent.append(argv[a])
                a += 1
        elif argv[a] == "--names":
            a += 1
        else:
            raise SystemExit("fn-table-audit: unknown argument %r" % argv[a])
    b = open(path, "rb").read()
    nfuncs = 0
    nimports = 0
    tablemin = None
    entries = []
    names = {}
    for sid, body in sections(b):
        if sid == 2:
            nimports, _ = uleb(body, 0)
        elif sid == 3:
            nfuncs, _ = uleb(body, 0)
        elif sid == 4:
            _, j = uleb(body, 0)
            j += 1                      # elemtype
            j += 1                      # limits flag
            tablemin, j = uleb(body, j)
        elif sid == 9:
            entries = elem_entries(body)
        elif sid == 0:
            names.update(func_names(body))
    filled = sorted(set(v for _, v in entries))
    print("%s: %d functions, %d imports, table min %s, %d table entries filled"
          % (path, nfuncs, nimports, tablemin, len(filled)))
    for slot, fn in entries:
        print("  slot %-6d -> func %-6d %s" % (slot, fn, names.get(fn, "")))
    if not names and absent:
        raise SystemExit("fn-table-audit: --expect-absent needs a module built with --emit-names")
    bad = [nm for nm in absent if any(names.get(fn) == nm for fn in filled)]
    for nm in bad:
        print("FAIL: %r is in an element segment but was expected absent" % nm)
    for slot, fn in entries:
        if fn < nimports:
            print("FAIL: slot %d holds import %d, which no closure id can name" % (slot, fn))
            bad.append(fn)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
