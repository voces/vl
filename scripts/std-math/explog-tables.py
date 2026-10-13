"""Derive the tables, split constants and minimax coefficients behind std:math's exp/log/pow.

Prints every literal std/math.vl uses for them, so a reviewer can regenerate and diff:

  - 2^(j/32) for j in 0..31 as a double-double (EXP2_HI, EXP2_LO);
  - ln2/32 split for an exact k*hi (LN2N_HI, LN2N_LO) and 32/ln2;
  - ln2 split for an exact k*hi (LN2_HI, LN2_LO);
  - the 32 log buckets: 1/c with at most 21 significant bits (INV_C) and -ln(INV_C) as a
    double-double (LOGC_HI, LOGC_LO), bucket 18 exactly 1 so log stays relative near x = 1;
  - Remez fits: e^r - 1 - r = r^2 Q(r) at both widths, log1p(r) - r + r^2/2 = r^3 P(r) at both.

Needs mpmath. `python3 scripts/std-math/explog-tables.py`
"""
import struct
import mpmath as mp

mp.mp.dps = 60


def bits(x):
    return struct.unpack('<q', struct.pack('<d', x))[0]


def frombits(b):
    return struct.unpack('<d', struct.pack('<q', b))[0]


def trunc_bits(x, keep):
    # keep the top `keep` significand bits (implicit one included) of a double
    drop = 53 - keep
    return frombits(bits(x) & ~((1 << drop) - 1))


def dd(v):
    hi = float(v)
    lo = float(v - mp.mpf(hi))
    return hi, lo


def remez(f, w, a, b, n, iters=40, N=6000):
    """Minimise max |w(z) (sum c_i z^i - f(z))| over [a, b] at degree n."""
    m = n + 2
    ref = [(a + b) / 2 - (b - a) / 2 * mp.cos(mp.pi * k / (m - 1)) for k in range(m)]
    grid = [a + (b - a) * mp.mpf(k) / N for k in range(N + 1)]
    c, maxe = None, None
    for _ in range(iters):
        A = mp.matrix(m, m)
        rhs = mp.matrix(m, 1)
        for i, z in enumerate(ref):
            for j in range(n + 1):
                A[i, j] = z ** j
            A[i, n + 1] = (-1) ** i / w(z)
            rhs[i] = f(z)
        sol = mp.lu_solve(A, rhs)
        c = [sol[j] for j in range(n + 1)]

        def err(z):
            return w(z) * (mp.polyval(c[::-1], z) - f(z))
        es = [err(z) for z in grid]
        ext = []
        for k in range(len(grid)):
            e = es[k]
            l = es[k - 1] if k > 0 else None
            r = es[k + 1] if k < len(grid) - 1 else None
            if (l is None or abs(e) >= abs(l)) and (r is None or abs(e) >= abs(r)):
                ext.append((grid[k], e))
        alt = []
        for z, e in ext:
            if alt and mp.sign(alt[-1][1]) == mp.sign(e):
                if abs(e) > abs(alt[-1][1]):
                    alt[-1] = (z, e)
            else:
                alt.append((z, e))
        while len(alt) > m:
            if abs(alt[0][1]) < abs(alt[-1][1]):
                alt.pop(0)
            else:
                alt.pop()
        maxe = max(abs(e) for e in es)
        if len(alt) != m:
            break
        ref = [z for z, _ in alt]
    return [float(x) for x in c], maxe


def check_fit(c, f, w, a, b, N=20000):
    # the error of the ROUNDED coefficients, which is what ships
    worst = mp.mpf(0)
    for k in range(N + 1):
        z = a + (b - a) * mp.mpf(k) / N
        worst = max(worst, abs(w(z) * (mp.polyval([mp.mpf(x) for x in c[::-1]], z) - f(z))))
    return worst


def lit(x):
    return repr(x)


LN2 = mp.log(2)
print('# exp: 2^(j/32), double-double')
hi, lo = [], []
for j in range(32):
    h, l = dd(mp.power(2, mp.mpf(j) / 32))
    hi.append(h)
    lo.append(l)
print('EXP2_HI', [lit(x) for x in hi])
print('EXP2_LO', [lit(x) for x in lo])

# |k| < 2^16 for every argument exp reduces, so 37 bits keep k*LN2N_HI exact.
ln2n_hi = trunc_bits(float(LN2 / 32), 37)
ln2n_lo = float(LN2 / 32 - mp.mpf(ln2n_hi))
print('INV_LN2N', lit(float(32 / LN2)))
print('LN2N_HI', lit(ln2n_hi), 'LN2N_LO', lit(ln2n_lo))
# |k| <= 1130 for every log (exponent plus subnormal shift), so 42 bits keep k*LN2_HI exact.
ln2_hi = trunc_bits(float(LN2), 42)
ln2_lo = float(LN2 - mp.mpf(ln2_hi))
print('LN2_HI', lit(ln2_hi), 'LN2_LO', lit(ln2_lo))

print('# log buckets')
OFF = 0x3FE6C00000000000
invc, logc_hi, logc_lo = [], [], []
rmin, rmax = mp.mpf(0), mp.mpf(0)
for i in range(32):
    # bucket i holds z with bits in OFF + [i, i+1) * 2^47, z in [OFF, 2 OFF) as a value
    b0 = OFF + (i << 47)
    b1 = OFF + ((i + 1) << 47)
    z0 = mp.mpf(frombits(b0))
    z1 = mp.mpf(frombits(b1 - 1))
    if i == 18:
        ic = 1.0
    else:
        # the 1/c that centres r on the bucket, then rounded to 21 significant bits
        ic = float(2 / (z0 + z1))
        ic = frombits((bits(ic) + (1 << 31)) & ~((1 << 32) - 1))
    lo_r = z0 * mp.mpf(ic) - 1
    hi_r = z1 * mp.mpf(ic) - 1
    rmin = min(rmin, lo_r)
    rmax = max(rmax, hi_r)
    h, l = dd(-mp.log(mp.mpf(ic)))
    invc.append(ic)
    logc_hi.append(h)
    logc_lo.append(l)
print('INV_C', [lit(x) for x in invc])
print('LOGC_HI', [lit(x) for x in logc_hi])
print('LOGC_LO', [lit(x) for x in logc_lo])
print('log r range', mp.nstr(rmin, 8), mp.nstr(rmax, 8))
assert bits(1.0) - OFF == (18 << 47) + (1 << 46), 'bucket 18 must be centred on 1.0'

ER = mp.mpf(0.0109)  # |r| bound for exp, with room for pow's tail


def show(name, c, e):
    print(name, 'err log2', mp.nstr(mp.log(e, 2), 5), [lit(x) for x in c])


# exp: e^r - 1 - r = r^2 Q(r); absolute error (the result is ~1)
fq = lambda r: (mp.expm1(r) - r) / r ** 2 if r != 0 else mp.mpf(0.5)
wq = lambda r: r ** 2
for name, deg in (('EXP_Q64', 4), ('EXP_Q32', 2)):
    c, _ = remez(fq, wq, -ER, ER, deg)
    show(name, c, check_fit(c, fq, wq, -ER, ER))

# log: log1p(r) - r + r^2/2 = r^3 P(r); error relative to r, since log x ~ r near x = 1
a, b = rmin * mp.mpf(1.0001), rmax * mp.mpf(1.0001)
fp = lambda r: (mp.log1p(r) - r + r ** 2 / 2) / r ** 3 if r != 0 else mp.mpf(1) / 3
wp = lambda r: r ** 2 if r != 0 else mp.mpf(0)
for name, deg in (('LOG_P64', 7), ('LOG_P32', 3)):
    c, _ = remez(fp, wp, a, b, deg)
    show(name, c, check_fit(c, fp, wp, a, b))
