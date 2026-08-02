fn main() {
    let n: i32 = 1_000_000_000;
    let mut sum: i32 = 0;
    for i in 0..n {
        sum = sum.wrapping_add(i & 65535);
    }
    println!("{}", sum);
}
