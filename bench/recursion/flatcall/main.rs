fn step(x: i32) -> i32 {
    (x * 3 + 1) & 1_048_575
}

fn main() {
    let mut acc: i32 = 0;
    for _ in 0..2 {
        for i in 0..600_000_000i32 {
            acc = step(acc ^ i);
        }
    }
    println!("{}", acc);
}
