#!/usr/bin/env python3
"""Generate the fixtures for the float pmin/pmax, float-shape conversion and scalar
saturating-truncation intrinsics (PL-043):

    tests/cases/simd/float-pminmax.vl       f32x4/f64x2 pmin and pmax
    tests/cases/simd/float-convert.vl       promote_low, demote_zero, convert_low_s/u
    tests/cases/numerics/trunc-sat.vl       the eight scalar trunc_sat forms

The expected `@log` lines come from the independent model below, written from the wasm spec
(pmin is `b < a ? b : a`, pmax `a < b ? b : a`, both returning an operand's bits unchanged;
trunc_sat answers 0 for NaN and clamps out-of-range to the result's bounds). Every value is
printed as its bit pattern. The corpus oracle runs the cases on V8; `vl run` on wasmtime.

    python3 scripts/gen-conv-cases.py            # write the cases
    python3 scripts/gen-conv-cases.py --verify   # also check every opcode against wasm-dis
"""
import math
import os
import re
import struct
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
SIMD_OUT = os.path.join(ROOT, "tests", "cases", "simd")
NUM_OUT = os.path.join(ROOT, "tests", "cases", "numerics")

# ── the spec table: wasm name, prefix byte, sub-opcode, VL name ─────────────
# Written from the wasm 2.0 opcode list, not read from the compiler, so `--verify` compares two
# independent sources (and binaryen's decoder as the third).

def spec_table():
    rows = [
        ("f32x4.pmin", 0xFD, 0xEA, "__pmin_f32x4__"),
        ("f32x4.pmax", 0xFD, 0xEB, "__pmax_f32x4__"),
        ("f64x2.pmin", 0xFD, 0xF6, "__pmin_f64x2__"),
        ("f64x2.pmax", 0xFD, 0xF7, "__pmax_f64x2__"),
        ("f32x4.demote_f64x2_zero", 0xFD, 0x5E, "__demote_f64x2_zero__"),
        ("f64x2.promote_low_f32x4", 0xFD, 0x5F, "__promote_low_f32x4__"),
        ("f64x2.convert_low_i32x4_s", 0xFD, 0xFE, "__convert_low_i32x4_s__"),
        ("f64x2.convert_low_i32x4_u", 0xFD, 0xFF, "__convert_low_i32x4_u__"),
    ]
    sub = 0
    for dst in ("i32", "i64"):
        for src in ("f32", "f64"):
            for sign in ("s", "u"):
                rows.append((f"{dst}.trunc_sat_{src}_{sign}", 0xFC, sub,
                             f"__trunc_sat_{src}_{sign}_{dst}__"))
                sub += 1
    return rows


# ── the reference model ─────────────────────────────────────────────────────

def f32_of(bits):
    return struct.unpack("<f", struct.pack("<I", bits & 0xFFFFFFFF))[0]


def f64_of(bits):
    return struct.unpack("<d", struct.pack("<Q", bits & 0xFFFFFFFFFFFFFFFF))[0]


def bits32(x):
    return struct.unpack("<I", struct.pack("<f", x))[0]


def bits64(x):
    return struct.unpack("<Q", struct.pack("<d", x))[0]


def signed(v, bits):
    v %= 1 << bits
    return v - (1 << bits) if v >= 1 << (bits - 1) else v


def pmin(of):
    return lambda a, b: b if of(b) < of(a) else a


def pmax(of):
    return lambda a, b: b if of(a) < of(b) else a


CANON32, CANON64 = 0x7FC00000, 0x7FF8000000000000


def promote(b):
    x = f32_of(b)
    # Only the canonical NaN is fed in: the spec makes its result a canonical NaN of either
    # sign, and leaves a payload-carrying NaN's to the engine. The sign kept is x86's.
    return CANON64 if math.isnan(x) else bits64(x)


def demote(b):
    x = f64_of(b)
    if math.isnan(x):
        return CANON32
    try:
        return bits32(x)  # C's double-to-float cast: round to nearest, ties to even
    except OverflowError:
        return bits32(math.copysign(math.inf, x))


def trunc_sat(x, bits, sign):
    if math.isnan(x):
        return 0
    lo, hi = (-(1 << (bits - 1)), (1 << (bits - 1)) - 1) if sign == "s" else (0, (1 << bits) - 1)
    if math.isinf(x):
        v = hi if x > 0 else lo
    else:
        v = max(lo, min(hi, math.trunc(x)))
    return signed(v, bits)


# ── the inputs ──────────────────────────────────────────────────────────────

F32_EDGES = [
    0x00000000, 0x80000000, 0x3F000000, 0xBF000000, 0x3FF33333, 0xBFF33333, 0x00000001,
    0x7F7FFFFF, 0xFF7FFFFF, 0x7F800000, 0xFF800000, 0x7FC00000, 0xFFC00000, 0x7FA00001,
    0x4EFFFFFF, 0x4F000000, 0xCF000000, 0xCF000001, 0x4F7FFFFF, 0x4F800000, 0xBF7FFFFF,
    0x5EFFFFFF, 0x5F000000, 0xDF000000, 0xDF000001, 0x5F7FFFFF, 0x5F800000,
]
F64_EDGES = [
    0x0000000000000000, 0x8000000000000000, 0x3FE0000000000000, 0xBFE0000000000000,
    0x0000000000000001, 0x7FEFFFFFFFFFFFFF, 0xFFEFFFFFFFFFFFFF, 0x7FF0000000000000,
    0xFFF0000000000000, 0x7FF8000000000000, 0xFFF8000000000000, 0x7FF4000000000001,
    0xBFECCCCCCCCCCCCD,  # -0.9
    0xBFF0000000000000,  # -1.0
] + [bits64(x) for x in (
    2147483647.9, 2147483648.0, -2147483648.9, -2147483649.0, 4294967295.9, 4294967296.0,
    9223372036854774784.0, 9223372036854775808.0, -9223372036854775808.0,
    -9223372036854777856.0, 18446744073709549568.0, 18446744073709551616.0,
)]

# Lane pairs (a, b) for pmin/pmax: every ordering of ±0, NaNs (signed, with payloads) against
# numbers and each other, infinities, subnormals and ordinary values.
F32_PAIRS = [
    (0x00000000, 0x80000000), (0x80000000, 0x00000000), (0x7FC00000, 0x3F800000),
    (0x3F800000, 0x7FC00000), (0xFFC00001, 0x7FA00002), (0x7FA00002, 0xFFC00001),
    (0xFF800000, 0x7F800000), (0x7F800000, 0xFF800000), (0x3FC00000, 0x40200000),
    (0xBF800000, 0xC0000000), (0x00000001, 0x00000000), (0x80000001, 0x80000000),
    (0x7F800000, 0x7FC00000), (0xFFC00000, 0xFF800000), (0x3F800000, 0x3F800000),
    (0x80000000, 0x80000000),
]
F64_PAIRS = [
    (0x0000000000000000, 0x8000000000000000), (0x8000000000000000, 0x0000000000000000),
    (0x7FF8000000000000, 0x3FF0000000000000), (0x3FF0000000000000, 0x7FF8000000000000),
    (0xFFF8000000000001, 0x7FF4000000000002), (0x7FF4000000000002, 0xFFF8000000000001),
    (0xFFF0000000000000, 0x7FF0000000000000), (0x7FF0000000000000, 0xFFF0000000000000),
    (0x3FF8000000000000, 0x4004000000000000), (0xBFF0000000000000, 0xC000000000000000),
    (0x0000000000000001, 0x0000000000000000), (0x8000000000000001, 0x8000000000000000),
]

# promote_low reads lanes 0 and 1; lanes 2 and 3 carry values that must not leak through.
PROMOTE_INPUTS = [
    (0x00000000, 0x80000000, 0x3F800000, 0x40000000),
    (0x3FC00000, 0xC0490FDB, 0x7F800000, 0xFF800000),
    (0x7F800000, 0xFF800000, 0x00000000, 0x00000000),
    (0x00000001, 0x807FFFFF, 0x3F800000, 0x3F800000),
    (0x7F7FFFFF, 0x7FC00000, 0x12345678, 0x9ABCDEF0),
]
DEMOTE_INPUTS = [
    (0x0000000000000000, 0x8000000000000000),
    (bits64(1.5), bits64(-3.141592653589793)),
    (0x7FF0000000000000, 0xFFF0000000000000),
    (bits64(1 + 2 ** -24), bits64(1 + 3 * 2 ** -24)),     # ties to even: down, then up
    (bits64(3.4028235677973366e38), bits64(-3.4028235677973366e38)),  # rounds to ±inf
    (bits64(3.4028234663852886e38), bits64(1e300)),        # FLT_MAX exactly, then overflow
    (bits64(2 ** -150), bits64(3 * 2 ** -151)),           # tie to 0, then to the least subnormal
    (bits64(1e-300), 0x7FF8000000000000),                 # underflow to +0, canonical NaN
]
CONVERT_INPUTS = [
    (0, -1, 7, 7),
    (0x7FFFFFFF, -(1 << 31), 1, 1),
    (1, -2, 0x7FFFFFFF, -(1 << 31)),
    (123456789, -987654321, 0, 0),
]


# ── the writers ─────────────────────────────────────────────────────────────

def lit32(v):
    v = signed(v, 32)
    return "(-2147483647 - 1)" if v == -(1 << 31) else str(v)


def lit64(v):
    v = signed(v, 64)
    return "(-9223372036854775807 - 1)" if v == -(1 << 63) else str(v)


PRELUDE = [
    "function v4(a: i32, b: i32, c: i32, d: i32): v128 {",
    "  __store_i32__(0, a)",
    "  __store_i32__(4, b)",
    "  __store_i32__(8, c)",
    "  __store_i32__(12, d)",
    "  __load_v128__(0)",
    "}",
    "",
    "function v2(a: i64, b: i64): v128 {",
    "  __store_i64__(0, a)",
    "  __store_i64__(8, b)",
    "  __load_v128__(0)",
    "}",
    "",
    "function show4(x: v128) {",
    "  __store_v128__(16, x)",
    "  print(__load_i32__(16))",
    "  print(__load_i32__(20))",
    "  print(__load_i32__(24))",
    "  print(__load_i32__(28))",
    "}",
    "",
    "function show2(x: v128) {",
    "  __store_v128__(16, x)",
    "  print(__load_i64__(16))",
    "  print(__load_i64__(24))",
    "}",
    "",
]


class Case:
    def __init__(self, out, name, blurb, prelude):
        self.path = os.path.join(out, name)
        self.blurb, self.prelude = blurb, prelude
        self.body, self.logs = [], []

    def vec(self, lanes):
        """Binds a vector built from four i32 or two i64 lane literals; answers its name."""
        name = f"x{len(self.body)}"
        mk = "v4" if len(lanes) == 4 else "v2"
        lit = lit32 if len(lanes) == 4 else lit64
        self.body.append(f"  const {name} = {mk}({', '.join(lit(x) for x in lanes)})")
        return name

    def write(self):
        text = ["// @run"] + [f"// @log {l}" for l in self.logs]
        text += [f"// {line}" for line in self.blurb]
        text += ["// Generated by scripts/gen-conv-cases.py; the expected lines are its model of",
                 "// the wasm spec. Edit the generator, not this file."]
        text += self.prelude + ["function main() {"] + self.body + ["}", "main()", ""]
        with open(self.path, "w") as fh:
            fh.write("\n".join(text))


def gen_pminmax():
    c = Case(SIMD_OUT, "float-pminmax.vl", [
        "f32x4 and f64x2 pmin/pmax over ±0, signed and payload-carrying NaNs, infinities and",
        "subnormals. pmin is `b < a ? b : a` and pmax `a < b ? b : a`, so each lane is one",
        "operand's bits unchanged: x86 `minps d, s` is `pmin(s, d)`. Printed as bit patterns.",
    ], PRELUDE)
    for i in range(0, len(F32_PAIRS), 4):
        ps = F32_PAIRS[i:i + 4]
        a, b = c.vec([p[0] for p in ps]), c.vec([p[1] for p in ps])
        for op, f in (("pmin", pmin(f32_of)), ("pmax", pmax(f32_of))):
            c.body.append(f"  show4(__{op}_f32x4__({a}, {b}))")
            c.logs += [str(signed(f(x, y), 32)) for x, y in ps]
    for i in range(0, len(F64_PAIRS), 2):
        ps = F64_PAIRS[i:i + 2]
        a, b = c.vec([p[0] for p in ps]), c.vec([p[1] for p in ps])
        for op, f in (("pmin", pmin(f64_of)), ("pmax", pmax(f64_of))):
            c.body.append(f"  show2(__{op}_f64x2__({a}, {b}))")
            c.logs += [str(signed(f(x, y), 64)) for x, y in ps]
    c.write()


def gen_convert():
    c = Case(SIMD_OUT, "float-convert.vl", [
        "promote_low_f32x4 (lanes 0 and 1 to f64), demote_f64x2_zero (to f32 lanes 0 and 1,",
        "rounding to nearest-even, with lanes 2 and 3 zero) and convert_low_i32x4_s/u (exact).",
        "A NaN input is the canonical one: the spec fixes a canonical result but not its sign, so",
        "the exact bits rely on the engines keeping the sign, as x86 does. Printed as bit patterns.",
    ], PRELUDE)
    for ls in PROMOTE_INPUTS:
        c.body.append(f"  show2(__promote_low_f32x4__({c.vec(ls)}))")
        c.logs += [str(signed(promote(x), 64)) for x in ls[:2]]
    for ls in DEMOTE_INPUTS:
        c.body.append(f"  show4(__demote_f64x2_zero__({c.vec(ls)}))")
        c.logs += [str(signed(demote(x), 32)) for x in ls] + ["0", "0"]
    for sign in ("s", "u"):
        for ls in CONVERT_INPUTS:
            c.body.append(f"  show2(__convert_low_i32x4_{sign}__({c.vec(ls)}))")
            for x in ls[:2]:
                x = signed(x, 32) if sign == "s" else x % (1 << 32)
                c.logs.append(str(signed(bits64(float(x)), 64)))
    c.write()


def gen_trunc_sat():
    c = Case(NUM_OUT, "trunc-sat.vl", [
        "The eight scalar saturating truncations over ±0, fractions, subnormals, the bounds of",
        "each result on both sides, ±inf and signed NaNs: NaN gives 0 and an out-of-range",
        "operand clamps to the result's minimum or maximum, where `as!` would trap.",
    ], [])
    for src, edges, mk in (("f32", F32_EDGES, "f32fromBits"), ("f64", F64_EDGES, "f64fromBits")):
        lit = lit32 if src == "f32" else lit64
        of = f32_of if src == "f32" else f64_of
        for dst, bits in (("i32", 32), ("i64", 64)):
            for sign in ("s", "u"):
                name = f"__trunc_sat_{src}_{sign}_{dst}__"
                for e in edges:
                    c.body.append(f"  print({name}({mk}({lit(e)})))")
                    c.logs.append(str(trunc_sat(of(e), bits, sign)))
    c.write()


def check_coverage():
    text = "".join(open(p).read() for p in (os.path.join(SIMD_OUT, "float-pminmax.vl"),
                                              os.path.join(SIMD_OUT, "float-convert.vl"),
                                              os.path.join(NUM_OUT, "trunc-sat.vl")))
    missing = [vl for _, _, _, vl in spec_table() if vl + "(" not in text]
    if missing:
        raise SystemExit("rows with no generated case: " + ", ".join(missing))


def leb(data, i):
    v = shift = 0
    while True:
        b = data[i]
        v |= (b & 0x7F) << shift
        i += 1
        shift += 7
        if b < 0x80:
            return v, i


def code_section(data):
    i = 8
    while i < len(data):
        sid = data[i]
        size, j = leb(data, i + 1)
        if sid == 10:
            return data[j:j + size]
        i = j + size
    raise SystemExit("no code section")


def verify():
    """Builds one module calling every intrinsic in spec order, each in its own function whose
    body is `local.get 0; <instr>; return; end`, and checks (1) each body's instruction bytes
    against the spec table and (2) binaryen's disassembly names."""
    rows = spec_table()
    lines = []
    for k, (wasm, _, _, vl) in enumerate(rows):
        if wasm.startswith(("i32.", "i64.")):
            ps = "x: " + ("f32" if "_f32_" in wasm else "f64")
        elif ".pmin" in wasm or ".pmax" in wasm:
            ps = "x: v128, y: v128"
        else:
            ps = "x: v128"
        args = "x, y" if "y:" in ps else "x"
        lines.append(f"export function k{k}({ps}) {{ {vl}({args}) }}")
    with tempfile.TemporaryDirectory() as d:
        src, wasm_path = os.path.join(d, "all.vl"), os.path.join(d, "all.wasm")
        open(src, "w").write("\n".join(lines) + "\n")
        vl = os.environ.get("VL", os.path.join(ROOT, "scripts/vl-host/target/release/vl"))
        seed = os.path.join(ROOT, "build/vl-compiler.wasm")
        subprocess.run([vl, "build", src, "--compiler", seed, "-o", wasm_path], check=True,
                       stdout=subprocess.DEVNULL)
        data = open(wasm_path, "rb").read()
        dis = subprocess.run([os.path.join(ROOT, "node_modules/.bin/wasm-dis"), wasm_path,
                              "--enable-simd", "--enable-nontrapping-float-to-int",
                              "--enable-gc", "--enable-reference-types"],
                             check=True, capture_output=True, text=True).stdout
    code = code_section(data)
    count, i = leb(code, 0)
    bodies = []
    for _ in range(count):
        size, j = leb(code, i)
        bodies.append(code[j:j + size])
        i = j + size
    got = []
    for body in bodies[-len(rows):]:
        # no locals, `local.get 0` (and `local.get 1`), the instruction, `return`, `end`
        m = re.fullmatch(rb"\x00\x20\x00(?:\x20\x01)?(.+?)\x0f?\x0b", body, re.S)
        got.append(m.group(1) if m else body)
    want = [bytes([p]) + (bytes([s]) if s < 0x80 else bytes([s & 0x7F | 0x80, s >> 7]))
            for _, p, s, _ in rows]
    names = re.findall(r"\((f32x4\.\w+|f64x2\.\w+|i(?:32|64)\.trunc_sat_\w+)", dis)
    bad = [(w, n) for (w, _, _, _), n in zip(rows, names) if w != n]
    same = got == want
    print(f"opcodes: {len(got)} emitted, {'equal to' if same else 'DIFFERENT from'} the spec "
          f"table's {len(want)}; wasm-dis: {len(names)} decoded, {len(bad)} disagree")
    if not same or len(names) != len(rows) or bad:
        raise SystemExit(f"verify failed: {bad[:5]} {list(zip(got, want))[:3]}")


if __name__ == "__main__":
    gen_pminmax()
    gen_convert()
    gen_trunc_sat()
    check_coverage()
    if "--verify" in sys.argv:
        verify()
