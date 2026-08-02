// n-body — adapted from the Computer Language Benchmarks Game `nbody` program
// (the classic 5-body Jovian-planets simulation, Mark C. Lewis' shape).
// Idiomatic JS: an array of plain objects, index loops.
//
// ADAPTATION: prints through the same integer-scaling fmt9 as the other three
// languages instead of toFixed(9), so all four outputs are identical by
// construction.

function fmt9(v) {
  let sign = "";
  let a = v;
  if (v < 0) { sign = "-"; a = -v; }
  const scaled = Math.trunc(a * 1000000000.0 + 0.5);
  const ip = Math.trunc(scaled / 1000000000);
  const fp = scaled - ip * 1000000000;
  return sign + String(ip) + "." + String(fp).padStart(9, "0");
}

function makeBodies() {
  const pi = 3.141592653589793;
  const solarMass = 4.0 * pi * pi;
  const daysPerYear = 365.24;
  return [
    // Sun
    { x: 0.0, y: 0.0, z: 0.0, vx: 0.0, vy: 0.0, vz: 0.0, mass: solarMass },
    // Jupiter
    {
      x: 4.84143144246472090,
      y: -1.16032004402742839,
      z: -0.103622044471123109,
      vx: 0.00166007664274403694 * daysPerYear,
      vy: 0.00769901118419740425 * daysPerYear,
      vz: -0.0000690460016972063023 * daysPerYear,
      mass: 0.000954791938424326609 * solarMass,
    },
    // Saturn
    {
      x: 8.34336671824457987,
      y: 4.12479856412430479,
      z: -0.403523417114321381,
      vx: -0.00276742510726862411 * daysPerYear,
      vy: 0.00499852801234917238 * daysPerYear,
      vz: 0.0000230417297573763929 * daysPerYear,
      mass: 0.000285885980666130812 * solarMass,
    },
    // Uranus
    {
      x: 12.8943695621391310,
      y: -15.1111514016986312,
      z: -0.223307578892655734,
      vx: 0.00296460137564761618 * daysPerYear,
      vy: 0.00237847173959480950 * daysPerYear,
      vz: -0.0000296589568540237556 * daysPerYear,
      mass: 0.0000436624404335156298 * solarMass,
    },
    // Neptune
    {
      x: 15.3796971148509165,
      y: -25.9193146099879641,
      z: 0.179258772950371181,
      vx: 0.00268067772490389322 * daysPerYear,
      vy: 0.00162824170038242295 * daysPerYear,
      vz: -0.0000951592254519715870 * daysPerYear,
      mass: 0.0000515138902046611451 * solarMass,
    },
  ];
}

function offsetMomentum(bodies) {
  const pi = 3.141592653589793;
  const solarMass = 4.0 * pi * pi;
  let px = 0.0, py = 0.0, pz = 0.0;
  for (const b of bodies) {
    px += b.vx * b.mass;
    py += b.vy * b.mass;
    pz += b.vz * b.mass;
  }
  bodies[0].vx = -px / solarMass;
  bodies[0].vy = -py / solarMass;
  bodies[0].vz = -pz / solarMass;
}

function energy(bodies) {
  let e = 0.0;
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    e += 0.5 * bi.mass * (bi.vx * bi.vx + bi.vy * bi.vy + bi.vz * bi.vz);
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bi.x - bj.x;
      const dy = bi.y - bj.y;
      const dz = bi.z - bj.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      e -= (bi.mass * bj.mass) / d;
    }
  }
  return e;
}

function advance(bodies, dt) {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bi.x - bj.x;
      const dy = bi.y - bj.y;
      const dz = bi.z - bj.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const mag = dt / (d2 * Math.sqrt(d2));
      const mj = bj.mass * mag;
      const mi = bi.mass * mag;
      bi.vx -= dx * mj;
      bi.vy -= dy * mj;
      bi.vz -= dz * mj;
      bj.vx += dx * mi;
      bj.vy += dy * mi;
      bj.vz += dz * mi;
    }
  }
  for (const b of bodies) {
    b.x += dt * b.vx;
    b.y += dt * b.vy;
    b.z += dt * b.vz;
  }
}

function main() {
  const n = Number(Deno.args[0] ?? 50000000);
  const bodies = makeBodies();
  offsetMomentum(bodies);
  console.log(fmt9(energy(bodies)));
  for (let i = 0; i < n; i++) advance(bodies, 0.01);
  console.log(fmt9(energy(bodies)));
}

main();
