# mandelbrot — adapted from the Computer Language Benchmarks Game `mandelbrot`
# program. Idiomatic Python: plain scalar loops over a list row buffer. No
# numpy (numpy would measure C, not Python).
#
# ADAPTATION: prints a text summary (in-set pixel count + rolling checksum mod
# 1000000007 over the packed bytes) instead of a binary PBM, so all four
# languages produce identical stdout.

import sys


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 1000
    w = n
    h = n
    iters = 50
    limit = 4.0

    row_bytes = w // 8
    row = [0] * row_bytes

    in_set = 0
    checksum = 0

    for y in range(h):
        ci = 2.0 * y / h - 1.0
        byte_acc = 0
        bit_num = 0
        byte_pos = 0
        for x in range(w):
            cr = 2.0 * x / w - 1.5
            zr = 0.0
            zi = 0.0
            tr = 0.0
            ti = 0.0
            i = 0
            while i < iters:
                if tr + ti > limit:
                    break
                zi = 2.0 * zr * zi + ci
                zr = tr - ti + cr
                tr = zr * zr
                ti = zi * zi
                i += 1
            byte_acc <<= 1
            if tr + ti <= limit:
                byte_acc |= 1
                in_set += 1
            bit_num += 1
            if bit_num == 8:
                row[byte_pos] = byte_acc
                byte_pos += 1
                byte_acc = 0
                bit_num = 0
        for b in range(row_bytes):
            checksum = (checksum * 31 + row[b]) % 1000000007

    print(in_set)
    print(checksum)


main()
