def main():
    n = 10_000_000
    s = 0
    for i in range(n):
        s += i & 65535
    print(s)


main()
