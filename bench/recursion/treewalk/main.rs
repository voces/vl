struct Tree {
    value: i32,
    left: Option<Box<Tree>>,
    right: Option<Box<Tree>>,
}

fn build(depth: i32, v: i32) -> Tree {
    if depth == 0 {
        return Tree { value: v, left: None, right: None };
    }
    Tree {
        value: v,
        left: Some(Box::new(build(depth - 1, (v * 2) % 1_000))),
        right: Some(Box::new(build(depth - 1, (v * 2 + 1) % 1_000))),
    }
}

fn sum(t: &Tree) -> i32 {
    let mut s = t.value;
    if let Some(l) = &t.left {
        s += sum(l);
    }
    if let Some(r) = &t.right {
        s += sum(r);
    }
    s
}

fn main() {
    let mut tree = build(19, 1);
    let mut acc: i32 = 0;
    for _ in 0..150 {
        // Mutating the root each pass keeps the walk from being loop-invariant:
        // without this, rustc hoists all 150 walks into one.
        tree.value = (tree.value + 1) % 1_000;
        acc = (acc + sum(&tree)) % 1_000_000_007;
    }
    println!("{}", acc);
}
