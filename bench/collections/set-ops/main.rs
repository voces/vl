// Set operations over string elements. See main.vl for the shape.
//
// Idiomatic Rust: std `HashSet<String>` with the DEFAULT hasher (SipHash-1-3).
// Rust also has `a.intersection(&b)` etc.; the explicit membership loops are used
// so all four runtimes run the identical algorithm (VL has no set algebra).
use std::collections::HashSet;

fn main() {
    let n: usize = 100_000;
    let r = 100;
    let half = n / 2;

    let mut aw: Vec<String> = Vec::new();
    for i in 0..n {
        aw.push(format!("w{}", i));
    }
    let mut bw: Vec<String> = Vec::new();
    for i in 0..n {
        bw.push(format!("w{}", i + half));
    }

    let mut a: HashSet<String> = HashSet::new();
    for i in 0..n {
        a.insert(aw[i].clone());
    }
    let mut b: HashSet<String> = HashSet::new();
    for i in 0..n {
        b.insert(bw[i].clone());
    }

    let mut inter: i64 = 0;
    let mut only_a: i64 = 0;
    let mut only_b: i64 = 0;
    for _ in 0..r {
        for i in 0..n {
            if b.contains(&aw[i]) {
                inter += 1;
            } else {
                only_a += 1;
            }
        }
        for i in 0..n {
            if !a.contains(&bw[i]) {
                only_b += 1;
            }
        }
    }

    let mut lensum: i64 = 0;
    for x in &a {
        lensum += x.chars().count() as i64;
    }

    println!("{}", a.len());
    println!("{}", b.len());
    println!("{}", inter);
    println!("{}", only_a);
    println!("{}", only_b);
    println!("{}", lensum);
}
