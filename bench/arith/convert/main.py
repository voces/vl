def main():
    n = 4_000_000
    s = 0
    for i in range(n):
        f = float(i & 65535)
        k = int(f * 1.5 + 0.25)
        s += k
    print(s)


main()
