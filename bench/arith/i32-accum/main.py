def main():
    n = 10_000_000
    s = 0
    for i in range(n):
        s += i & 65535
    # pure addition, so a single mod-2^32 fold at the end equals per-step i32 wrapping
    s &= 0xFFFFFFFF
    print(s - 0x100000000 if s >= 0x80000000 else s)


main()
