fn main() {
    let n: i32 = 400_000_000;
    let mut sum: i64 = 0;
    for i in 0..n {
        let f: f64 = (i & 65535) as f64;
        let k: i32 = (f * 1.5 + 0.25) as i32;
        sum += k as i64;
    }
    println!("{}", sum);
}
