"""Derive the constants and minimax coefficients behind std:math's atan/atan2/asin/acos.

atan(u) = u + u^3 P(u^2) on |u| <= 7/16, the widest reduced argument. The f64 fit is graded
relative to atan(u) (the f64 kernel carries a double-double); the f32 fit to ~2^-36.
Prints every literal std/math.vl uses for them. Needs mpmath.

  python3 scripts/std-math/arc-tables.py
"""
import importlib.util
import os
import mpmath as mp

spec = importlib.util.spec_from_file_location(
    'explog', os.path.join(os.path.dirname(__file__), 'explog-tables.py'))
mp.mp.dps = 60
# reuse the Remez exchange and the coefficient check without re-running explog's fits
src = open(spec.origin).read().split("LN2 = mp.log(2)")[0]
ns = {}
exec(src, ns)
remez, check_fit = ns['remez'], ns['check_fit']


def dd(v):
    hi = float(v)
    return hi, float(v - mp.mpf(hi))


for name, v in (('ATAN_HALF', mp.atan(mp.mpf(1) / 2)), ('PIO4', mp.pi / 4),
                ('PIO2', mp.pi / 2), ('PI', mp.pi)):
    print(name, [repr(x) for x in dd(v)])
print('THREE_PIO4', repr(float(3 * mp.pi / 4)))

hi = (mp.mpf(7) / 16) ** 2
lo = mp.mpf('1e-30')
f = lambda z: (mp.atan(mp.sqrt(z)) - mp.sqrt(z)) / z ** mp.mpf(1.5)
w = lambda z: z ** mp.mpf(1.5) / mp.atan(mp.sqrt(z))
for name, deg in (('ATAN_P64', 10), ('ATAN_P32', 6)):
    c, _ = remez(f, w, lo, hi, deg)
    e = check_fit(c, f, w, lo, hi)
    print(name, 'err log2', mp.nstr(mp.log(e, 2), 5), [repr(x) for x in c])
