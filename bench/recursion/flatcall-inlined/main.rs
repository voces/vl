fn main() {
    let mut acc: i32 = 0;
    for _ in 0..2 {
        for i in 0..600_000_000i32 {
            acc = ((acc ^ i) * 3 + 1) & 1_048_575;
        }
    }
    println!("{}", acc);
}
