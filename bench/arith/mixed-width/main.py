def main():
    n = 3_000_000
    si = 0
    sl = 0
    sf = 0.0
    for i in range(n):
        si += i & 1023
        sl += (i & 4095) * 7
        sf += float(i & 63) * 0.1
    si &= 0xFFFFFFFF
    print(si - 0x100000000 if si >= 0x80000000 else si)
    print(sl)
    print(sf)


main()
