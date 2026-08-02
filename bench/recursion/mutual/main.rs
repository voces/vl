fn even_step(n: i32, s: i32) -> i32 {
    if n == 0 {
        return s;
    }
    odd_step(n - 1, (s * 3 + 1) & 1_048_575)
}

fn odd_step(n: i32, s: i32) -> i32 {
    if n == 0 {
        return (s * 7 + 5) & 1_048_575;
    }
    even_step(n - 1, (s * 5 + 2) & 1_048_575)
}

fn main() {
    let mut acc: i32 = 0;
    for _ in 0..2_500 {
        for i in 0..800 {
            acc = even_step(i + (acc & 1), acc);
        }
    }
    println!("{}", acc);
}
