#!/usr/bin/env python3
"""Rewrite labels to the `@` spelling: `B: { … }` → `@B { … }`, `L: while` → `@L while`,
`L: for` → `@L for`, `break :B` → `break @B`, `continue :L` → `continue @L`.

Labels are one token, `@name`, at the declaration and at the jump since the 2026-09-30 ruling
(DECISIONS.md, "A label is `@name`"), and `{ name: … }` is always an object literal. This
rewrites every `break :X` / `continue :X`, and every `X: while`, `X: for` and `X: {` the old
parser read as a label. That is decided per brace, outermost first: a `{` after a token that
starts a value or a type (`=`, `(`, `[`, `,`, `:`, `return`, `?`, …) opened an object or a type,
so a field there is never a label, `{ f: while … }` included; any other brace is a body, a
block unless it opens like an object (`{ name: …`, `{ name, …`, `{ name }`, `{}`, a map type
`{[K]: V}`, where `name: {` counts as a label when its own braces hold statements, a jump names
it, or a statement follows its `}` on a later line). In a block, `X:` where a statement starts
is a label; anywhere, one in value position (after `=`, `=>`, `return`, `break`, or in a
string's interpolation hole) is too, and `break X: { … }` becomes `break (@X { … })`. Comments
and string literals are never touched.

Usage: label-at.py [--check] PATH...   (a directory is walked for *.vl files)
Exit status: 0 when nothing needed rewriting (or --check found nothing), 1 otherwise.
"""
import os
import re
import sys

IDENT = re.compile(r"[A-Za-z_][A-Za-z0-9_]*")
# Tokens after which `X: {` is a value, which the old parser always read as a label.
VALUE_BEFORE = {"=", "=>", "return", "break", "\\{"}
# The words that open a statement, so `{ return }` is a block and not a shorthand object.
KEYWORDS = {"let", "const", "return", "if", "while", "for", "break", "continue", "type",
            "function", "match"}
# Tokens a line break does not end a statement after: a field or argument continues.
OPEN_BEFORE = {",", "{", "(", "[", "=", ":", "=>"}
# Tokens after which a `{` opens a type or an object literal, never a block of statements.
VALUE_BRACE_AFTER = {":", "=", "|", "&", "<", ",", "(", "[", "return", "?"}


def scan_quoted(src, i, q):
    """From just past an opening quote `q`: (index past the literal, True) at its close, or
    (index past a `\\{`, False) at an interpolation hole, whose code the caller then scans."""
    n = len(src)
    while i < n:
        c = src[i]
        if c == "\\":
            if src.startswith("\\{", i):
                return i + 2, False
            i += 2
        elif c == q:
            return i + 1, True
        else:
            i += 1
    return n, True


def tokens(src):
    """Yield (kind, text, start) over the code of `src`: 'id', 'nl' or a punctuation string.

    String and char literals and comments are skipped, so a label-shaped run inside one is never
    seen; the code in a string's `\\{…}` hole is scanned as code. `=>` is kept whole; every other
    punctuation character is its own token.
    """
    i = 0
    n = len(src)
    depth = 0
    holes = []  # (brace depth the hole opened at, its string's quote)
    while i < n:
        c = src[i]
        if c == "}" and holes and holes[-1][0] == depth:
            _, q = holes.pop()
            i, closed = scan_quoted(src, i + 1, q)
            if not closed:
                holes.append((depth, q))
                yield ("p", "\\{", i - 2)
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
        if c == "\n":
            yield ("nl", "\n", i)
            i += 1
        elif c in " \t\r":
            i += 1
        elif src.startswith("//", i):
            j = src.find("\n", i)
            i = n if j < 0 else j
        elif src.startswith("/*", i):
            j = src.find("*/", i + 2)
            i = n if j < 0 else j + 2
        elif c == '"' or c == "'":
            yield ("s", c, i)
            i, closed = scan_quoted(src, i + 1, c)
            if not closed:
                holes.append((depth, c))
                yield ("p", "\\{", i - 2)
        elif c.isalpha() or c == "_":
            m = IDENT.match(src, i)
            yield ("id", m.group(0), i)
            i = m.end()
        elif src.startswith("=>", i):
            yield ("p", "=>", i)
            i += 2
        else:
            yield ("p", c, i)
            i += 1


def rewrite(src):
    """Return (new source, number of edits)."""
    sys.setrecursionlimit(max(sys.getrecursionlimit(), 20000))
    toks = list(tokens(src))
    n = len(toks)
    # Matching brace for every `{`.
    match = {}
    encl = [-1] * n  # the innermost `{` open around each token, -1 at the top level
    stack = []
    for k, (kind, text, _) in enumerate(toks):
        encl[k] = stack[-1] if stack else -1
        if kind == "p" and text == "{":
            stack.append(k)
        elif kind == "p" and text == "}" and stack:
            match[stack.pop()] = k

    memo = {}

    def jumped_inside(k):
        """Whether a `break :X` / `continue :X` naming `X` (token `k`, in `X: {`) is inside."""
        close = match.get(k + 2, k + 2)
        return any(k + 2 < q < close for q in jumps.get(toks[k][1], []))

    def opens_like_object(b):
        """Whether the braces opening at token `b` begin like an object literal or a type:
        `{}`, `{ name: …` (unless that is a label: `name: while`, `name: for`, or `name: {` over
        statements), `{ name, …`, `{ name }`, `{ name?: …`, `{ readonly name …`, a method
        `{ name(…) {`, `{ "key": …`, `{ ...spread`, or a map type `{[K]: V}`."""
        if b in memo:
            return memo[b]
        j = b + 1
        while j < n and toks[j][0] == "nl":
            j += 1
        memo[b] = ans = opens_like_object_at(j)
        return ans

    def opens_like_object_at(j):
        if j >= n:
            return False
        first = toks[j]
        if first[1] in ("}", "[", '"', "."):
            return True
        if first[0] != "id" or j + 1 >= n:
            return False
        nk = toks[j + 1][1]
        if nk == ":":
            t2 = toks[j + 2] if j + 2 < n else ("", "", 0)
            if t2[0] == "id" and t2[1] in ("while", "for"):
                return False  # a labelled loop opens the braces
            if t2[1] == "{" and (jumped_inside(j) or not opens_like_object(j + 2)
                                 or statement_follows(j + 2)):
                return False  # a labelled block opens them
            return True  # a key, `type:` included
        if first[1] in KEYWORDS:
            return False
        if nk in (",", "}", "?") or toks[j + 1][0] == "id":
            return True
        if nk != "(":
            return False
        # A method shorthand `{ name(…) {` or `{ name(…): T {`, not a call statement.
        d = 0
        q = j + 1
        while q < n:
            if toks[q][1] == "(":
                d += 1
            elif toks[q][1] == ")":
                d -= 1
                if d == 0:
                    break
            q += 1
        return q + 1 < n and toks[q + 1][1] in ("{", ":")

    def statement_follows(b):
        """Whether a statement follows the `}` closing the `{` at `b` on a later line or after a
        `;`: read as an object field's value, that `}` meets a `,`, a `}` or a continuation."""
        i = match.get(b, n - 1) + 1
        if i >= n or toks[i][0] != "nl" and toks[i][1] != ";":
            return False
        semi = False
        while i < n and (toks[i][0] == "nl" or toks[i][1] == ";"):
            semi = semi or toks[i][1] == ";"
            i += 1
        if i >= n or toks[i][1] in ("}", ","):
            return False
        if semi:
            return True
        t = toks[i][1]
        if t in (".", "?", "+", "-", "*", "/", "%", "^", "=", "<", ">", "&", "|"):
            return False  # the value continues on the next line
        if t == "!" and i + 1 < n and toks[i + 1][1] == "=":
            return False
        return t not in ("is", "as")

    kinds = {}  # `{` token index -> "block" (holds statements) or "value" (object or type)
    labelled = set()  # token indices of the names rewritten as labels

    def brace_kind(b):
        """What the `{` at token `b` opened for the parser before the ruling. After a token that
        starts a value or a type it is an object or a type; after `X:` it is a block when `X` is
        a label and a field's value otherwise; any other brace is a body, an object when it
        opens like one (a function or lambda body, a branch) and a block when not."""
        j = b - 1
        while j >= 0 and toks[j][0] == "nl":
            j -= 1
        if j < 0:
            return "value" if opens_like_object(b) else "block"
        t = toks[j][1]
        if t == ":":
            return "block" if j - 1 in labelled else "value"
        if t in VALUE_BRACE_AFTER or t == "\\{":
            return "value"
        return "value" if opens_like_object(b) else "block"

    # Where each label name is jumped to: token indices of `break :X` / `continue :X`.
    jumps = {}
    edits = []  # (start, end, replacement)
    for k in range(n - 2):
        kind, text, pos = toks[k]
        if kind == "id" and text in ("break", "continue") and toks[k + 1][1] == ":" \
                and toks[k + 2][0] == "id":
            colon = toks[k + 1][2]
            name = toks[k + 2][1]
            jumps.setdefault(name, []).append(k)
            edits.append((colon, colon + 1, "@"))

    def prev(k):
        """The token before `k` ("\\n" for a line break) and the nearest one that is not a line
        break, or None at the start."""
        if k == 0:
            return None, None
        j = k - 1
        while j >= 0 and toks[j][0] == "nl":
            j -= 1
        near = "\n" if toks[k - 1][0] == "nl" else toks[k - 1][1]
        return near, (toks[j][1] if j >= 0 else None)

    for k in range(n):
        kind, name, pos = toks[k]
        if kind == "p" and name == "{":
            kinds[k] = brace_kind(k)
            continue
        if kind != "id" or k + 2 >= n or toks[k + 1][1] != ":" or toks[k + 2][0] == "nl":
            continue
        nxt = toks[k + 2]
        loop = nxt[0] == "id" and nxt[1] in ("while", "for")
        if not loop and nxt[1] != "{":
            continue
        near, far = prev(k)
        if far in (".", "?"):
            continue
        e = encl[k]
        in_block = e < 0 or kinds.get(e) == "block"
        # A value position always read a label; inside an object or a type nothing else did.
        value = near in VALUE_BEFORE or (near == "\n" and far in VALUE_BEFORE)
        inside = not loop and jumped_inside(k)
        # A statement starts here: first in a block, after `;` or `}`, or a line break that no
        # `,` or opener continues.
        stmt = in_block and (near in (";", "}") or far is None or far == "{"
                             or (near == "\n" and far not in OPEN_BEFORE))
        # In parentheses or brackets, `((B: { … }))` held a block; `f(r: { … })` holds a type.
        paren = in_block and far in ("(", "[") and (loop or not opens_like_object(k + 2))
        if not (value or inside or stmt or paren):
            continue
        labelled.add(k)
        target = nxt[2]
        if near == "break" and not loop:
            # `break @B { … }` would name the label: the block is the value, so parenthesize.
            edits.append((pos, target, "(@" + name + " "))
            end = toks[match[k + 2]][2] + 1
            edits.append((end, end, ")"))
        else:
            edits.append((pos, target, "@" + name + " "))
    edits.sort()
    out = []
    last = 0
    for s, e, r in edits:
        out.append(src[last:s])
        out.append(r)
        last = e
    out.append(src[last:])
    return "".join(out), len(edits)


def files(paths):
    for p in paths:
        if os.path.isdir(p):
            for root, _, names in os.walk(p):
                for nm in sorted(names):
                    if nm.endswith(".vl"):
                        yield os.path.join(root, nm)
        elif os.path.isfile(p):
            yield p
        else:
            print(f"{p}: no such file or directory")


def main(argv):
    check = "--check" in argv
    paths = [a for a in argv if a != "--check"]
    if not paths:
        print(__doc__)
        return 2
    total = 0
    for f in files(paths):
        src = open(f, encoding="utf-8").read()
        out, n = rewrite(src)
        if n:
            total += n
            print(f"{f}: {n} site(s) {'to rewrite' if check else 'rewritten'}")
            if not check:
                open(f, "w", encoding="utf-8").write(out)
    return 1 if total else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
