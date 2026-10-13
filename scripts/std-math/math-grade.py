"""Grade a math-grid.vl transcript against mpmath: max/mean ulp error per function, width and
section. Exits 1 if any finite point misses the documented 1-ulp bound, an exact power does
not come out exact, or an IEEE 754 edge case (NaN, infinity, signed zero) is wrong."""
import sys, struct, math, multiprocessing as mpc
import mpmath as mp

F64_NAN = 0x7FF8000000000000
F32_NAN = 0x7FC00000


def f64(b):
    return struct.unpack('<d', struct.pack('<q', b))[0]


def f32(b):
    return struct.unpack('<f', struct.pack('<i', b))[0]


def ieee_exp(x):
    if math.isnan(x): return math.nan
    if x == math.inf: return math.inf
    if x == -math.inf: return 0.0
    return None


def ieee_log(x):
    if math.isnan(x) or x < 0: return math.nan
    if x == 0: return -math.inf
    if x == math.inf: return math.inf
    if x == 1: return 0.0
    return None


def ieee_pow(x, y):
    """C99 Annex F / IEEE 754 pow for every pair not computed by the kernel; None otherwise."""
    if y == 0 or x == 1: return 1.0
    if math.isnan(x) or math.isnan(y): return math.nan
    if math.isinf(y):
        if abs(x) == 1: return 1.0
        return math.inf if (abs(x) > 1) == (y > 0) else 0.0
    yint = y == math.floor(y)
    yodd = yint and abs(y) < 2.0 ** 53 and int(y) % 2 == 1
    neg = math.copysign(1.0, x) < 0
    if x == 0:
        m = math.inf if y < 0 else 0.0
        return -m if (yodd and neg) else m
    if math.isinf(x):
        m = math.inf if y > 0 else 0.0
        return -m if (yodd and neg) else m
    if x < 0 and not yint: return math.nan
    return None


def ieee_atan(x):
    if math.isnan(x): return math.nan
    if math.isinf(x): return math.copysign(math.pi / 2, x)
    if x == 0: return x
    return None


def ieee_asin(x):
    if math.isnan(x) or abs(x) > 1: return math.nan
    if x == 0: return x
    return None


def ieee_acos(x):
    if math.isnan(x) or abs(x) > 1: return math.nan
    if x == 1: return 0.0
    return None


def ieee_atan2(y, x):
    if math.isnan(x) or math.isnan(y): return math.nan
    neg_x = math.copysign(1.0, x) < 0
    if math.isinf(x):
        if math.isinf(y):
            m = float(3 * mp.pi / 4) if neg_x else math.pi / 4
        else:
            m = math.pi if neg_x else 0.0
        return math.copysign(m, y)
    if y == 0: return math.copysign(math.pi if neg_x else 0.0, y)
    if x == 0 or math.isinf(y): return math.copysign(math.pi / 2, y)
    return None


def ieee_hypot(x, y):
    if math.isinf(x) or math.isinf(y): return math.inf
    if math.isnan(x) or math.isnan(y): return math.nan
    if x == 0 and y == 0: return 0.0
    return None


UNARY = {'E': (ieee_exp, mp.exp), 'L': (ieee_log, mp.log), 'A': (ieee_atan, mp.atan),
         'S': (ieee_asin, mp.asin), 'C': (ieee_acos, mp.acos)}
BINARY = {'P': ieee_pow, 'T': ieee_atan2, 'H': ieee_hypot}


def ulp_err(y, ref, w):
    """|y - ref| in ulps of ref's binade, with the width's overflow and subnormal floors."""
    top = mp.ldexp(1, 1024) * (1 - mp.ldexp(1, -54)) if w == 64 else mp.ldexp(1, 128) * (1 - mp.ldexp(1, -25))
    if abs(ref) >= top:
        return 0.0 if (math.isinf(y) and (y > 0) == (ref > 0)) else math.inf
    if math.isinf(y) or math.isnan(y):
        return math.inf
    if ref == 0:
        return 0.0 if y == 0 else math.inf
    e = int(mp.floor(mp.log(abs(ref), 2)))
    if w == 64:
        u = mp.ldexp(1, max(e, -1022) - 52)
    else:
        u = mp.ldexp(1, max(e, -126) - 23)
    return float(abs(mp.mpf(y) - ref) / u)


def bits_of(v, w):
    if w == 64:
        return struct.unpack('<q', struct.pack('<d', v))[0]
    return struct.unpack('<i', struct.pack('<f', v))[0]


def representable(ref, w):
    if abs(ref) > 1e300 or (ref != 0 and abs(ref) < 1e-300):
        return False
    v = float(ref)
    if w == 32:
        if abs(v) > 3.4e38:
            return False
        v = struct.unpack('<f', struct.pack('<f', v))[0]
    return mp.mpf(v) == ref


def special_err(got_bits, want, w):
    if math.isnan(want):
        return 0.0 if got_bits == (F64_NAN if w == 64 else F32_NAN) else math.inf
    return 0.0 if got_bits == bits_of(want, w) else math.inf


def work(lines):
    out = []
    for ln in lines:
        p = ln.split()
        k = p[0]
        w = 64 if k.isupper() else 32
        cv = f64 if w == 64 else f32
        fn = k.upper()
        if fn in BINARY:
            x, y, gb = cv(int(p[1])), cv(int(p[2])), int(p[3])
            want = BINARY[fn](x, y)
        else:
            x, y, gb = cv(int(p[1])), None, int(p[2])
            want = UNARY[fn][0](x)
        got = cv(gb)
        if want is not None:
            out.append((fn, w, 'edge', special_err(gb, want, w), False))
            continue
        with mp.workprec(256):
            X = mp.mpf(x)
            if fn in UNARY:
                ref = UNARY[fn][1](X)
            elif fn == 'T':
                ref = mp.atan2(X, mp.mpf(y))
            elif fn == 'H':
                ref = mp.hypot(X, mp.mpf(y))
            else:
                ref = mp.power(abs(X), mp.mpf(y))
                if x < 0 and int(y) % 2 == 1:
                    ref = -ref
            err = ulp_err(got, ref, w)
            if ref != 0 and got == 0 and math.copysign(1, got) != (1 if ref > 0 else -1):
                err = math.inf
            exact_miss = False
            if fn == 'P' and x == int(x) and y == int(y):
                # an exact result that is a double must come back exactly
                exact_miss = representable(ref, w) and mp.mpf(got) != ref
        tiny = abs(ref) < (mp.ldexp(1, -1022) if w == 64 else mp.ldexp(1, -126))
        out.append((fn, w, 'subnormal' if tiny else 'normal', err, exact_miss))
    return out


if __name__ == '__main__':
    lines = [l for l in open(sys.argv[1]).read().split('\n') if l]
    chunks = [lines[i:i + 20000] for i in range(0, len(lines), 20000)]
    stats = {}
    misses = 0
    with mpc.Pool(14) as pool:
        for res in pool.imap_unordered(work, chunks):
            for fn, w, sec, e, miss in res:
                key = (fn, w, sec)
                n, mx, tot, o = stats.get(key, (0, 0.0, 0.0, 0))
                stats[key] = (n + 1, max(mx, e), tot + e, o + (e > 0.5))
                misses += miss
    names = {'E': 'exp', 'L': 'log', 'P': 'pow', 'A': 'atan', 'S': 'asin', 'C': 'acos',
             'T': 'atan2', 'H': 'hypot'}
    print(f"{'fn':5} {'w':2} {'section':9} {'points':>9} {'max ulp':>9} {'mean ulp':>9} {'>0.5ulp':>8}")
    for key in sorted(stats):
        n, mx, tot, o = stats[key]
        print(f"{names[key[0]]:5} {key[1]:2} {key[2]:9} {n:9d} {mx:9.4f} {tot / n:9.4f} {o:8d}")
    bad = [k for k in stats if stats[k][1] >= 1.0]
    if bad or misses:
        print('BOUND MISSED (>= 1 ulp, or a wrong edge case):', bad, 'inexact exact powers:', misses)
        sys.exit(1)
    print('all points within the documented 1-ulp bound; every edge case as IEEE 754 specifies')
