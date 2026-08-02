fn digest_tail(n: i32, acc: i32) -> i32 {
    if n == 0 {
        return acc;
    }
    digest_tail(n - 1, (acc * 3 + n) & 1_048_575)
}

fn main() {
    let mut acc: i32 = 0;
    for _ in 0..120_000 {
        acc = digest_tail(5_000, acc);
    }
    println!("{}", acc);
}
