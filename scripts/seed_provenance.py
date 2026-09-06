#!/usr/bin/env python3
"""What the seed was built FROM, compared with what is checked out.

WHY THIS EXISTS. `build/vl-compiler.wasm` is the compiler's own codegen of itself, so a grade
taken against it is a grade of whatever source it was built from — not of the tree you are
looking at. On 2026-09-06 that produced a confidently reported red: `check-filed-witnesses.py`
was run by hand after a branch switch, WITHOUT `refresh-compiler.sh`, so the row files were
from one commit and the seed from another, and three rows whose fixes had landed graded as
MOVED against a compiler that did not have them. The instrument was fine; the pairing was not.

WHY NOT A TIMESTAMP. The obvious guard — is the seed newer than `compiler/*.vl`? — is the one
this repo has already been burned by. `git archive`, `cp`, a rebase and a checkout all hand a
stale artifact a fresh mtime and a fresh artifact an old one, which is why the cargo rule reads
"verify BEHAVIORALLY, never by timestamp" (CLAUDE.md, and DECISIONS.md's shared-target section).
So this compares IDENTITIES: `refresh-compiler.sh` records the fold of the sources it compiled
into a sidecar, and this recomputes that fold over the working tree.

THE FOLD IS THE HOST'S. `std_hash` in `scripts/vl-host/src/main.rs` is FNV-1a over
`name\\0len\\0src\\0` per module in sorted order, and `vl std --hash` prints it. Using the same
one means an identity here and an identity from the host are comparable by eye and by grep,
and there is one algorithm in the tree rather than two that can disagree.
"""
import os
import sys

ROOT = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
SEED = os.path.join(ROOT, "build", "vl-compiler.wasm")
SIDECAR = SEED + ".src"
PRIME = 0x0000_0100_0000_01B3
OFFSET = 0xCBF2_9CE4_8422_2325
MASK = (1 << 64) - 1


def _feed(h, data):
    for b in data:
        h = ((h ^ b) * PRIME) & MASK
    return h


def source_identity(root=ROOT):
    """FNV-1a over every `compiler/*.vl`, in sorted name order — `std_hash`'s exact fold."""
    d = os.path.join(root, "compiler")
    names = sorted(n for n in os.listdir(d) if n.endswith(".vl"))
    h = OFFSET
    for n in names:
        with open(os.path.join(d, n), "rb") as fh:
            src = fh.read()
        h = _feed(h, n.encode())
        h = _feed(h, b"\0")
        h = _feed(h, str(len(src)).encode())
        h = _feed(h, b"\0")
        h = _feed(h, src)
        h = _feed(h, b"\0")
    return "%016x" % h, len(names)


def recorded_identity(sidecar=SIDECAR):
    """What `refresh-compiler.sh` wrote, or None when the seed has no recorded provenance."""
    try:
        with open(sidecar, encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line and not line.startswith("#"):
                    return line.split()[0]
    except OSError:
        return None
    return None


def check(root=ROOT, sidecar=SIDECAR):
    """(status, line) — status is `match`, `differ` or `unknown`; line is for a summary.

    `unknown` is not a failure on its own: a seed fetched by `fetch-seed.sh`, or one from a
    release, legitimately carries no sidecar. It IS a failure to quote a MOVED row against
    one, which is the caller's call — `differ` is the caller-independent refusal.
    """
    have, n = source_identity(root)
    want = recorded_identity(sidecar)
    if want is None:
        return "unknown", ("seed provenance: UNKNOWN (no %s) · compiler/*.vl is %s over %d files"
                           % (os.path.relpath(sidecar, root), have, n))
    if want == have:
        return "match", "seed provenance: %s · compiler/*.vl %s over %d files — match" % (
            want, have, n)
    return "differ", (
        "seed provenance: %s · compiler/*.vl %s over %d files — DIFFER" % (want, have, n))


def guard(what, moved=0, root=ROOT, sidecar=SIDECAR, out=sys.stderr):
    """Print the identities and return an exit code, or 0 to carry on.

    Every caller prints the line unconditionally: the rule this enforces is that a reading is
    quoted WITH its provenance or not at all, and a line only printed on failure cannot be
    quoted alongside a green one.
    """
    status, line = check(root, sidecar)
    print(line, file=out)
    if status == "differ":
        print("%s: REFUSING — the seed was built from different `compiler/*.vl` than the ones\n"
              "  checked out, so every row would be graded against a compiler this tree does\n"
              "  not describe. Run `scripts/refresh-compiler.sh` and re-run." % what, file=out)
        return 2
    if status == "unknown" and moved:
        print("%s: REFUSING to report %d MOVED row(s) against a seed of unknown provenance —\n"
              "  a MOVED reading is quoted with the seed's identity beside the tree's or it is\n"
              "  not a reading. Run `scripts/refresh-compiler.sh` and re-run." % (what, moved),
              file=out)
        return 2
    return 0


SELF_TEST_SRC = "// a compiler source whose bytes are the whole point\n"


def self_test():
    """Each verdict on a specimen that must produce it, plus the sabotage of each.

    A guard nobody has watched refuse is not known to refuse. The three specimens are built,
    not asserted: a tree whose sidecar records its own sources (match), the same tree with ONE
    source byte changed (differ), and a tree with no sidecar (unknown) — which is a failure
    only once a MOVED row is in hand.
    """
    import tempfile
    bad = []

    def case(name, want, moved=0, mutate=None, write_sidecar=True):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "compiler"))
            os.makedirs(os.path.join(d, "build"))
            src = os.path.join(d, "compiler", "entry.vl")
            with open(src, "w", encoding="utf-8") as fh:
                fh.write(SELF_TEST_SRC)
            side = os.path.join(d, "build", "vl-compiler.wasm.src")
            if write_sidecar:
                h, _ = source_identity(d)
                with open(side, "w", encoding="utf-8") as fh:
                    fh.write(h + "\n")
            if mutate is not None:
                with open(src, "w", encoding="utf-8") as fh:
                    fh.write(mutate)
            status, _ = check(d, side)
            if status != want:
                bad.append("%s: status %r, want %r" % (name, status, want))
            import io as _io
            buf = _io.StringIO()
            rc = guard("self-test", moved, d, side, buf)
            return rc, buf.getvalue()

    rc, _ = case("a seed built from these very sources", "match")
    if rc != 0:
        bad.append("match must not refuse, got rc %d" % rc)

    rc, out = case("one source byte changed under the seed", "differ",
                   mutate=SELF_TEST_SRC + "// and now it is not\n")
    if rc != 2:
        bad.append("differ must refuse with rc 2, got %d" % rc)
    if "refresh-compiler.sh" not in out:
        bad.append("the differ refusal must name refresh-compiler.sh")

    rc, _ = case("no sidecar, nothing moved", "unknown", write_sidecar=False)
    if rc != 0:
        bad.append("unknown with 0 moved must pass, got rc %d" % rc)

    rc, out = case("no sidecar, a MOVED row in hand", "unknown", moved=3,
                   write_sidecar=False)
    if rc != 2:
        bad.append("unknown with a MOVED row must refuse with rc 2, got %d" % rc)
    if "MOVED" not in out:
        bad.append("the unknown+moved refusal must say what it will not report")

    # THE SABOTAGE, which is the point: a guard that stopped comparing and always answered
    # `match` would satisfy the first case by luck, so break it on purpose and require the
    # specimens to notice. Without this the self-test proves only that nothing threw.
    import io as _io

    def tree(d):
        os.makedirs(os.path.join(d, "compiler"))
        with open(os.path.join(d, "compiler", "entry.vl"), "w", encoding="utf-8") as fh:
            fh.write(SELF_TEST_SRC)
        return os.path.join(d, "no-sidecar")

    saved = globals()["check"]
    globals()["check"] = lambda root=ROOT, sidecar=SIDECAR: ("match", "sabotaged")
    try:
        with tempfile.TemporaryDirectory() as d:
            if guard("sabotage", 3, d, tree(d), _io.StringIO()) != 0:
                bad.append("the sabotage did not take effect (guard still refused)")
    finally:
        globals()["check"] = saved
    # And with the real `check` restored, the same call must refuse again — which is what
    # makes the line above evidence rather than decoration.
    with tempfile.TemporaryDirectory() as d:
        if guard("control", 3, d, tree(d), _io.StringIO()) != 2:
            bad.append("with the real check restored, an unknown+MOVED tree must refuse")

    if bad:
        print("seed-provenance self-test FAILED:")
        for b in bad:
            print("  " + b)
        return 1
    print("seed-provenance self-test ok — match passes, a one-byte source change refuses "
          "naming refresh-compiler.sh, and an unknown seed refuses only once a row has MOVED")
    return 0


if __name__ == "__main__":
    argv = sys.argv[1:]
    if "--self-test" in argv:
        sys.exit(self_test())
    if "--write" in argv:
        seed = SEED
        if "--seed" in argv:
            seed = os.path.abspath(argv[argv.index("--seed") + 1])
        side = seed + ".src"
        h, n = source_identity()
        with open(side, "w", encoding="utf-8") as fh:
            fh.write("%s\n# fnv1a-64 over %d compiler/*.vl, `std_hash`'s fold; written by "
                     "scripts/refresh-compiler.sh\n" % (h, n))
        print("wrote %s (%s over %d files)" % (side, h, n))
        sys.exit(0)
    status, line = check()
    print(line)
    sys.exit(0 if status == "match" else 1)
