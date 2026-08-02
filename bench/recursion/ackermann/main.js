function ack(m, n) {
  if (m === 0) return n + 1;
  if (n === 0) return ack(m - 1, 1);
  return ack(m - 1, ack(m, n - 1));
}

let acc = 0;
for (let r = 0; r < 20; r++) {
  acc = (acc + ack(3, 10 - (acc & 1))) % 1_000_003;
}

console.log(acc);
