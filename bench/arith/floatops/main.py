import math


def main():
    n = 2_000_000
    s = 0.0
    for i in range(n):
        t = float(i & 1023) + 0.5
        term = (math.sqrt(t)
                + abs(t - 512.0) * 0.001
                + math.floor(t * 0.25) * 0.001
                + min(t, 100.0) * 0.001
                + max(t, 900.0) * 0.001)
        s += term
    print(s)


main()
