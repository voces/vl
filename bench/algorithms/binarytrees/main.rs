// binary-trees — adapted from the Computer Language Benchmarks Game
// `binarytrees` program (the single-threaded, no-arena reference shape).
//
// IDIOMATIC safe Rust: `Option<Box<Node>>` children, recursive build and check.
// The benchmarks-game leaderboard entry uses a bump arena (`typed_arena`) and
// rayon; that is a hack for the scoreboard, not what a Rust programmer writes
// for a tree, and it would be measuring an arena rather than the allocator.

struct Node {
    left: Option<Box<Node>>,
    right: Option<Box<Node>>,
}

fn bottom_up_tree(depth: i32) -> Node {
    if depth == 0 {
        Node { left: None, right: None }
    } else {
        Node {
            left: Some(Box::new(bottom_up_tree(depth - 1))),
            right: Some(Box::new(bottom_up_tree(depth - 1))),
        }
    }
}

fn item_check(node: &Node) -> i32 {
    match (&node.left, &node.right) {
        (Some(l), Some(r)) => 1 + item_check(l) + item_check(r),
        _ => 1,
    }
}

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(20);
    let min_depth = 4;
    let max_depth = if n > min_depth + 2 { n } else { min_depth + 2 };
    let stretch_depth = max_depth + 1;

    println!(
        "stretch tree of depth {}\t check: {}",
        stretch_depth,
        item_check(&bottom_up_tree(stretch_depth))
    );

    let long_lived_tree = bottom_up_tree(max_depth);

    let mut depth = min_depth;
    while depth <= max_depth {
        let iterations = 1i32 << (max_depth - depth + min_depth);
        let mut check = 0i32;
        let mut i = 1;
        while i <= iterations {
            check += item_check(&bottom_up_tree(depth));
            i += 1;
        }
        println!("{}\t trees of depth {}\t check: {}", iterations, depth, check);
        depth += 2;
    }

    println!(
        "long lived tree of depth {}\t check: {}",
        max_depth,
        item_check(&long_lived_tree)
    );
}
