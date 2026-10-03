import mpmath as mp
import sys
mp.mp.dps = 80

def remez(f, w, a, b, n, iters=30, N=4000):
    # minimise max |w(z) * (sum c_i z^i - f(z))| over [a,b], degree n
    m = n + 2
    # Chebyshev initial reference
    ref = [ (a+b)/2 - (b-a)/2*mp.cos(mp.pi*k/(m-1)) for k in range(m)]
    grid = [a + (b-a)*(mp.mpf(k)/N)**1 for k in range(N+1)]
    for it in range(iters):
        A = mp.matrix(m, m); rhs = mp.matrix(m, 1)
        for i, z in enumerate(ref):
            for j in range(n+1):
                A[i, j] = z**j
            A[i, n+1] = (-1)**i / w(z)
            rhs[i] = f(z)
        sol = mp.lu_solve(A, rhs)
        c = [sol[j] for j in range(n+1)]; E = sol[n+1]
        def err(z):
            return w(z)*(mp.polyval(c[::-1], z) - f(z))
        es = [err(z) for z in grid]
        # find local extrema with alternation
        ext = []
        for k in range(len(grid)):
            e = es[k]
            l = es[k-1] if k > 0 else None
            r = es[k+1] if k < len(grid)-1 else None
            if (l is None or abs(e) >= abs(l)) and (r is None or abs(e) >= abs(r)):
                ext.append((grid[k], e))
        # enforce alternation: merge same-sign neighbours keeping larger
        alt = []
        for z, e in ext:
            if alt and mp.sign(alt[-1][1]) == mp.sign(e):
                if abs(e) > abs(alt[-1][1]):
                    alt[-1] = (z, e)
            else:
                alt.append((z, e))
        while len(alt) > m:
            # drop the smaller end
            if abs(alt[0][1]) < abs(alt[-1][1]):
                alt.pop(0)
            else:
                alt.pop()
        maxe = max(abs(e) for e in es)
        if len(alt) == m:
            ref = [z for z, _ in alt]
        else:
            break
    return c, maxe

def show(name, c, maxe):
    print(name, "maxerr", mp.nstr(maxe, 5), "log2", mp.nstr(mp.log(maxe, 2), 5))
    for x in c:
        print("  ", repr(float(x)))

hi = (mp.pi/4)**2
lo = mp.mpf('1e-30')
which = sys.argv[1]
if which == 'sin64':
    # sin x = x + x^3 P(z): P(z) = (sin sqrt z - sqrt z)/z^1.5 ; rel err of sin
    f = lambda z: (mp.sin(mp.sqrt(z)) - mp.sqrt(z)) / z**mp.mpf(1.5)
    w = lambda z: z**mp.mpf(1.5) / mp.sin(mp.sqrt(z))
    c, e = remez(f, w, lo, hi, 5); show('sin64', c, e)
if which == 'cos64':
    # cos x = 1 - z/2 + z^2 Q(z)
    f = lambda z: (mp.cos(mp.sqrt(z)) - 1 + z/2) / z**2
    w = lambda z: z**2 / mp.cos(mp.sqrt(z))
    c, e = remez(f, w, lo, hi, 5); show('cos64', c, e)
if which == 'sin32':
    f = lambda z: (mp.sin(mp.sqrt(z)) - mp.sqrt(z)) / z**mp.mpf(1.5)
    w = lambda z: z**mp.mpf(1.5) / mp.sin(mp.sqrt(z))
    c, e = remez(f, w, lo, hi, 3); show('sin32', c, e)
if which == 'cos32':
    f = lambda z: (mp.cos(mp.sqrt(z)) - 1) / z
    w = lambda z: z / mp.cos(mp.sqrt(z))
    c, e = remez(f, w, lo, hi, 3); show('cos32', c, e)
