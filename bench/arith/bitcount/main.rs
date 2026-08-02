fn main() {
    let n: i32 = 200_000_000;
    let mut sum: i64 = 0;
    for i in 0..n {
        let v = i + 1;
        sum += v.count_ones() as i64 + v.leading_zeros() as i64 + v.trailing_zeros() as i64;
    }
    println!("{}", sum);
}
