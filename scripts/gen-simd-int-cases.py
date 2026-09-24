#!/usr/bin/env python3
"""Generate tests/cases/simd/int-*.vl: every integer SIMD intrinsic against known vectors.

The expected `@log` lines come from the reference model below, written from the WebAssembly
SIMD spec's lane semantics (wrapping, saturating, signed/unsigned, the shift count taken
modulo the lane width, narrowing that saturates a SIGNED input). The corpus oracle runs the
cases on V8; `vl run` runs them on wasmtime. Re-run after changing the intrinsic table:

    python3 scripts/gen-simd-int-cases.py
"""
import os
import re
import struct

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "tests", "cases", "simd")

# ── the reference model ─────────────────────────────────────────────────────


def lanes(b, bits, signed):
    n = bits // 8
    out = []
    for i in range(0, 16, n):
        v = int.from_bytes(b[i:i + n], "little")
        if signed and v >= 1 << (bits - 1):
            v -= 1 << bits
        out.append(v)
    return out


def pack(vals, bits):
    n = bits // 8
    return b"".join((v % (1 << bits)).to_bytes(n, "little") for v in vals)


def sat(v, bits, signed):
    lo, hi = (-(1 << (bits - 1)), (1 << (bits - 1)) - 1) if signed else (0, (1 << bits) - 1)
    return max(lo, min(hi, v))


def lanewise(bits, signed, f):
    return lambda a, b: pack([f(x, y) for x, y in zip(lanes(a, bits, signed), lanes(b, bits, signed))], bits)


def unary(bits, signed, f):
    return lambda a: pack([f(x) for x in lanes(a, bits, signed)], bits)


def cmp(bits, signed, f):
    return lanewise(bits, signed, lambda x, y: -1 if f(x, y) else 0)


def narrow(src_bits, signed_out):
    dst = src_bits // 2
    return lambda a, b: pack([sat(x, dst, signed_out) for x in lanes(a, src_bits, True) + lanes(b, src_bits, True)], dst)


def extend(src_bits, half, signed):
    def f(a):
        ls = lanes(a, src_bits, signed)
        h = len(ls) // 2
        return pack(ls[:h] if half == "low" else ls[h:], src_bits * 2)
    return f


def extmul(src_bits, half, signed):
    def f(a, b):
        la, lb = lanes(a, src_bits, signed), lanes(b, src_bits, signed)
        h = len(la) // 2
        sl = slice(0, h) if half == "low" else slice(h, None)
        return pack([x * y for x, y in zip(la[sl], lb[sl])], src_bits * 2)
    return f


def extadd(src_bits, signed):
    def f(a):
        ls = lanes(a, src_bits, signed)
        return pack([ls[i] + ls[i + 1] for i in range(0, len(ls), 2)], src_bits * 2)
    return f


def dot(a, b):
    la, lb = lanes(a, 16, True), lanes(b, 16, True)
    return pack([la[i] * lb[i] + la[i + 1] * lb[i + 1] for i in range(0, 8, 2)], 32)


def q15(a, b):
    return pack([sat((x * y + 0x4000) >> 15, 16, True) for x, y in zip(lanes(a, 16, True), lanes(b, 16, True))], 16)


def shift(bits, kind):
    def f(a, n):
        k = n % bits
        if kind == "shl":
            return pack([x << k for x in lanes(a, bits, False)], bits)
        if kind == "shr_s":
            return pack([x >> k for x in lanes(a, bits, True)], bits)
        return pack([x >> k for x in lanes(a, bits, False)], bits)
    return f


def f32(x):
    return struct.unpack("<f", struct.pack("<I", x % (1 << 32)))[0]


def trunc_sat(signed):
    def g(x):
        v = f32(x)
        if v != v:
            return 0
        if v in (float("inf"), float("-inf")):
            return sat(int(1 if v > 0 else -1) * (1 << 40), 32, signed)
        return sat(int(v), 32, signed)
    return lambda a: pack([g(x) for x in lanes(a, 32, False)], 32)


def convert(signed):
    return lambda a: b"".join(struct.pack("<f", float(x)) for x in lanes(a, 32, signed))


def bitmask(bits):
    return lambda a: sum(1 << i for i, x in enumerate(lanes(a, bits, True)) if x < 0)


def all_true(bits):
    return lambda a: 1 if all(x != 0 for x in lanes(a, bits, False)) else 0


def swizzle(a, s):
    return bytes(a[i] if i < 16 else 0 for i in s)


def bitwise(f):
    return lambda a, b: bytes(f(x, y) & 0xff for x, y in zip(a, b))


SHAPES = {"i8x16": 8, "i16x8": 16, "i32x4": 32, "i64x2": 64}

BINARY = {}  # intrinsic name → model
for shape, bits in SHAPES.items():
    BINARY[f"__add_{shape}__"] = lanewise(bits, False, lambda x, y: x + y)
    BINARY[f"__sub_{shape}__"] = lanewise(bits, False, lambda x, y: x - y)
    BINARY[f"__eq_{shape}__"] = cmp(bits, False, lambda x, y: x == y)
    BINARY[f"__ne_{shape}__"] = cmp(bits, False, lambda x, y: x != y)
    for sg, signed in (("s", True), ("u", False)):
        if shape == "i64x2" and sg == "u":
            continue  # wasm has only the signed i64x2 compares
        BINARY[f"__lt_{sg}_{shape}__"] = cmp(bits, signed, lambda x, y: x < y)
        BINARY[f"__gt_{sg}_{shape}__"] = cmp(bits, signed, lambda x, y: x > y)
        BINARY[f"__le_{sg}_{shape}__"] = cmp(bits, signed, lambda x, y: x <= y)
        BINARY[f"__ge_{sg}_{shape}__"] = cmp(bits, signed, lambda x, y: x >= y)
for shape in ("i16x8", "i32x4", "i64x2"):
    BINARY[f"__mul_{shape}__"] = lanewise(SHAPES[shape], False, lambda x, y: x * y)
for shape in ("i8x16", "i16x8"):
    bits = SHAPES[shape]
    for sg, signed in (("s", True), ("u", False)):
        BINARY[f"__add_sat_{sg}_{shape}__"] = lanewise(bits, signed, lambda x, y, b=bits, s=signed: sat(x + y, b, s))
        BINARY[f"__sub_sat_{sg}_{shape}__"] = lanewise(bits, signed, lambda x, y, b=bits, s=signed: sat(x - y, b, s))
    BINARY[f"__avgr_u_{shape}__"] = lanewise(bits, False, lambda x, y: (x + y + 1) >> 1)
for shape in ("i8x16", "i16x8", "i32x4"):
    bits = SHAPES[shape]
    for sg, signed in (("s", True), ("u", False)):
        BINARY[f"__min_{sg}_{shape}__"] = lanewise(bits, signed, min)
        BINARY[f"__max_{sg}_{shape}__"] = lanewise(bits, signed, max)
BINARY["__q15mulr_sat_s_i16x8__"] = q15
BINARY["__dot_i16x8_s__"] = dot
for src in ("i8x16", "i16x8", "i32x4"):
    for half in ("low", "high"):
        for sg, signed in (("s", True), ("u", False)):
            BINARY[f"__extmul_{half}_{src}_{sg}__"] = extmul(SHAPES[src], half, signed)
for src in ("i16x8", "i32x4"):
    for sg in ("s", "u"):
        BINARY[f"__narrow_{src}_{sg}__"] = narrow(SHAPES[src], sg == "s")
BINARY["__and_v128__"] = bitwise(lambda x, y: x & y)
BINARY["__or_v128__"] = bitwise(lambda x, y: x | y)
BINARY["__xor_v128__"] = bitwise(lambda x, y: x ^ y)
BINARY["__andnot_v128__"] = bitwise(lambda x, y: x & ~y)
BINARY["__swizzle_i8x16__"] = swizzle

UNARY = {"__not_v128__": lambda a: bytes(~x & 0xff for x in a),
         "__popcnt_i8x16__": lambda a: bytes(bin(x).count("1") for x in a)}
for shape, bits in SHAPES.items():
    UNARY[f"__abs_{shape}__"] = unary(bits, True, abs)
    UNARY[f"__neg_{shape}__"] = unary(bits, True, lambda x: -x)
for src in ("i8x16", "i16x8", "i32x4"):
    for half in ("low", "high"):
        for sg, signed in (("s", True), ("u", False)):
            UNARY[f"__extend_{half}_{src}_{sg}__"] = extend(SHAPES[src], half, signed)
for src in ("i8x16", "i16x8"):
    for sg, signed in (("s", True), ("u", False)):
        UNARY[f"__extadd_pairwise_{src}_{sg}__"] = extadd(SHAPES[src], signed)
UNARY["__trunc_sat_f32x4_s__"] = trunc_sat(True)
UNARY["__trunc_sat_f32x4_u__"] = trunc_sat(False)
UNARY["__convert_i32x4_s__"] = convert(True)
UNARY["__convert_i32x4_u__"] = convert(False)

REDUCE = {"__any_true_v128__": lambda a: 1 if any(a) else 0}
for shape, bits in SHAPES.items():
    REDUCE[f"__all_true_{shape}__"] = all_true(bits)
    REDUCE[f"__bitmask_{shape}__"] = bitmask(bits)

# ── the inputs ──────────────────────────────────────────────────────────────

# Byte-lane edges (0, ±1, the i8/u8 bounds), i16 edges, i32 edges, i64 edges: each pair
# is a 128-bit pattern every shape reads its own way.
P_I8 = (bytes([0, 1, 127, 128, 255, 254, 129, 126, 64, 192, 100, 200, 3, 250, 17, 240]),
        bytes([0, 255, 1, 128, 1, 3, 129, 130, 64, 64, 156, 100, 253, 10, 17, 16]))
P_I16 = (pack([0x7fff, 0x8000, 0xffff, 0x0001, 0x4000, 0xc000, 0x1234, 0x8001], 16),
         pack([0x0001, 0xffff, 0x8000, 0x7fff, 0x4000, 0x4000, 0xedcc, 0x8000], 16))
P_I32 = (pack([0x7fffffff, 0x80000000, 0xffffffff, 12345], 32),
         pack([1, 0xffffffff, 0x80000000, -54321], 32))
P_I64 = (pack([0x7fffffffffffffff, -0x8000000000000000], 64),
         pack([-1, 0x100000001], 64))
PAIRS = [("a8", "b8"), ("a16", "b16"), ("a32", "b32"), ("a64", "b64")]
VECS = {"a8": P_I8[0], "b8": P_I8[1], "a16": P_I16[0], "b16": P_I16[1],
        "a32": P_I32[0], "b32": P_I32[1], "a64": P_I64[0], "b64": P_I64[1]}
# f32 bit patterns for the float→int truncations: fractions, out of range, NaN, ±inf, -0.
FLT = pack([struct.unpack("<I", struct.pack("<f", x))[0] for x in (1.5, -1.5, 3.0e9, -3.0e9)], 32)
FLT2 = pack([0x7fc00000, 0x7f800000, 0xff800000, 0x80000000], 32)
FLT3 = pack([struct.unpack("<I", struct.pack("<f", x))[0] for x in (2147483520.0, 4294967040.0, -0.75, 0.9999)], 32)
VECS.update({"f1": FLT, "f2": FLT2, "f3": FLT3})
SWZ = bytes([15, 0, 16, 255, 3, 3, 128, 1, 31, 14, 2, 17, 7, 8, 9, 200])
VECS["sw"] = SWZ

# ── the VL program ──────────────────────────────────────────────────────────


def i32lit(x):
    x = (x + (1 << 31)) % (1 << 32) - (1 << 31)
    return "(-2147483647 - 1)" if x == -(1 << 31) else str(x)


def words(b):
    return [x for x in lanes(b, 32, True)]


PRELUDE = """\
// Scratch vectors live at bytes 0..63 of linear memory; a vector is built from four i32
// words stored there and read back, and shown as its four i32 words, lane 0 first.
function v(a: i32, b: i32, c: i32, d: i32): v128 {
  __store_i32__(0, a)
  __store_i32__(4, b)
  __store_i32__(8, c)
  __store_i32__(12, d)
  __load_v128__(0)
}

function show(x: v128) {
  __store_v128__(16, x)
  print(__load_i32__(16))
  print(__load_i32__(20))
  print(__load_i32__(24))
  print(__load_i32__(28))
}
"""


def fmt_call(fn, expr):
    """`  fn(expr)` laid out the way `vl fmt` lays it out at its 80-column limit."""
    if len(f"  {fn}({expr})") <= 80:
        return f"  {fn}({expr})"
    if len(f"    {expr},") <= 80:
        return f"  {fn}(\n    {expr},\n  )"
    callee, args = expr[:-1].split("(", 1)
    inner = "".join(f"      {a},\n" for a in args.split(", "))
    return f"  {fn}(\n    {callee}(\n{inner}    ),\n  )"


class Case:
    def __init__(self, name, blurb):
        self.name, self.blurb = name, blurb
        self.body, self.logs, self.used = [], [], set()

    def vec(self, name):
        self.used.add(name)
        return name

    def show(self, expr, b):
        self.body.append(fmt_call("show", expr))
        self.logs += [str(w) for w in words(b)]

    def scalar(self, expr, val):
        self.body.append(f"  print({expr})")
        self.logs.append(str(val))

    def write(self):
        decls = [f"  const {n} = v({', '.join(i32lit(w) for w in words(VECS[n]))})"
                 for n in sorted(self.used)]
        text = ["// @run"] + [f"// @log {l}" for l in self.logs]
        text += [f"// {line}" for line in self.blurb]
        text += ["// Generated by scripts/gen-simd-int-cases.py; the expected lines are its model of the",
                 "// WebAssembly SIMD spec. Edit the generator, not this file.", PRELUDE,
                 "function main() {"] + decls + self.body + ["}", "main()", ""]
        with open(os.path.join(OUT, self.name), "w") as fh:
            fh.write("\n".join(text))


def gen_binary():
    c = Case("int-binary.vl", [
        "Every two-vector integer SIMD intrinsic over four input pairs whose lanes sit on the",
        "i8, i16, i32 and i64 edges: wrapping and saturating add/sub, mul, min/max, avgr, q15mulr,",
        "dot, extmul, narrow (a SIGNED input saturated to the target range), the v128 bitwise ops,",
        "swizzle (an index of 16 or more gives 0) and the compares (a lane of -1 where true).",
    ])
    for name, f in BINARY.items():
        if name == "__swizzle_i8x16__":
            for a in ("a8", "b16"):
                c.show(f"{name}({c.vec(a)}, {c.vec('sw')})", f(VECS[a], VECS["sw"]))
            continue
        for a, b in PAIRS:
            c.show(f"{name}({c.vec(a)}, {c.vec(b)})", f(VECS[a], VECS[b]))
    c.write()


def gen_unary():
    c = Case("int-unary.vl", [
        "Every one-vector integer SIMD intrinsic: abs and neg (abs of the minimum wraps to itself),",
        "not, popcnt, extend and extadd_pairwise at each signedness, the f32 truncations (NaN is 0,",
        "out of range saturates) and conversions, and the reductions to an i32.",
    ])
    for name, f in UNARY.items():
        srcs = ["f1", "f2", "f3"] if name.startswith("__trunc_sat") else [p[0] for p in PAIRS] + [p[1] for p in PAIRS]
        for a in srcs:
            c.show(f"{name}({c.vec(a)})", f(VECS[a]))
    for name, f in REDUCE.items():
        for a in VECS:
            c.scalar(f"{name}({c.vec(a)})", f(VECS[a]))
        # the all-zero, all-ones and all-one-but-no-sign-bit edges
        c.scalar(f"{name}(__splat_i32x4__(0))", f(bytes(16)))
        c.scalar(f"{name}(__splat_i32x4__(-1))", f(bytes([255] * 16)))
        c.scalar(f"{name}(__splat_i16x8__(1))", f(pack([1] * 8, 16)))
    c.write()


def gen_shift():
    c = Case("int-shift.vl", [
        "The twelve shifts. The count is an i32 taken modulo the lane width, so a count of the",
        "width or more shifts by the remainder and a negative count by its low bits; shr_s",
        "copies the sign bit in, shr_u shifts zeros in. A count held in a variable is the same.",
    ])
    counts = [0, 1, 7, 8, 9, 15, 16, 31, 32, 33, 63, 64, 65, -1]
    for shape, bits in SHAPES.items():
        for kind in ("shl", "shr_s", "shr_u"):
            name = f"__{kind}_{shape}__"
            f = shift(bits, kind)
            for a in sorted({"a8", "a" + str(bits)}):
                for n in counts:
                    c.show(f"{name}({c.vec(a)}, {n})", f(VECS[a], n))
            c.body.append(f"  let n_{kind}_{shape} = 0")
            c.body.append(f"  while n_{kind}_{shape} < {bits + 3} {{")
            c.body.append(f"    show({name}({c.vec('b16')}, n_{kind}_{shape}))")
            c.body.append(f"    n_{kind}_{shape} = n_{kind}_{shape} + {bits // 4 + 1}")
            c.body.append("  }")
            n = 0
            while n < bits + 3:
                c.logs += [str(w) for w in words(f(VECS["b16"], n))]
                n += bits // 4 + 1
    c.write()


def gen_lanes():
    c = Case("int-lanes.vl", [
        "Splat, extract_lane (signed and unsigned) and replace_lane for every integer shape, each",
        "lane index a literal; the widening, splatting and zeroing loads; and i8x16.shuffle,",
        "whose sixteen literal indices pick bytes 0..15 of the first vector and 16..31 of the second.",
    ])
    a = VECS["a8"]
    for shape, bits in SHAPES.items():
        n = 128 // bits
        for sg, signed in ((("s", True), ("u", False)) if bits < 32 else (("", True),)):
            nm = f"__extract_lane_{sg}_{shape}__" if sg else f"__extract_lane_{shape}__"
            src = "a8" if bits < 64 else "a64"
            for i in range(n):
                c.scalar(f"{nm}({c.vec(src)}, {i})", lanes(VECS[src], bits, signed)[i])
    for shape, bits in (("i8x16", 8), ("i16x8", 16), ("i32x4", 32)):
        for x in (0, 1, -1, 127, 128, 255, 256, 32767, 32768, 65535, 65536, -(1 << 31)):
            c.show(f"__splat_{shape}__({i32lit(x)})", pack([x] * (128 // bits), bits))
        n = 128 // bits
        for i in range(n):
            ls = lanes(a, bits, False)
            ls[i] = -2 - i
            c.show(f"__replace_lane_{shape}__({c.vec('a8')}, {i}, {-2 - i})", pack(ls, bits))
    # the i64x2 lane ops take and give an i64
    c.body.append("  const big = -9223372036854775807 - 1")
    c.body.append("  const odd = 81985529216486895")
    c.show("__splat_i64x2__(big)", pack([-(1 << 63)] * 2, 64))
    c.show("__splat_i64x2__(odd)", pack([81985529216486895] * 2, 64))
    c.show(f"__replace_lane_i64x2__({c.vec('a64')}, 0, odd)", pack([81985529216486895, -(1 << 63)], 64))
    c.show(f"__replace_lane_i64x2__({c.vec('a64')}, 1, odd)", pack([(1 << 63) - 1, 81985529216486895], 64))
    c.scalar("__extract_lane_i64x2__(__splat_i64x2__(odd), 1) + 1", 81985529216486896)
    # loads: the 16 bytes of a8 at byte 32, then each load form at byte 32 (and 36, unaligned)
    c.body.append("  __store_v128__(32, a8)")
    c.used.add("a8")
    mem = VECS["a8"] + bytes(16)
    # a splat of a value read at run time, which no optimizer can fold to a constant
    w0 = lanes(VECS["a8"], 32, True)[0]
    for shape, bits in (("i8x16", 8), ("i16x8", 16), ("i32x4", 32)):
        c.show(f"__splat_{shape}__(__load_i32__(32))", pack([w0] * (128 // bits), bits))
    c.show("__splat_i64x2__(__load_i64__(32))", VECS["a8"][:8] * 2)
    for off in (32, 37):
        m = mem[off - 32:]
        for nm, val in (
            ("__load8x8_s_v128__", pack(lanes(m[:8] + bytes(8), 8, True)[:8], 16)),
            ("__load8x8_u_v128__", pack(lanes(m[:8] + bytes(8), 8, False)[:8], 16)),
            ("__load16x4_s_v128__", pack(lanes(m[:8] + bytes(8), 16, True)[:4], 32)),
            ("__load16x4_u_v128__", pack(lanes(m[:8] + bytes(8), 16, False)[:4], 32)),
            ("__load32x2_s_v128__", pack(lanes(m[:8] + bytes(8), 32, True)[:2], 64)),
            ("__load32x2_u_v128__", pack(lanes(m[:8] + bytes(8), 32, False)[:2], 64)),
            ("__load8_splat_v128__", m[:1] * 16),
            ("__load16_splat_v128__", m[:2] * 8),
            ("__load32_splat_v128__", m[:4] * 4),
            ("__load64_splat_v128__", m[:8] * 2),
            ("__load32_zero_v128__", m[:4] + bytes(12)),
            ("__load64_zero_v128__", m[:8] + bytes(8)),
            ("__load_v128__", m[:16]),
        ):
            c.show(f"{nm}({off})", val)
    # shuffles: identity, the other vector, an interleave, a reversal, one lane everywhere
    b = VECS["b8"]
    ab = VECS["a8"] + b
    for idx in (list(range(16)), list(range(16, 32)),
                [i // 2 + (16 if i % 2 else 0) for i in range(16)],
                list(range(31, 15, -1)), [5] * 16, [0, 31] * 8):
        c.show(f"__shuffle_i8x16__({c.vec('a8')}, {c.vec('b8')}, {', '.join(map(str, idx))})",
               bytes(ab[i] for i in idx))
    # bitselect takes the first vector's bit where the mask bit is set
    c.show(f"__bitselect_v128__({c.vec('a8')}, {c.vec('b8')}, {c.vec('a16')})",
           bytes((x & m) | (y & ~m & 0xff) for x, y, m in zip(VECS["a8"], VECS["b8"], VECS["a16"])))
    c.write()


def check_coverage():
    """Every non-f32x4 row of the compiler's intrinsic table appears in a generated case."""
    src = open(os.path.join(HERE, "..", "compiler", "typecheck.vl")).read()
    body = src[src.index("function simdTableBuild()"):]
    body = body[:body.index("\n}\n")]
    names = set(re.findall(r'"(__[a-z0-9_]+__)"', body))
    text = "".join(open(os.path.join(OUT, f)).read() for f in os.listdir(OUT) if f.startswith("int-"))
    missing = sorted(n for n in names if "f32x4__" not in n and n + "(" not in text)
    if missing:
        raise SystemExit("rows with no generated case: " + ", ".join(missing))


if __name__ == "__main__":
    gen_binary()
    gen_unary()
    gen_shift()
    gen_lanes()
    check_coverage()
