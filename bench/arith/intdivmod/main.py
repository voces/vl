def main():
    n = 2_000_000
    s = 0
    for i in range(n):
        d = (i & 1023) + 1
        s += i // d + i % d
    s &= 0xFFFFFFFF
    print(s - 0x100000000 if s >= 0x80000000 else s)


main()
