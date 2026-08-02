fn digest(n: i32, seed: i32) -> i32 {
    if n == 0 {
        return seed;
    }
    (digest(n - 1, seed) * 3 + n) & 1_048_575
}

fn main() {
    let mut acc: i32 = 0;
    for _ in 0..120_000 {
        acc = digest(5_000, acc);
    }
    println!("{}", acc);
}
