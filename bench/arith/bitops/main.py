M = 0xFFFFFFFF


def main():
    n = 2_000_000
    x = 123456789
    s = 0
    for _ in range(n):
        x = (x ^ (x << 13)) & M
        x = x ^ (x >> 17)
        x = (x ^ (x << 5)) & M
        x = ((x << 7) | (x >> 25)) & M  # Python has no rotate primitive
        s += (x & 65535) | (x >> 24)
    s &= M
    print(s - 0x100000000 if s >= 0x80000000 else s)


main()
