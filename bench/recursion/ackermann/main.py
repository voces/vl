# Reduced m/n AND reduced repeat count. ack(3,10) recurses 8_190 frames deep,
# far past CPython's default recursion limit of 1000; the limit is NOT raised
# here -- the argument is reduced to ack(3,6)/ack(3,5) (peak depth 510) instead.
def ack(m, n):
    if m == 0:
        return n + 1
    if n == 0:
        return ack(m - 1, 1)
    return ack(m - 1, ack(m, n - 1))


acc = 0
for r in range(200):
    acc = (acc + ack(3, 6 - (acc & 1))) % 1_000_003

print(acc)
