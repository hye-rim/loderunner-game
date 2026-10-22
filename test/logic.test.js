'use strict';
// 금괴 도둑(로드러너) 규칙 시험. 실행: node test/logic.test.js
const test = require('node:test');
const assert = require('node:assert');
const L = require('../logic.js');

const DT = 1 / 60;
const goldCells = (w) => { const out = []; w.gold.forEach((r, y) => r.forEach((g, x) => { if (g) out.push([x, y]); })); return out; };
// 한 걸음에 갈 수 있는 곳 + 옆 아래 벽돌을 파고 그 구멍으로 내려가기
function steps(w, x, y) {
  const out = L.moveOptions(w, x, y).map(([nx, ny]) => ({ x: nx, y: ny, dig: 0 }));
  if (L.terrainSupport(w, x, y)) for (const s of [-1, 1]) {
    if (L.cell(w, x + s, y + 1) === '#' && L.cell(w, x + s, y) === '.' && L.solid(L.cell(w, x, y + 1))) out.push({ x: x + s, y: y + 1, dig: s });
  }
  return out.filter((s) => s.x >= 0 && s.x < L.COLS && s.y >= 0 && s.y < L.ROWS);
}
// 경비를 빼고, 금괴를 모으는 순서까지 따져 탈출까지 가는 가장 짧은 길 (없으면 null)
function solve(stage) {
  const w = L.newWorld(stage);
  const gold = goldCells(w), full = (1 << gold.length) - 1;
  const gi = new Map(gold.map(([x, y], j) => [y * L.COLS + x, j]));
  const start = { x: w.player.tx, y: w.player.ty, m: 0, prev: null, dig: 0 };
  const seen = new Set([`${start.x},${start.y},0`]), q = [start];
  for (let h = 0; h < q.length; h++) {
    const s = q[h];
    w.exitOpen = s.m === full;
    if (s.m === full && s.y === 0) { const path = []; for (let n = s; n; n = n.prev) path.push(n); return path.reverse(); }
    for (const n of steps(w, s.x, s.y)) {
      const g = gi.get(n.y * L.COLS + n.x);
      const m = g === undefined ? s.m : s.m | (1 << g);
      const k = `${n.x},${n.y},${m}`;
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ x: n.x, y: n.y, m, prev: s, dig: n.dig });
    }
  }
  return null;
}
// 길을 실제 조작으로 따라간다: 칸 중앙에 설 때마다 다음 칸 쪽 방향키, 파야 하면 곡괭이
function follow(w, path, maxT = 120) {
  const inp = { dir: null, digBuf: null };
  let i = 0;
  for (let t = 0; t < maxT && w.state !== 'clear' && w.state !== 'dead'; t += DT) {
    const P = w.player;
    // 떨어질 때는 칸 중앙에 멈추지 않고 지나가므로, 멈춰 선 칸을 앞쪽 몇 걸음 안에서 찾아 맞춘다
    if (P.p === 0) for (let j = i; j < Math.min(path.length, i + 8); j++) if (P.tx === path[j].x && P.ty === path[j].y) { i = j; break; }
    const cur = path[i], nx = path[i + 1];
    inp.dir = null;
    if (nx && P.p === 0 && P.tx === cur.x && P.ty === cur.y) {
      if (nx.dig) {
        const hole = L.holeAt(w, nx.x, nx.y);
        if (!hole) { if (!inp.digBuf) inp.digBuf = { side: nx.dig, age: 0 }; }
        else if (hole.ph === 'open') inp.dir = nx.dig < 0 ? 'L' : 'R';
      } else {
        // 아까 판 구멍이 아직 열려 있는 칸 위로는 (그 구멍으로 내려갈 계획이 아니면) 메워질 때까지 기다린다
        const after = path[i + 2];
        const pit = nx.y === cur.y && L.holeAt(w, nx.x, nx.y + 1) && !(after && after.x === nx.x && after.y === nx.y + 1);
        if (!pit) inp.dir = nx.x < cur.x ? 'L' : nx.x > cur.x ? 'R' : nx.y < cur.y ? 'U' : 'D';
      }
      if (w.state === 'ready' && !inp.dir && !inp.digBuf) inp.dir = 'R';
    }
    L.stepWorld(w, DT, inp);
  }
  return w;
}
const noGuards = (w) => { w.guards = []; return w; };

test('eight courses: 16x14 maps with one thief, gold, known tiles and a hidden escape ladder', () => {
  assert.strictEqual(L.LEVELS.length, 8);
  for (const lv of L.LEVELS) {
    assert.strictEqual(lv.map.length, L.ROWS);
    for (const row of lv.map) { assert.strictEqual(row.length, L.COLS); assert.match(row, /^[.#=Hh\-$PG]+$/); }
    assert.strictEqual(lv.map.join('').split('P').length - 1, 1);
    assert.ok(lv.map.join('').includes('$') && lv.map.join('').includes('h'));
  }
  const counts = L.LEVELS.map((_, i) => L.newWorld(i).guards.length);
  assert.deepStrictEqual(counts, [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('every course can be cleared (ignoring guards) in some gold order', () => {
  for (let i = 0; i < L.LEVELS.length; i++) assert.ok(solve(i), `course ${i + 1} ${L.LEVELS[i].name}`);
});

test('following the solution with real controls (moving and digging) clears every course when no guard is around', () => {
  for (let i = 0; i < L.LEVELS.length; i++) {
    const w = follow(noGuards(L.newWorld(i)), solve(i));
    assert.strictEqual(w.state, 'clear', `course ${i + 1}: ${w.goldLeft} gold left at ${w.player.tx},${w.player.ty}`);
    assert.strictEqual(w.goldLeft, 0);
  }
});

test('the escape ladder only appears after the last gold', () => {
  const w = noGuards(L.newWorld(0));
  const h = [];
  w.grid.forEach((r, y) => r.forEach((c, x) => { if (c === 'h') h.push([x, y]); }));
  assert.ok(!L.isLadder(w, 'h'));
  for (const [x, y] of goldCells(w)) w.gold[y][x] = 0;
  w.goldLeft = 1; w.gold[w.player.ty][w.player.tx + 1] = 1;
  const inp = { dir: 'R', digBuf: null };
  let opened = false;
  for (let t = 0; t < 1 && !opened; t += DT) opened = L.stepWorld(w, DT, inp).some((e) => e.type === 'open');
  assert.ok(opened && w.exitOpen && L.isLadder(w, 'h'));
});

// 바닥이 벽돌 한 줄뿐인 평평한 판: 도둑은 3번 칸, 경비 하나는 guardX 칸, 금괴는 오른쪽 끝에 하나
function flat(guardX) {
  const w = L.newWorld(2);                               // 경비가 하나 있는 코스를 바탕으로
  const rows = Array.from({ length: L.ROWS }, (_, y) => (y === L.ROWS - 1 ? '#'.repeat(L.COLS) : '.'.repeat(L.COLS)));
  w.grid = rows.map((r) => r.split(''));
  w.gold = rows.map(() => new Uint8Array(L.COLS));
  w.gold[L.ROWS - 2][L.COLS - 1] = 1; w.goldLeft = w.goldTotal = 1;
  w.holes = []; w.exitOpen = false; w.state = 'play';
  Object.assign(w.player, { tx: 3, ty: L.ROWS - 2, p: 0, dx: 0, dy: 0, dig: null });
  const g = w.guards[0];
  Object.assign(g, { tx: guardX, ty: L.ROWS - 2, home: { x: guardX, y: L.ROWS - 2 }, p: 0, dx: 0, dy: 0, st: 'run', think: 0 });
  return { w, g };
}

test('digging: only bricks beside and below you, the hole opens, then fills back in', () => {
  const { w } = flat(15);
  w.guards = [];
  const P = w.player;
  assert.ok(L.canDig(w, P, 1) && L.canDig(w, P, -1));
  const inp = { dir: null, digBuf: { side: 1, age: 0 } };
  assert.ok(L.stepWorld(w, DT, inp).some((e) => e.type === 'dig'));
  const hole = L.holeAt(w, P.tx + 1, P.ty + 1);
  assert.ok(hole);
  assert.ok(!L.canDig(w, P, 1), 'cannot dig the same spot twice');
  for (let t = 0; t < L.DIG_T + 0.05; t += DT) L.stepWorld(w, DT, inp);
  assert.strictEqual(hole.ph, 'open');
  assert.strictEqual(L.cell(w, hole.x, hole.y), '.');
  for (let t = 0; t < L.OPEN_T + L.CLOSE_T + 0.1; t += DT) L.stepWorld(w, DT, inp);
  assert.strictEqual(L.cell(w, hole.x, hole.y), '#');
  assert.ok(!L.holeAt(w, hole.x, hole.y));
  w.grid[L.ROWS - 1][2] = '=';
  assert.ok(!L.canDig(w, P, -1), 'concrete cannot be dug');
  assert.ok(!L.canDig(w, { tx: 0, ty: L.ROWS - 2 }, -1), 'nothing to dig outside the board');
});

test('a guard chasing you falls into your hole, climbs out after a while, or dies if it fills in first', () => {
  let { w, g } = flat(6);                              // 구멍 바로 옆: 일찍 빠져서 메워지기 전에 나온다
  const inp = { dir: null, digBuf: { side: 1, age: 0 } };
  const evs = [];
  for (let t = 0; t < 3 && g.st === 'run'; t += DT) { evs.push(...L.stepWorld(w, DT, inp)); inp.digBuf = null; }
  assert.strictEqual(g.st, 'trap', 'the guard fell into the hole');
  assert.deepStrictEqual([g.tx, g.ty], [4, L.ROWS - 1]);
  assert.ok(evs.some((e) => e.type === 'trap'));
  for (let t = 0; t < L.TRAP_ESCAPE + 0.5 && g.st === 'trap'; t += DT) L.stepWorld(w, DT, inp);
  assert.strictEqual(g.st, 'run', 'climbed out before the hole closed');
  ({ w, g } = flat(9));
  inp.digBuf = { side: 1, age: 0 };
  for (let t = 0; t < 3 && g.st === 'run'; t += DT) { L.stepWorld(w, DT, inp); inp.digBuf = null; }
  g.trapT = 99;                                          // 못 나오게 붙잡아 두면
  const ev2 = [];
  for (let t = 0; t < L.OPEN_T + L.CLOSE_T + 0.5 && g.st !== 'dead'; t += DT) ev2.push(...L.stepWorld(w, DT, inp));
  assert.strictEqual(g.st, 'dead');
  assert.ok(ev2.some((e) => e.type === 'guardDie'));
  for (let t = 0; t < 3 && g.st === 'dead'; t += DT) L.stepWorld(w, DT, inp);
  assert.strictEqual(g.st, 'run', 'it comes back');
  assert.deepStrictEqual([g.tx, g.ty], [g.home.x, g.home.y]);
});

test('a guard touching you catches you', () => {
  const w = L.newWorld(2);
  w.state = 'play';
  const g = w.guards[0];
  Object.assign(g, { tx: w.player.tx, ty: w.player.ty, p: 0, dx: 0, dy: 0, st: 'run' });
  const evs = L.stepWorld(w, DT, { dir: null, digBuf: null });
  assert.strictEqual(w.state, 'dead');
  assert.ok(evs.some((e) => e.type === 'die' && e.by === 'guard'));
});

test('nothing moves until you press something', () => {
  const w = L.newWorld(4);
  const before = JSON.stringify([w.player, w.guards]);
  for (let k = 0; k < 120; k++) L.stepWorld(w, DT, { dir: null, digBuf: null });
  assert.strictEqual(w.state, 'ready');
  assert.strictEqual(JSON.stringify([w.player, w.guards]), before);
});

test('with guards running, staying still eventually gets you caught; guards never walk through walls', () => {
  for (const stage of [2, 4, 6]) {
    const w = L.newWorld(stage);
    w.state = 'play';
    for (let t = 0; t < 60 && w.state === 'play'; t += DT) {
      L.stepWorld(w, DT, { dir: null, digBuf: null });
      for (const g of w.guards) if (g.st === 'run') assert.ok(!L.solid(L.cell(w, g.tx, g.ty)), `guard inside a wall at ${g.tx},${g.ty}`);
    }
    assert.strictEqual(w.state, 'dead', `course ${stage + 1}: the guards find you`);
  }
});
