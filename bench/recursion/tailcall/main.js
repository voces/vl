function digestTail(n, acc) {
  if (n === 0) return acc;
  return digestTail(n - 1, (acc * 3 + n) & 1_048_575);
}

let acc = 0;
for (let r = 0; r < 120_000; r++) {
  acc = digestTail(5_000, acc);
}

console.log(acc);
