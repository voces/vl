// reverse-inplace — hand-written two-pointer in-place reverse (NOT Array.reverse),
// N elements, ROUNDS times.
const N = 4_000_000;
const ROUNDS = 400;

function run(n, rounds) {
  const a = [];
  for (let i = 0; i < n; i++) {
    a.push((i * 7 + 3) & 1048575);
  }
  let chk = 0;
  for (let r = 0; r < rounds; r++) {
    const bump = r % n;
    a[bump] = a[bump] + 1;
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const t = a[lo];
      a[lo] = a[hi];
      a[hi] = t;
      lo += 1;
      hi -= 1;
    }
    for (let i = 0; i < n; i += 65536) {
      chk += a[i];
    }
  }
  return chk;
}

console.log(run(N, ROUNDS));
