# Reduced depth AND reduced repeat count. CPython's default recursion limit is
# 1000 (sys.getrecursionlimit()), so depth 5_000 raises RecursionError; the
# limit is NOT raised here -- the depth is reduced to 900 instead.
def digest(n, seed):
    if n == 0:
        return seed
    return (digest(n - 1, seed) * 3 + n) & 1_048_575


acc = 0
for r in range(10_000):
    acc = digest(900, acc)

print(acc)
