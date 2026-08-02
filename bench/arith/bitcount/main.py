def main():
    n = 2_000_000
    s = 0
    for i in range(n):
        v = i + 1
        s += v.bit_count() + (32 - v.bit_length()) + ((v & -v).bit_length() - 1)
    print(s)


main()
