"""Grade a trig-grid.vl transcript against mpmath: max/mean ulp error per width, function and
argument range. Exits 1 if any finite point misses the documented 1-ulp bound, or a non-finite
input does not give NaN, or sin(+-0) loses its sign."""
import sys, struct, math, multiprocessing as mpc
import mpmath as mp

def f64(b):
    return struct.unpack('<d', struct.pack('<q', b))[0]

def f32(b):
    return struct.unpack('<f', struct.pack('<i', b))[0]

def ulp_err(y, ref, width):
    # |y - ref| in ulps of the correctly rounded ref's binade
    if ref == 0:
        return 0.0 if y == 0 else float('inf')
    e = int(mp.floor(mp.log(abs(ref), 2)))
    if width == 64:
        e = max(e, -1022); u = mp.ldexp(1, e - 52)
    else:
        e = max(e, -126); u = mp.ldexp(1, e - 23)
    return float(abs(mp.mpf(y) - ref) / u)

def work(lines):
    out = []
    for ln in lines:
        k, xb, sb, cb = ln.split()
        xb, sb, cb = int(xb), int(sb), int(cb)
        if k == 'D':
            x, s, c, w = f64(xb), f64(sb), f64(cb), 64
        else:
            x, s, c, w = f32(xb), f32(sb), f32(cb), 32
        if math.isnan(x) or math.isinf(x):
            ok = math.isnan(s) and math.isnan(c)
            out.append((k, x, 0.0 if ok else float('inf'), 0.0 if ok else float('inf'), sb, cb))
            continue
        e = max(0, math.frexp(x)[1]) if x != 0 else 0
        with mp.workprec(e + 200):
            X = mp.mpf(x)
            rs, rc = mp.sin(X), mp.cos(X)
            es, ec = ulp_err(s, rs, w), ulp_err(c, rc, w)
        if x == 0 and math.copysign(1, s) != math.copysign(1, x):
            es = float('inf')
        out.append((k, x, es, ec, sb, cb))
    return out

def section(k, x):
    ax = abs(x)
    if math.isnan(x) or math.isinf(x): return 'nonfinite'
    if ax <= math.pi / 4: return '|x|<=pi/4'
    if ax < 1647099.0: return 'pi/4<|x|<1.6e6'
    return '|x|>=1.6e6'

if __name__ == '__main__':
    lines = open(sys.argv[1]).read().split('\n')
    lines = [l for l in lines if l]
    chunks = [lines[i:i + 20000] for i in range(0, len(lines), 20000)]
    stats = {}
    worst = {}
    with mpc.Pool(14) as p:
        for res in p.imap_unordered(work, chunks):
            for k, x, es, ec, sb, cb in res:
                sec = section(k, x)
                for fn, e in (('sin', es), ('cos', ec)):
                    key = (k, fn, sec)
                    n, mx, tot, over05 = stats.get(key, (0, 0.0, 0.0, 0))
                    stats[key] = (n + 1, max(mx, e), tot + e, over05 + (e > 0.5))
                    if e >= worst.get(key, (-1,))[0]:
                        worst[key] = (e, x)
    print(f"{'w':2} {'fn':3} {'section':16} {'points':>8} {'max ulp':>9} {'mean ulp':>9} {'>0.5ulp':>8}  worst x")
    for key in sorted(stats):
        n, mx, tot, o = stats[key]
        print(f"{key[0]:2} {key[1]:3} {key[2]:16} {n:8d} {mx:9.4f} {tot/n:9.4f} {o:8d}  {worst[key][1]!r}")
    over = [k for k in stats if stats[k][1] >= 1.0]
    if over:
        print("BOUND MISSED (>= 1 ulp):", over)
        sys.exit(1)
    print("all points within the documented 1-ulp bound")
