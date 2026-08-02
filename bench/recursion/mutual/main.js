function evenStep(n, s) {
  if (n === 0) return s;
  return oddStep(n - 1, (s * 3 + 1) & 1_048_575);
}

function oddStep(n, s) {
  if (n === 0) return (s * 7 + 5) & 1_048_575;
  return evenStep(n - 1, (s * 5 + 2) & 1_048_575);
}

let acc = 0;
for (let r = 0; r < 2_500; r++) {
  for (let i = 0; i < 800; i++) {
    acc = evenStep(i + (acc & 1), acc);
  }
}

console.log(acc);
