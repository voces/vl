# Reduced inner bound: CPython is ~100x slower per iteration than the compiled
# runtimes. The outer loop count is the same 2.
acc = 0
for r in range(2):
    for i in range(6_000_000):
        acc = ((acc ^ i) * 3 + 1) & 1_048_575

print(acc)
