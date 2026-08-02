# Reduced repeat count only -- the recursion depth (max 800) is the SAME as the
# other three and fits CPython's default recursion limit of 1000 unchanged.
def evenStep(n, s):
    if n == 0:
        return s
    return oddStep(n - 1, (s * 3 + 1) & 1_048_575)


def oddStep(n, s):
    if n == 0:
        return (s * 7 + 5) & 1_048_575
    return evenStep(n - 1, (s * 5 + 2) & 1_048_575)


acc = 0
for r in range(50):
    for i in range(800):
        acc = evenStep(i + (acc & 1), acc)

print(acc)
