# Reduced repeat count only (20 walks vs 150) -- the tree is the SAME depth 19 (1_048_575 nodes),
# because the build/walk recursion is only 20 frames deep and so fits CPython's
# default recursion limit of 1000 unchanged.
class Tree:
    __slots__ = ("value", "left", "right")

    def __init__(self, value, left, right):
        self.value = value
        self.left = left
        self.right = right


def build(depth, v):
    if depth == 0:
        return Tree(v, None, None)
    return Tree(v, build(depth - 1, (v * 2) % 1_000), build(depth - 1, (v * 2 + 1) % 1_000))


def sum_tree(t):
    s = t.value
    if t.left is not None:
        s += sum_tree(t.left)
    if t.right is not None:
        s += sum_tree(t.right)
    return s


tree = build(19, 1)

acc = 0
for r in range(20):
    # Mutating the root each pass keeps the walk from being loop-invariant:
    # without this, rustc hoists all 150 walks into one.
    tree.value = (tree.value + 1) % 1_000
    acc = (acc + sum_tree(tree)) % 1_000_000_007

print(acc)
