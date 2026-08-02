fn main() {
    let n: i32 = 200_000_000;
    let mut sum: i32 = 0;
    for i in 0..n {
        let d: i32 = (i & 1023) + 1;
        sum = sum.wrapping_add(i / d).wrapping_add(i % d);
    }
    println!("{}", sum);
}
