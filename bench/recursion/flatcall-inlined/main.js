let acc = 0;
for (let r = 0; r < 2; r++) {
  for (let i = 0; i < 600_000_000; i++) {
    acc = ((acc ^ i) * 3 + 1) & 1_048_575;
  }
}

console.log(acc);
