fn main() {
    let n: i32 = 200_000_000;
    let mut x: i32 = 123456789;
    let mut sum: i32 = 0;
    for _ in 0..n {
        x ^= x << 13;
        x ^= ((x as u32) >> 17) as i32;
        x ^= x << 5;
        x = x.rotate_left(7);
        sum = sum.wrapping_add((x & 65535) | (((x as u32) >> 24) as i32));
    }
    println!("{}", sum);
}
