def main():
    n = 3_000_000
    s = 0.0
    x = 0.5
    for _ in range(n):
        x = x * 3.9 * (1.0 - x)
        s += x
    print(s)


main()
