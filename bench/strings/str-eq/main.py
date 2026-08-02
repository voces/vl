# str-eq — see main.vl
# NOTE: CPython's `==` on str starts with an object-identity check, so phase A
# is a pointer compare there too. Python str is unicode; input is ASCII.
# REPS is reduced 8x vs the other three (see meta.json nPython/expectPython).
ALPHA = "abcdefghijklmnopqrstuvwxyz"

LEN = 64
GROUPS = 8
REPS = 750000


def mk(seed, flip):
    s = ""
    for i in range(LEN):
        k = (i * 7 + seed * 13) % 26
        if i == flip:
            k = (k + 1) % 26
        s = s + ALPHA[k:k + 1]
    return s


def main():
    base, ident, copy, first, last = [], [], [], [], []
    for j in range(GROUPS):
        base.append(mk(j, -1))
        copy.append(mk(j, -1))
        if j % 2 == 0:
            first.append(mk(j, -1))
        else:
            first.append(mk(j, 0))
        if j < 5:
            last.append(mk(j, -1))
        else:
            last.append(mk(j, LEN - 1))
    for j in range(GROUPS):
        ident.append(base[j])

    c_a = 0
    for i in range(REPS):
        q = i % GROUPS
        if base[q] == ident[q]:
            c_a = c_a + 1
    c_b = 0
    for i in range(REPS):
        q = i % GROUPS
        if base[q] == copy[q]:
            c_b = c_b + 1
    c_c = 0
    for i in range(REPS):
        q = i % GROUPS
        if base[q] == first[q]:
            c_c = c_c + 1
    c_d = 0
    for i in range(REPS):
        q = i % GROUPS
        if base[q] == last[q]:
            c_d = c_d + 1
    print(c_a)
    print(c_b)
    print(c_c)
    print(c_d)


main()
