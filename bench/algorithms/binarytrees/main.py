# binary-trees — adapted from the Computer Language Benchmarks Game
# `binarytrees` program (the single-threaded, no-arena reference shape).
# Idiomatic Python: a small class with __slots__, recursive build and check.

import sys

sys.setrecursionlimit(100000)


class Node:
    __slots__ = ("left", "right")

    def __init__(self, left, right):
        self.left = left
        self.right = right


def bottom_up_tree(depth):
    if depth == 0:
        return Node(None, None)
    return Node(bottom_up_tree(depth - 1), bottom_up_tree(depth - 1))


def item_check(node):
    l = node.left
    if l is None:
        return 1
    r = node.right
    if r is None:
        return 1
    return 1 + item_check(l) + item_check(r)


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 16
    min_depth = 4
    max_depth = max(min_depth + 2, n)
    stretch_depth = max_depth + 1

    print(
        "stretch tree of depth %d\t check: %d"
        % (stretch_depth, item_check(bottom_up_tree(stretch_depth)))
    )

    long_lived_tree = bottom_up_tree(max_depth)

    depth = min_depth
    while depth <= max_depth:
        iterations = 1 << (max_depth - depth + min_depth)
        check = 0
        i = 1
        while i <= iterations:
            check += item_check(bottom_up_tree(depth))
            i += 1
        print("%d\t trees of depth %d\t check: %d" % (iterations, depth, check))
        depth += 2

    print(
        "long lived tree of depth %d\t check: %d"
        % (max_depth, item_check(long_lived_tree))
    )


main()
