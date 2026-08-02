# Reduced inner bound: CPython is ~100x slower per iteration than the compiled
# runtimes. The outer loop count is the same 2.
def step(x):
    return (x * 3 + 1) & 1_048_575


acc = 0
for r in range(2):
    for i in range(6_000_000):
        acc = step(acc ^ i)

print(acc)
