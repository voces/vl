# Reduced depth AND reduced repeat count. CPython has no tail-call elimination
# and its default recursion limit is 1000, so depth 5_000 raises RecursionError;
# the limit is NOT raised here -- the depth is reduced to 900 instead.
def digestTail(n, acc):
    if n == 0:
        return acc
    return digestTail(n - 1, (acc * 3 + n) & 1_048_575)


acc = 0
for r in range(10_000):
    acc = digestTail(900, acc)

print(acc)
