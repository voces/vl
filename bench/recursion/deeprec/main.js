function digest(n, seed) {
  if (n === 0) return seed;
  return (digest(n - 1, seed) * 3 + n) & 1_048_575;
}

let acc = 0;
for (let r = 0; r < 120_000; r++) {
  acc = digest(5_000, acc);
}

console.log(acc);
