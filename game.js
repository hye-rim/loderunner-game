'use strict';

// ---------- Board ----------
// 16x14 타일. 맨 윗줄(0)에 닿으면 탈출. 한 걸음은 한 타일이고, 타일 중심에 설 때마다 다음 행동을 정한다.
const COLS = 16, ROWS = 14, T = 28;
const W = COLS * T, H = ROWS * T;

// . 빈칸  # 벽돌(팔 수 있음)  = 콘크리트(못 팜)  H 사다리  h 숨은 사다리(금괴를 다 모으면 나타남)
// - 밧줄  $ 금괴  P 도둑 시작  G 경비 시작
const LEVELS = [
  { name: '사다리 연습', map: [
    '..............h.',
    '..............h.',
    '..............h.',
    '..$......$....h.',
    '#####H########H#',
    '.....H........H.',
    '.$...H........H.',
    '##########H#####',
    '..........H.....',
    '..$.......H....$',
    '###H############',
    '...H............',
    'P..H.....$......',
    '================',
  ] },
  { name: '줄타기와 곡괭이', map: [
    '.h..............',
    '.h..............',
    '.h..............',
    '.h........$....$',
    '#H##############',
    '.H..............',
    '.H.....------...',
    '#######......#H#',
    '..............H.',
    '.$..........$.H.',
    '############H###',
    '....#$#.....H...',
    'P...$.......H...',
    '================',
  ] },
  { name: '경비원 등장', map: [
    '......h.........',
    '......h.........',
    '......h.........',
    '......h.......$.',
    '######H#####H###',
    '......H.....H...',
    '.$.$..H.....H...',
    '###H#####H######',
    '...H.....H......',
    '...H..$..H....G.',
    '###H##H#########',
    '...H..H.........',
    'P..H..H...$.....',
    '================',
  ] },
  { name: '미끼 작전', map: [
    '........h.......',
    '........h.......',
    '........h.......',
    '........h..$G...',
    '##H#####H##=====',
    '..H.....H.......',
    '..H.....H$......',
    '########H####H##',
    '........H....H..',
    '........H$...H..',
    '#######H####H===',
    '.......H.#$#H...',
    '.P.....H..$.H.$.',
    '================',
  ] },
  { name: '쫓고 쫓기는', map: [
    '........h.......',
    '........h.......',
    '........h.......',
    '....$...h$.G....',
    '#H####==H=######',
    '.H......H.......',
    '.H.$..G.H.$.....',
    '####H####H######',
    '....H....H#$#...',
    '....H$...H....$.',
    '######H###==H=##',
    '......H.....H...',
    'P.....H.....H...',
    '================',
  ] },
  { name: '깊은 구덩이', map: [
    '...........h....',
    '...........h....',
    '...........h....',
    '.....$---..h.G..',
    '###H##...##H===#',
    '...H.......H....',
    '...H.......H..$.',
    '########H##=H==#',
    '...#$#..H...H...',
    '......$.H.G.H...',
    '===H#######H####',
    '...H.......H....',
    '.P.H$...$..H$..$',
    '================',
  ] },
  { name: '경비 삼총사', map: [
    '...........h....',
    '...........h....',
    '...........h....',
    '.....$---..h.G..',
    '###H##...##H===#',
    '...H.......H....',
    '...H.....G.H..$.',
    '########H##=H==#',
    '...#$#..H...H...',
    '......$.H.G.H...',
    '===H#######H####',
    '...H.......H....',
    '.P.H$...$..H$..$',
    '================',
  ] },
  { name: '금괴 대금고', map: [
    '.h..............',
    '.h..............',
    '.h..............',
    '.h..G....$.$....',
    '#H=====######H##',
    '.H...........H..',
    '$H......G.$$.H.G',
    '###H===H=#######',
    '...H...H........',
    '$..H...H........',
    '===H######H#####',
    '...H#$#...H.....',
    '.P.H$.....H...$.',
    '================',
  ] },
];

// ---------- Tuning ----------
const PLAYER_SPD = { run: 5.4, climb: 4.4, rope: 4.8, fall: 10 };
const GUARD_SPD = { run: 3.7, climb: 3.3, rope: 3.4, fall: 10 };
const DIG_T = 0.32;                // 곡괭이질 시간
const OPEN_T = 5.0;                // 구멍이 열려 있는 시간
const CLOSE_T = 0.5;               // 메워지는 시간
const TRAP_ESCAPE = 3.6;           // 구멍에 빠진 경비가 기어오르기까지
const RESPAWN_T = 2.6;
const CARRY_MIN = 2.5, CARRY_MAX = 4.5;   // 경비가 금괴를 들고 있다가 내려놓기까지
const PICK_CD = 3.0;               // 금괴를 내려놓은 뒤 다시 줍지 않는 시간
const BAIT_RANGE = 9;              // 이 걸음 안의 금괴는 미끼가 된다
const CHASE_NEAR = 3;              // 도둑이 이 걸음 안이면 미끼는 무시하고 쫓는다
const CATCH_R = 0.55;              // 이 거리(타일)보다 가까우면 잡힌다
const DIG_BUFFER = 0.3;

const N = COLS * ROWS;
const idx = (x, y) => y * COLS + x;

// ---------- Terrain ----------
function cell(w, x, y) {
  if (x < 0 || x >= COLS || y >= ROWS) return '=';
  if (y < 0) return '.';
  return w.grid[y][x];
}
const solid = (c) => c === '#' || c === '=';
const isLadder = (w, c) => c === 'H' || (c === 'h' && w.exitOpen);

// 다른 것들과 상관없이 땅만 보고: 서 있거나 매달릴 수 있는 자리인가
function terrainSupport(w, x, y) {
  const c = cell(w, x, y);
  if (isLadder(w, c) || c === '-') return true;
  const b = cell(w, x, y + 1);
  return solid(b) || isLadder(w, b);
}

// 땅만 보고 한 걸음에 갈 수 있는 곳들 (경비 길찾기용)
function moveOptions(w, x, y) {
  const out = [];
  const c = cell(w, x, y);
  if (!terrainSupport(w, x, y)) {
    if (!solid(cell(w, x, y + 1))) out.push([x, y + 1]);
    return out;
  }
  for (const s of [-1, 1]) if (!solid(cell(w, x + s, y))) out.push([x + s, y]);
  if (isLadder(w, c) && y > 0 && !solid(cell(w, x, y - 1))) out.push([x, y - 1]);
  const below = cell(w, x, y + 1);
  if (!solid(below) && (isLadder(w, c) || c === '-' || isLadder(w, below))) out.push([x, y + 1]);
  return out;
}

function bfs(w, sx, sy) {
  const dist = new Int16Array(N).fill(-1), prev = new Int16Array(N).fill(-1);
  const q = [idx(sx, sy)];
  dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], x = cur % COLS, y = (cur / COLS) | 0;
    for (const [nx, ny] of moveOptions(w, x, y)) {
      const ni = idx(nx, ny);
      if (dist[ni] < 0) { dist[ni] = dist[cur] + 1; prev[ni] = cur; q.push(ni); }
    }
  }
  return { dist, prev };
}

// ---------- Level / World ----------
function parseLevel(map) {
  const grid = [], gold = [], guards = [];
  let player = null, goldTotal = 0;
  for (let y = 0; y < ROWS; y++) {
    const row = new Array(COLS), g = new Uint8Array(COLS);
    for (let x = 0; x < COLS; x++) {
      let ch = map[y][x];
      if (ch === '$') { g[x] = 1; goldTotal++; ch = '.'; }
      else if (ch === 'P') { player = { x, y }; ch = '.'; }
      else if (ch === 'G') { guards.push({ x, y }); ch = '.'; }
      row[x] = ch;
    }
    grid.push(row); gold.push(g);
  }
  return { grid, gold, guards, player, goldTotal };
}

const makeEnt = (x, y, sp) => ({ tx: x, ty: y, dx: 0, dy: 0, p: 0, spd: 0, sp, face: 1, anim: 0, fall: false });
const ex = (e) => e.tx + e.dx * e.p;
const ey = (e) => e.ty + e.dy * e.p;
const nearTile = (e) => (e.p < 0.5 ? [e.tx, e.ty] : [e.tx + e.dx, e.ty + e.dy]);

function newWorld(stage) {
  const lv = parseLevel(LEVELS[stage].map);
  // 첫 경비 코스는 좁은 사다리 병목을 빠져나갈 여유를 준다.
  const k = (1 + Math.min(stage, 7) * 0.035) * (stage === 2 ? 0.48 : 1);
  const gsp = { run: GUARD_SPD.run * k, climb: GUARD_SPD.climb * k, rope: GUARD_SPD.rope * k, fall: GUARD_SPD.fall };
  const player = makeEnt(lv.player.x, lv.player.y, PLAYER_SPD);
  player.dig = null;
  const guards = lv.guards.map((g) => {
    const e = makeEnt(g.x, g.y, gsp);
    Object.assign(e, { home: { x: g.x, y: g.y }, st: 'run', carry: false, carryT: 0, pickCd: 0, trapT: 0, deadT: 0, think: 0 });
    return e;
  });
  return {
    stage, grid: lv.grid, gold: lv.gold, goldTotal: lv.goldTotal, goldLeft: lv.goldTotal,
    holes: [], exitOpen: false, time: 0, state: 'ready', deadT: 0,
    player, guards, minDist: 99,
  };
}

// ---------- Entity helpers ----------
function guardAtTile(w, x, y, except) {
  for (const g of w.guards) {
    if (g === except || g.st === 'dead') continue;
    const [gx, gy] = nearTile(g);
    if (gx === x && gy === y) return g;
  }
  return null;
}
// 걸어가려는 타일에 다른 경비가 있거나 그리로 오는 중인가
function guardClaims(w, x, y, except) {
  for (const g of w.guards) {
    if (g === except || g.st === 'dead') continue;
    if ((g.tx === x && g.ty === y) || (g.tx + g.dx === x && g.ty + g.dy === y)) return true;
  }
  return false;
}
const holeAt = (w, x, y) => w.holes.find((h) => h.x === x && h.y === y) || null;

function standing(w, e) {
  const c = cell(w, e.tx, e.ty);
  if (isLadder(w, c) || c === '-') return true;
  const b = cell(w, e.tx, e.ty + 1);
  return solid(b) || isLadder(w, b) || !!guardAtTile(w, e.tx, e.ty + 1, e);
}

function go(e, dx, dy, kind) {
  e.dx = dx; e.dy = dy; e.p = 0;
  e.spd = e.sp[kind];
  e.fall = kind === 'fall';
  if (dx) e.face = dx;
  return true;
}
function moveKind(w, e, dx, dy) {
  if (dy) return 'climb';
  return cell(w, e.tx, e.ty) === '-' ? 'rope' : 'run';
}

// (x,y) 에 금괴를 놓는다. 자리가 안 되면 가까운 서 있을 수 있는 칸에. force 면 발판이 없어도 그 칸에 놓는다
// (구멍 바로 위에 떨군 금괴는 도둑이 구멍에 빠지면서 주울 수 있어야 한다).
function placeGoldNear(w, x, y, force) {
  if (force && cell(w, x, y) === '.' && !w.gold[y][x]) { w.gold[y][x] = 1; return; }
  const seen = new Set([idx(x, y)]), q = [[x, y]];
  for (let h = 0; h < q.length; h++) {
    const [cx, cy] = q[h];
    if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS && cell(w, cx, cy) === '.' && !w.gold[cy][cx] && terrainSupport(w, cx, cy)) {
      w.gold[cy][cx] = 1;
      return;
    }
    for (const [ddx, ddy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
      const nx = cx + ddx, ny = cy + ddy;
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS || solid(cell(w, nx, ny))) continue;
      const k = idx(nx, ny);
      if (!seen.has(k)) { seen.add(k); q.push([nx, ny]); }
    }
  }
}

// ---------- Player ----------
function canDig(w, e, side) {
  const hx = e.tx + side, hy = e.ty + 1;
  if (hx < 0 || hx >= COLS) return false;
  if (!solid(cell(w, e.tx, e.ty + 1))) return false;
  if (cell(w, hx, hy) !== '#' || holeAt(w, hx, hy)) return false;
  if (cell(w, hx, e.ty) !== '.' || w.gold[e.ty][hx] || guardAtTile(w, hx, e.ty, null)) return false;
  return true;
}

function decidePlayer(w, e, inp, events) {
  if (e.dig) return false;
  const c = cell(w, e.tx, e.ty);
  const hang = isLadder(w, c) || c === '-';
  if (!standing(w, e)) return go(e, 0, 1, 'fall');

  if (inp.digBuf && canDig(w, e, inp.digBuf.side)) {
    const side = inp.digBuf.side;
    inp.digBuf = null;
    e.face = side;
    e.dig = { side, t: 0 };
    w.holes.push({ x: e.tx + side, y: e.ty + 1, ph: 'dig', t: 0 });
    events.push({ type: 'dig' });
    return true;
  }

  const above = cell(w, e.tx, e.ty - 1), below = cell(w, e.tx, e.ty + 1);
  switch (inp.dir) {
    case 'L': case 'R': {
      const s = inp.dir === 'L' ? -1 : 1;
      e.face = s;
      if (!solid(cell(w, e.tx + s, e.ty))) return go(e, s, 0, moveKind(w, e, s, 0));
      return false;
    }
    case 'U':
      if (!solid(above) && (isLadder(w, c) || holeAt(w, e.tx, e.ty))) return go(e, 0, -1, 'climb');
      return false;
    case 'D':
      if (!solid(below) && (hang || isLadder(w, below))) return go(e, 0, 1, 'climb');
      return false;
  }
  return false;
}

// 걷는 도중에 방향을 바꾸면 바로 반응하게 한다. 한 칸 단위로 움직이다 보니 사다리 칸을 살짝 지나쳐도
// 못 오르는 답답함이 생기는데, 그걸 막기 위한 보정이다.
//  - 반대 방향: 그 자리에서 즉시 돌아선다
//  - 직각 방향(사다리 타기 등): 출발한 칸을 막 벗어난 참이면(STEER_SNAP) 칸 중앙으로 되돌아와 그쪽으로 꺾는다
const STEER_SNAP = 0.4;
function steerPlayer(w, e, inp) {
  if (!inp.dir || (e.dx === 0 && e.dy === 0) || e.fall || e.dig) return;
  const wdx = inp.dir === 'L' ? -1 : inp.dir === 'R' ? 1 : 0;
  const wdy = inp.dir === 'U' ? -1 : inp.dir === 'D' ? 1 : 0;
  if (wdx === -e.dx && wdy === -e.dy) {
    e.tx += e.dx; e.ty += e.dy;
    e.p = 1 - e.p; e.dx = -e.dx; e.dy = -e.dy;
    if (e.dx) e.face = e.dx;
    return;
  }
  if (e.p > STEER_SNAP || (wdx !== 0) === (e.dx !== 0)) return;
  const c = cell(w, e.tx, e.ty);
  let can = false;
  if (wdx) can = !solid(cell(w, e.tx + wdx, e.ty));
  else if (wdy < 0) can = isLadder(w, c) && !solid(cell(w, e.tx, e.ty - 1));
  else can = !solid(cell(w, e.tx, e.ty + 1)) && (isLadder(w, c) || c === '-' || isLadder(w, cell(w, e.tx, e.ty + 1)));
  if (can) { e.p = 0; e.dx = e.dy = 0; }
}

function openExit(w, events) {
  w.exitOpen = true;
  events.push({ type: 'open' });
}

function playerArrive(w, e, events) {
  if (w.gold[e.ty][e.tx]) {
    w.gold[e.ty][e.tx] = 0;
    w.goldLeft--;
    events.push({ type: 'gold', left: w.goldLeft });
    if (w.goldLeft === 0) openExit(w, events);
  }
  if (w.exitOpen && e.ty === 0) {
    w.state = 'clear';
    events.push({ type: 'win' });
  }
}

// ---------- Guards ----------
function dropGold(w, e) {
  e.carry = false;
  e.pickCd = PICK_CD;
}

function guardArrive(w, e, events) {
  // 금괴 미끼와 운반은 다음 코스부터 소개한다.
  if (w.stage !== 2 && w.gold[e.ty][e.tx] && !e.carry && e.pickCd <= 0) {
    w.gold[e.ty][e.tx] = 0;
    e.carry = true;
    e.carryT = CARRY_MIN + Math.random() * (CARRY_MAX - CARRY_MIN);
  }
  const h = holeAt(w, e.tx, e.ty);
  if (h && h.ph !== 'dig' && solid(cell(w, e.tx, e.ty + 1))) {
    e.st = 'trap';
    e.trapT = TRAP_ESCAPE;
    e.dx = e.dy = 0; e.p = 0;
    if (e.carry) { placeGoldNear(w, e.tx, e.ty - 1, true); dropGold(w, e); e.pickCd = TRAP_ESCAPE + 1.5; }
    events.push({ type: 'trap' });
  }
}

function decideGuard(w, e, events) {
  if (e.think > 0) return false;
  const c = cell(w, e.tx, e.ty);
  if (e.carry && e.carryT <= 0 && !w.gold[e.ty][e.tx] && c === '.' && solid(cell(w, e.tx, e.ty + 1))) {
    w.gold[e.ty][e.tx] = 1;
    dropGold(w, e);
  }
  if (!standing(w, e)) return go(e, 0, 1, 'fall');

  const { dist, prev } = bfs(w, e.tx, e.ty);
  const [px, py] = nearTile(w.player);
  const pDist = dist[idx(px, py)];

  let goal = idx(px, py);
  if (w.stage !== 2 && !e.carry && e.pickCd <= 0 && (pDist < 0 || pDist > CHASE_NEAR)) {
    let bestD = BAIT_RANGE + 1;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (!w.gold[y][x]) continue;
      const d = dist[idx(x, y)];
      if (d > 0 && d < bestD) { bestD = d; goal = idx(x, y); }
    }
  }
  if (dist[goal] < 0) {
    // 갈 수 없는 곳이면 가장 가까이 갈 수 있는 자리로
    const gx = goal % COLS, gy = (goal / COLS) | 0;
    let best = Infinity, bi = -1;
    for (let i = 0; i < N; i++) {
      if (dist[i] < 0) continue;
      const d = Math.abs((i % COLS) - gx) + Math.abs(((i / COLS) | 0) - gy);
      if (d < best) { best = d; bi = i; }
    }
    goal = bi;
  }
  const start = idx(e.tx, e.ty);
  if (goal < 0 || goal === start) return false;
  let cur = goal;
  while (prev[cur] !== start) { cur = prev[cur]; if (cur < 0) return false; }
  const nx = cur % COLS, ny = (cur / COLS) | 0;
  if (guardClaims(w, nx, ny, e)) { e.think = 0.15; return false; }
  const dx = nx - e.tx, dy = ny - e.ty;
  return go(e, dx, dy, moveKind(w, e, dx, dy));
}

function updateGuard(w, e, dt, events) {
  if (e.pickCd > 0) e.pickCd -= dt;
  if (e.carry && e.carryT > 0) e.carryT -= dt;
  if (e.think > 0) e.think -= dt;

  if (e.st === 'dead') {
    e.deadT -= dt;
    if (e.deadT > 0) return;
    const [px, py] = nearTile(w.player);
    if (Math.abs(px - e.home.x) + Math.abs(py - e.home.y) < 4 || guardClaims(w, e.home.x, e.home.y, e)) { e.deadT = 0.4; return; }
    Object.assign(e, { st: 'run', tx: e.home.x, ty: e.home.y, dx: 0, dy: 0, p: 0, carry: false, pickCd: 0, think: 0 });
    return;
  }
  if (e.st === 'trap') {
    e.trapT -= dt;
    if (e.trapT <= 0 && !solid(cell(w, e.tx, e.ty - 1)) && !guardClaims(w, e.tx, e.ty - 1, e)) {
      e.st = 'run';
      go(e, 0, -1, 'climb');
    }
    return;
  }
  advanceEnt(w, e, dt, (ww, ee) => decideGuard(ww, ee, events), (ww, ee) => guardArrive(ww, ee, events));
}

// ---------- Movement ----------
function advanceEnt(w, e, dt, decide, arrive) {
  let rem = dt;
  for (let guard = 0; rem > 1e-9 && guard < 8; guard++) {
    if (e.dx === 0 && e.dy === 0) {
      if (!decide(w, e)) break;
      if (e.dx === 0 && e.dy === 0) break;
    }
    const need = (1 - e.p) / e.spd;
    if (need > rem) { e.p += rem * e.spd; e.anim += rem * e.spd; rem = 0; }
    else {
      e.anim += 1 - e.p;
      rem -= need;
      e.tx += e.dx; e.ty += e.dy;
      e.dx = e.dy = 0; e.p = 0;
      arrive(w, e);
      if (w.state !== 'play' || (e.st && e.st !== 'run')) break;
    }
  }
}

// ---------- Holes ----------
function killGuard(w, g, events) {
  g.st = 'dead';
  g.deadT = RESPAWN_T;
  g.dx = g.dy = 0; g.p = 0;
  if (g.carry) { placeGoldNear(w, g.tx, g.ty - 1, true); dropGold(w, g); }
  events.push({ type: 'guardDie' });
}

function updateHoles(w, dt, events) {
  for (const h of w.holes) {
    h.t += dt;
    if (h.ph === 'dig' && h.t >= DIG_T) {
      h.ph = 'open'; h.t = 0;
      w.grid[h.y][h.x] = '.';
      if (w.player.dig) w.player.dig = null;
    } else if (h.ph === 'open' && h.t >= OPEN_T) {
      h.ph = 'close'; h.t = 0;
    } else if (h.ph === 'close' && h.t >= CLOSE_T) {
      h.ph = 'done';
      w.grid[h.y][h.x] = '#';
      const [px, py] = nearTile(w.player);
      if (px === h.x && py === h.y && w.state === 'play') { w.state = 'dead'; w.deadT = 0; events.push({ type: 'die', by: 'brick' }); }
      for (const g of w.guards) {
        if (g.st === 'dead') continue;
        const [gx, gy] = nearTile(g);
        if (gx === h.x && gy === h.y) killGuard(w, g, events);
      }
    }
  }
  w.holes = w.holes.filter((h) => h.ph !== 'done');
}

// ---------- Step ----------
// inp: { dir: 'L'|'R'|'U'|'D'|null, digBuf: { side, age } | null }
function stepWorld(w, dt, inp) {
  const events = [];
  if (w.state === 'ready') {
    if (inp.dir || inp.digBuf) w.state = 'play';
    else return events;
  }
  if (w.state === 'dead' || w.state === 'clear') { w.deadT += dt; return events; }

  w.time += dt;
  if (inp.digBuf) { inp.digBuf.age += dt; if (inp.digBuf.age > DIG_BUFFER) inp.digBuf = null; }

  updateHoles(w, dt, events);
  if (w.state !== 'play') return events;

  steerPlayer(w, w.player, inp);
  advanceEnt(w, w.player, dt, (ww, ee) => decidePlayer(ww, ee, inp, events), (ww, ee) => playerArrive(ww, ee, events));
  if (w.state !== 'play') return events;

  for (const g of w.guards) updateGuard(w, g, dt, events);

  let md = 99;
  const px = ex(w.player), py = ey(w.player);
  for (const g of w.guards) {
    if (g.st !== 'run') continue;
    const d = Math.hypot(ex(g) - px, ey(g) - py);
    if (d < md) md = d;
    if (d < CATCH_R) { w.state = 'dead'; w.deadT = 0; events.push({ type: 'die', by: 'guard' }); break; }
  }
  w.md = md;
  if (md < w.minDist) w.minDist = md;
  return events;
}

if (typeof document === 'undefined') {
  module.exports = {
    COLS, ROWS, T, LEVELS, DIG_T, OPEN_T, TRAP_ESCAPE,
    parseLevel, newWorld, stepWorld, cell, solid, isLadder, moveOptions, bfs, terrainSupport, canDig,
  };
} else {
// ---------- Canvas ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const $ = (id) => document.getElementById(id);
const INK = '#2b1d52';

function fit() {
  const pad = $('pad');
  const padH = pad && getComputedStyle(pad).display !== 'none' ? pad.offsetHeight + 8 : 0;
  const hudH = 58;
  const scale = Math.min((innerWidth - 16) / W, (innerHeight - 16 - hudH - padH) / H);
  const cssW = Math.max(200, Math.floor(W * scale)), cssH = Math.floor(H * scale);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
  $('col').style.width = cssW + 'px';
}
addEventListener('resize', fit);

// ---------- Storage ----------
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
};
let times = {};
try { times = JSON.parse(store.get('loderunnerTimes') || '{}') || {}; } catch (_) { times = {}; }
const cleared = () => Object.keys(times).length;
const unlocked = (i) => i === 0 || !!times[i - 1] || !!times[i];
function saveTime(stage, t) {
  const prevBest = times[stage];
  if (!prevBest || t < prevBest) {
    times[stage] = Math.round(t * 10) / 10;
    store.set('loderunnerTimes', JSON.stringify(times));
    store.set('loderunnerBest', String(cleared()));
  }
  return !prevBest || t < prevBest;
}
const fmt = (t) => (t >= 60 ? `${Math.floor(t / 60)}:${(t % 60).toFixed(1).padStart(4, '0')}` : t.toFixed(1)) ;

// ---------- Sound ----------
let audio = null;
let muted = store.get('loderunnerMuted') === '1';
function tone(freq, dur, type = 'sine', vol = 0.1, slide = 0) {
  if (muted) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    const t = audio.currentTime;
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(audio.destination);
    o.start(t);
    o.stop(t + dur);
  } catch (_) {}
}
const seq = (notes, step, type = 'square', vol = 0.06) => notes.forEach((f, i) => setTimeout(() => tone(f, step * 0.0009, type, vol), i * step));
const sfx = {
  dig: () => tone(160, 0.16, 'sawtooth', 0.07, -80),
  gold: (left) => seq(left === 0 ? [660, 880, 1320] : [880, 1175], 60, 'triangle', 0.09),
  open: () => seq([392, 523, 659, 784], 90, 'square', 0.06),
  trap: () => tone(120, 0.2, 'triangle', 0.12, -50),
  guardDie: () => tone(500, 0.3, 'square', 0.06, -380),
  die: () => seq([392, 330, 262, 196], 150, 'triangle', 0.1),
  win: () => seq([523, 659, 784, 1047, 1319], 110, 'square', 0.06),
  close: () => tone(90, 0.1, 'triangle', 0.08),
};

// ---------- Game state ----------
let world = null;
let state = 'title';               // title · select · play · dead · clear · replay · paused
let pausedFrom = null;
let inp = { dir: null, digBuf: null };
let held = [];                     // 눌려 있는 방향 (마지막에 누른 게 우선)
let particles = [];
let uiT = 0;                       // 애니메이션 시계
let stageIdx = 0;
let result = null;

// 아슬아슬 리플레이: 최근 3초를 계속 저장해 두다가, 경비와 가장 가까워진 순간 앞뒤로 잘라 둔다.
const REC_DT = 1 / 24, REC_KEEP = 24 * 3, CLIP_POST = 24 * 2;
let rec = [], recAcc = 0, clip = null, clipPost = 0, clipMin = 99, replay = null, replayT = 0;

function makeView(w) {
  const pe = w.player;
  const p = {
    x: ex(pe), y: ey(pe), face: pe.face, anim: pe.anim,
    pose: w.state === 'dead' ? 'dead' : pe.dig ? 'dig' : poseOf(w, pe),
    dig: pe.dig ? pe.dig.t / DIG_T : 0,
  };
  const guards = w.guards.filter((g) => g.st !== 'dead').map((g) => ({
    x: ex(g), y: ey(g), face: g.face, anim: g.anim, carry: g.carry, pose: g.st === 'trap' ? 'trap' : poseOf(w, g), t: g.trapT,
  }));
  return {
    cells: w.grid, gold: w.gold, exitOpen: w.exitOpen, holes: w.holes.map((h) => ({ x: h.x, y: h.y, ph: h.ph, k: Math.min(1, h.t / (h.ph === 'dig' ? DIG_T : h.ph === 'close' ? CLOSE_T : OPEN_T)) })),
    player: p, guards, md: w.md === undefined ? 99 : w.md,
  };
}
function poseOf(w, e) {
  const c = cell(w, e.tx, e.ty);
  const moving = e.dx !== 0 || e.dy !== 0;
  if (e.fall) return 'fall';
  if (isLadder(w, c) || (e.dy !== 0 && isLadder(w, cell(w, e.tx + e.dx, e.ty + e.dy)))) return moving ? 'climb' : 'climbIdle';
  if (c === '-') return moving ? 'hang' : 'hangIdle';
  if (e.dy !== 0) return 'climb';
  return moving ? 'run' : 'idle';
}
function snapshot(v) {
  return {
    cells: v.cells.map((r) => r.join('')), gold: v.gold.map((r) => Array.from(r)), exitOpen: v.exitOpen,
    holes: v.holes.map((h) => ({ ...h })), player: { ...v.player }, guards: v.guards.map((g) => ({ ...g })), md: v.md,
  };
}

// ---------- Stage flow ----------
function startStage(i) {
  stageIdx = i;
  world = newWorld(i);
  inp = { dir: null, digBuf: null };
  particles = [];
  rec = []; recAcc = 0; clip = null; clipPost = 0; clipMin = 99; replay = null;
  state = 'play';
  hideOverlay();
  updateHud();
}

function updateHud() {
  $('stageNo').textContent = `${stageIdx + 1}/${LEVELS.length}`;
  $('gold').textContent = world ? `${world.goldTotal - world.goldLeft}/${world.goldTotal}` : '0/0';
  $('time').textContent = world ? fmt(world.time) : '0.0';
  $('best').textContent = times[stageIdx] ? fmt(times[stageIdx]) : '-';
}

function burst(x, y, color, n, spd) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = spd * (0.4 + Math.random() * 0.8);
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.45 + Math.random() * 0.3, r: 1.5 + Math.random() * 2.5, color });
  }
}

function handleEvents(events) {
  for (const e of events) {
    if (e.type === 'dig') { sfx.dig(); const s = world.player.dig ? world.player.dig.side : 1; burst((world.player.tx + s + 0.5) * T, (world.player.ty + 1) * T, '#d9824a', 8, 70); }
    else if (e.type === 'gold') { sfx.gold(e.left); burst((world.player.tx + 0.5) * T, (world.player.ty + 0.5) * T, '#ffd23f', 10, 90); }
    else if (e.type === 'open') sfx.open();
    else if (e.type === 'trap') sfx.trap();
    else if (e.type === 'guardDie') sfx.guardDie();
    else if (e.type === 'die') { sfx.die(); }
    else if (e.type === 'win') { sfx.win(); onWin(); }
  }
}

function onWin() {
  const t = world.time;
  const fresh = saveTime(stageIdx, t);
  const close = world.minDist < 90 ? world.minDist : null;
  // 리플레이: 경비와 가장 가까웠던 순간이 있으면 그 앞뒤, 없으면 탈출 직전 장면
  const frames = clip && clipMin < 2.2 ? clip : rec.slice();
  replay = frames.length > 4 ? frames : null;
  result = { stage: stageIdx, time: t, fresh, close, replayKind: clip && clipMin < 2.2 ? 'close' : 'escape' };
  updateHud();
}

function afterClearDelay() {
  const hasNext = stageIdx + 1 < LEVELS.length;
  const badge = result.close !== null && result.close < 1.3
    ? `<p class="badge">😱 경비와 딱 ${result.close.toFixed(1)}칸 차이로 탈출!</p>` : '';
  showOverlay(`
    <h2>탈출 성공!</h2>
    <div class="big">${fmt(result.time)}<small>초</small></div>
    ${result.fresh ? '<p class="badge good">✨ 이 코스 신기록!</p>' : `<p>이 코스 최고 기록 ${fmt(times[result.stage])}초</p>`}
    ${badge}
    ${hasNext ? '<button id="nextBtn">다음 코스</button>' : '<p class="badge good">🏆 모든 코스 클리어!</p>'}
    <div class="row">
      ${replay ? `<button class="sub" id="replayBtn">🎬 ${result.replayKind === 'close' ? '아슬아슬' : '리플레이'}</button>` : ''}
      <button class="sub" id="shareBtn">📋 복사</button>
      <button class="sub" id="retryBtn">🔁 다시</button>
      <button class="sub" id="courseBtn">🗂 코스</button>
    </div>`);
  $('replayBtn') && ($('replayBtn').onclick = startReplay);
  $('shareBtn').onclick = shareResult;
  $('nextBtn') && ($('nextBtn').onclick = () => startStage(stageIdx + 1));
  $('retryBtn').onclick = () => startStage(stageIdx);
  $('courseBtn').onclick = showSelect;
}

function shareResult() {
  const close = result.close !== null && result.close < 1.3 ? ` 😱 경비와 ${result.close.toFixed(1)}칸 차이로 탈출!` : '';
  const text = `🏃 로드러너 금괴 도둑 코스 ${result.stage + 1}(${LEVELS[result.stage].name}) ${fmt(result.time)}초 클리어!${close}`;
  const btn = $('shareBtn');
  const done = () => { btn.textContent = '✅ 복사했어요'; };
  if (navigator.share) navigator.share({ text }).catch(() => {});
  else if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => { btn.textContent = text; });
  else btn.textContent = text;
}

function startReplay() {
  if (!replay) return;
  state = 'replay';
  replayT = 0;
  hideOverlay();
}
function endReplay() {
  state = 'clear';
  afterClearDelay();
}

// ---------- Overlay ----------
function showOverlay(html) {
  const o = $('overlay');
  o.innerHTML = html;
  o.classList.remove('hidden');
  o.scrollTop = 0;
}
function hideOverlay() { $('overlay').classList.add('hidden'); }

function showTitle() {
  state = 'title';
  showOverlay(`
    <h1>금괴 도둑</h1>
    <p>경비를 피해 <b>금괴를 모두 모으면</b> 탈출 사다리가 나타나요.<br>땅을 파서 경비를 빠뜨리고, 금괴를 <b>미끼</b>로 유인하세요!</p>
    <button id="startBtn">시작하기</button>
    <div class="help">
      ⌨️ ← → ↑ ↓ 이동 · Z 왼쪽 파기 · X 오른쪽 파기<br>
      📱 화면 아래 버튼으로 이동·파기<br>
      R 다시 시작 · P 일시정지 · M 소리
    </div>`);
  $('startBtn').onclick = showSelect;
}

function showSelect() {
  state = 'select';
  const cells = LEVELS.map((lv, i) => {
    const open = unlocked(i);
    return `<button class="course" data-i="${i}" ${open ? '' : 'disabled'}>
      <b>${open ? i + 1 : '🔒'}</b><span>${lv.name}</span><small>${times[i] ? fmt(times[i]) + '초' : open ? '도전!' : ''}</small></button>`;
  }).join('');
  showOverlay(`<h2>코스 선택</h2><div class="courses">${cells}</div>`);
  document.querySelectorAll('.course').forEach((b) => { b.onclick = () => startStage(Number(b.dataset.i)); });
}

function pause() {
  if (state !== 'play') return;
  pausedFrom = state;
  state = 'paused';
  showOverlay(`<h2>일시정지</h2><button id="startBtn">계속하기</button><div class="row"><button class="sub" id="retryBtn">다시 하기</button><button class="sub" id="courseBtn">코스 선택</button></div>`);
  $('startBtn').onclick = resume;
  $('retryBtn').onclick = () => startStage(stageIdx);
  $('courseBtn').onclick = showSelect;
}
function resume() {
  if (state !== 'paused') return;
  state = pausedFrom;
  hideOverlay();
}

// ---------- Drawing ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBrick(x, y, k = 0, ph = '') {
  ctx.fillStyle = '#e0894f';
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = '#b8662f';
  ctx.fillRect(x, y + T - 5, T, 5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + T / 2); ctx.lineTo(x + T, y + T / 2);
  ctx.moveTo(x + T / 2, y); ctx.lineTo(x + T / 2, y + T / 2);
  ctx.moveTo(x + T / 4, y + T / 2); ctx.lineTo(x + T / 4, y + T);
  ctx.moveTo(x + T * 3 / 4, y + T / 2); ctx.lineTo(x + T * 3 / 4, y + T);
  ctx.stroke();
  ctx.strokeRect(x + 0.75, y + 0.75, T - 1.5, T - 1.5);
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.fillRect(x + 2, y + 2, T - 4, 3);
  if (ph === 'dig') {
    // 파 들어가는 중: 위에서부터 어두운 구멍이 커진다
    ctx.fillStyle = '#1a1238';
    ctx.fillRect(x + T * (0.5 - 0.5 * k), y, T * k, T * 0.55 * k + 2);
  }
}
function drawConcrete(x, y) {
  ctx.fillStyle = '#8b97b8';
  ctx.fillRect(x, y, T, T);
  ctx.fillStyle = '#6f7b9c';
  ctx.fillRect(x, y + T - 5, T, 5);
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.75, y + 0.75, T - 1.5, T - 1.5);
  ctx.fillStyle = INK;
  for (const [ox, oy] of [[5, 5], [T - 5, 5], [5, T - 8], [T - 5, T - 8]]) { ctx.beginPath(); ctx.arc(x + ox, y + oy, 1.6, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.fillRect(x + 2, y + 2, T - 4, 3);
}
function drawLadder(x, y, glow) {
  ctx.lineCap = 'round';
  const rails = [x + 7, x + T - 7];
  ctx.strokeStyle = INK; ctx.lineWidth = 5.5;
  for (const rx of rails) { ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx, y + T); ctx.stroke(); }
  for (let ry = y + 4; ry < y + T; ry += 7.5) { ctx.beginPath(); ctx.moveTo(rails[0], ry); ctx.lineTo(rails[1], ry); ctx.stroke(); }
  ctx.strokeStyle = glow ? '#8dffb0' : '#ffd23f'; ctx.lineWidth = 2.5;
  for (const rx of rails) { ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx, y + T); ctx.stroke(); }
  ctx.lineWidth = 2;
  for (let ry = y + 4; ry < y + T; ry += 7.5) { ctx.beginPath(); ctx.moveTo(rails[0], ry); ctx.lineTo(rails[1], ry); ctx.stroke(); }
}
function drawRope(x, y) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + T, y + 6); ctx.stroke();
  ctx.strokeStyle = '#f0d9a8'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x + T, y + 6); ctx.stroke();
  ctx.strokeStyle = '#b8935a'; ctx.lineWidth = 1.5;
  for (let i = 3; i < T; i += 7) { ctx.beginPath(); ctx.moveTo(x + i, y + 4.5); ctx.lineTo(x + i + 3, y + 7.5); ctx.stroke(); }
}
function drawGoldBar(x, y, t) {
  const b = y + T - 3;
  ctx.beginPath();
  ctx.moveTo(x + 4, b); ctx.lineTo(x + T - 4, b); ctx.lineTo(x + T - 8, b - 11); ctx.lineTo(x + 8, b - 11);
  ctx.closePath();
  ctx.fillStyle = '#ffd23f'; ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.stroke();
  ctx.fillStyle = '#fff3a8';
  ctx.fillRect(x + 9, b - 9, 8, 2.5);
  if (Math.floor(t * 3 + x) % 4 === 0) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(x + T - 8, b - 17); ctx.lineTo(x + T - 6, b - 13); ctx.lineTo(x + T - 2, b - 11); ctx.lineTo(x + T - 6, b - 9); ctx.lineTo(x + T - 8, b - 5);
    ctx.lineTo(x + T - 10, b - 9); ctx.lineTo(x + T - 14, b - 11); ctx.lineTo(x + T - 10, b - 13);
    ctx.closePath(); ctx.fill();
  }
}

// 사람 그리기. 발끝 중앙이 기준.
const SKIN = '#ffd9b0';
function drawActor(a, kind, t) {
  const cx = a.x * T + T / 2, by = a.y * T + T;
  const pal = kind === 'thief'
    ? { body: '#ffffff', stripe: '#2b1d52', legs: '#2b1d52', cap: '#2b1d52' }
    : { body: '#3d6bff', stripe: '#3d6bff', legs: '#26399a', cap: '#26399a' };
  ctx.save();
  ctx.translate(cx, by);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const sw = Math.sin(a.anim * Math.PI * 2);
  const pose = a.pose;
  let lean = 0, hang = 0;

  if (pose === 'dead') {
    ctx.translate(0, -6);
    ctx.rotate(Math.min(1, (a.dead || 0)) * 1.4 + 0.2);
  }
  if (pose === 'trap') {
    ctx.beginPath(); ctx.rect(-T, -T * 0.62, T * 2, T); ctx.clip();
    ctx.translate(0, 1);
  }
  if (pose === 'hang' || pose === 'hangIdle') hang = 7;
  if (pose !== 'climb' && pose !== 'climbIdle') ctx.scale(a.face || 1, 1);
  const bob = pose === 'run' ? Math.abs(sw) * 1.2 : 0;
  ctx.translate(0, -bob);

  // 다리
  ctx.strokeStyle = INK; ctx.lineWidth = 6;
  const legs = (l, r) => {
    for (const [dx, dy] of [l, r]) { ctx.beginPath(); ctx.moveTo(0, -10 + hang); ctx.lineTo(dx, dy + hang * 0.2); ctx.stroke(); }
  };
  if (pose === 'run') legs([sw * 6, -1], [-sw * 6, -1]);
  else if (pose === 'climb') legs([-4, -2 + sw * 3], [4, -2 - sw * 3]);
  else if (pose === 'fall') legs([-5, -3], [5, -1]);
  else if (pose === 'trap') legs([-3, 0], [3, 0]);
  else legs([-3.5, 0], [3.5, 0]);
  ctx.strokeStyle = pal.legs; ctx.lineWidth = 3.5;
  if (pose === 'run') legs([sw * 6, -1], [-sw * 6, -1]);
  else if (pose === 'climb') legs([-4, -2 + sw * 3], [4, -2 - sw * 3]);
  else if (pose === 'fall') legs([-5, -3], [5, -1]);
  else if (pose === 'trap') legs([-3, 0], [3, 0]);
  else legs([-3.5, 0], [3.5, 0]);

  // 몸통
  const top = -19 + hang, bot = -8 + hang;
  ctx.fillStyle = pal.body;
  roundRect(-6, top, 12, bot - top + 2, 4);
  ctx.fill();
  if (kind === 'thief') {
    ctx.fillStyle = pal.stripe;
    for (let sy = top + 3; sy < bot; sy += 4.5) ctx.fillRect(-6, sy, 12, 2);
  } else {
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(2.5, top + 5, 1.8, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = INK; ctx.lineWidth = 2;
  roundRect(-6, top, 12, bot - top + 2, 4);
  ctx.stroke();

  // 팔
  ctx.strokeStyle = INK; ctx.lineWidth = 5;
  const arm = (x1, y1, x2, y2) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const sh = top + 3;
  const armsOf = () => {
    if (pose === 'run') return [[0, sh, -sw * 6, sh + 7], [0, sh, sw * 6, sh + 7]];
    if (pose === 'climb') return [[-5, sh, -7, sh - 6 + sw * 5], [5, sh, 7, sh - 6 - sw * 5]];
    if (pose === 'climbIdle') return [[-5, sh, -7, sh - 6], [5, sh, 7, sh - 4]];
    if (pose === 'hang' || pose === 'hangIdle') return [[-3, sh, -4, sh - 12], [3, sh, 4, sh - 12]];
    if (pose === 'fall') return [[-5, sh, -9, sh - 8], [5, sh, 9, sh - 8]];
    if (pose === 'dig') { const s = Math.sin((a.dig || 0) * Math.PI); return [[0, sh, 7 + s * 3, sh + 6 - s * 10]]; }
    if (pose === 'trap') return [[-5, sh, -9, sh - 8 + sw * 2], [5, sh, 9, sh - 8 - sw * 2]];
    return [[-5, sh, -6, sh + 8], [5, sh, 6, sh + 8]];
  };
  const arms = armsOf();
  for (const [x1, y1, x2, y2] of arms) arm(x1, y1, x2, y2);
  ctx.strokeStyle = kind === 'thief' ? '#ffffff' : pal.body; ctx.lineWidth = 2.5;
  for (const [x1, y1, x2, y2] of arms) arm(x1, y1, x2, y2);
  ctx.fillStyle = SKIN;
  for (const [, , x2, y2] of arms) { ctx.beginPath(); ctx.arc(x2, y2, 2.3, 0, Math.PI * 2); ctx.fill(); }

  // 곡괭이
  if (pose === 'dig') {
    const s = Math.sin((a.dig || 0) * Math.PI);
    const hx = 7 + s * 3, hy = sh + 6 - s * 10;
    ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 7, hy + 10); ctx.stroke();
    ctx.strokeStyle = '#b8935a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 7, hy + 10); ctx.stroke();
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(hx + 2, hy + 10); ctx.lineTo(hx + 12, hy + 6); ctx.stroke();
  }

  // 머리
  const hy = top - 6;
  ctx.fillStyle = SKIN;
  ctx.beginPath(); ctx.arc(0, hy, 7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  if (kind === 'thief') {
    ctx.fillStyle = pal.cap;
    ctx.fillRect(-7, hy - 2.5, 14, 4.5);            // 복면 띠
    ctx.beginPath(); ctx.arc(0, hy - 2, 7, Math.PI, 0); ctx.fill();  // 비니
    ctx.fillStyle = '#fff';
    ctx.fillRect(1.5, hy - 1.5, 2.5, 2.5); ctx.fillRect(-4, hy - 1.5, 2.5, 2.5);
  } else {
    ctx.fillStyle = pal.cap;
    ctx.beginPath(); ctx.arc(0, hy - 2, 7.5, Math.PI, 0); ctx.fill();
    ctx.fillRect(-1, hy - 3, 10, 2.5);              // 챙
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath(); ctx.arc(1, hy - 6, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK;
    ctx.fillRect(2, hy, 2, 2.5); ctx.fillRect(-3.5, hy, 2, 2.5);
  }
  if (pose === 'dead') {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    for (const ox of [-2.5, 2.5]) { ctx.beginPath(); ctx.moveTo(ox - 1.5, hy - 1); ctx.lineTo(ox + 1.5, hy + 2); ctx.moveTo(ox + 1.5, hy - 1); ctx.lineTo(ox - 1.5, hy + 2); ctx.stroke(); }
  }
  ctx.restore();

  if (a.carry) {
    const ty = by - 34 + Math.sin(t * 6) * 1;
    ctx.save(); ctx.translate(cx, ty); ctx.scale(0.55, 0.55);
    ctx.beginPath(); ctx.moveTo(-10, 8); ctx.lineTo(10, 8); ctx.lineTo(6, -3); ctx.lineTo(-6, -3); ctx.closePath();
    ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  if (pose === 'trap') {
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 3; i++) {
      const ang = t * 5 + i * 2.1;
      ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * 8, by - 27 + Math.sin(ang) * 2.5, 2.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

function drawScene(v, t, banner) {
  // 배경
  ctx.fillStyle = '#1c1440';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255,255,255,.035)';
  for (let y = 0; y < ROWS; y += 2) ctx.fillRect(0, y * T, W, T);

  const holeMap = new Map(v.holes.map((h) => [h.y * COLS + h.x, h]));
  let exitCol = -1;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = v.cells[y][x], px = x * T, py = y * T;
      const hole = holeMap.get(y * COLS + x);
      if (ch === '#') drawBrick(px, py, hole ? hole.k : 0, hole ? hole.ph : '');
      else if (ch === '=') drawConcrete(px, py);
      else if (ch === 'H') drawLadder(px, py, false);
      else if (ch === 'h') { if (v.exitOpen) { drawLadder(px, py, true); if (y === 0) exitCol = x; } }
      else if (ch === '-') drawRope(px, py);
      // 열려 있는 구멍: 메워지는 동안 벽돌이 아래에서 올라온다
      if (hole && ch === '.' && hole.ph === 'close') {
        ctx.save();
        ctx.beginPath(); ctx.rect(px, py + T * (1 - hole.k), T, T * hole.k); ctx.clip();
        drawBrick(px, py);
        ctx.restore();
      }
      if (hole && ch === '.' && hole.ph === 'open') {
        ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]); ctx.strokeRect(px + 1, py + 1, T - 2, T - 2); ctx.setLineDash([]);
      }
      if (v.gold[y][x]) drawGoldBar(px, py, t);
    }
  }
  if (exitCol >= 0) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.font = "16px 'Jua', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tx = exitCol * T + T / 2 + (exitCol > COLS - 4 ? -34 : 34);
    ctx.fillStyle = `rgba(141,255,176,${0.6 + pulse * 0.4})`;
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.strokeText('탈출!', tx, T / 2); ctx.fillText('탈출!', tx, T / 2);
  }

  for (const g of v.guards) drawActor(g, 'guard', t);
  drawActor(v.player, 'thief', t);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  ctx.globalAlpha = 1;

  if (banner) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    banner.forEach((b, i) => {
      ctx.font = `${b.size}px 'Jua', sans-serif`;
      ctx.strokeStyle = INK; ctx.lineWidth = b.size / 4;
      ctx.strokeText(b.text, W / 2, b.y); ctx.fillStyle = b.color; ctx.fillText(b.text, W / 2, b.y);
    });
  }
}

// ---------- Main loop ----------
let last = 0, acc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000 || 0);
  last = now;
  uiT += dt;

  if (state === 'replay' && replay) {
    replayT += dt;
    const f = replayT / REC_DT;
    if (f >= replay.length - 1) { endReplay(); }
    else {
      const i = Math.floor(f), k = f - i, a = replay[i], b = replay[i + 1];
      const lerp = (p, q) => ({ ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k });
      const view = { ...a, cells: a.cells, player: lerp(a.player, b.player), guards: a.guards.map((g, gi) => (b.guards[gi] ? lerp(g, b.guards[gi]) : g)) };
      drawScene(view, uiT, [{ text: `🎬 ${result.replayKind === 'close' ? '아슬아슬 순간' : '탈출 장면'}`, y: 20, size: 20, color: '#ffd23f' }, { text: '탭하면 닫기', y: H - 16, size: 14, color: '#fff' }]);
    }
    requestAnimationFrame(frame);
    return;
  }

  if (world && state !== 'paused' && state !== 'title' && state !== 'select') {
    if (state === 'play' || state === 'dead' || state === 'clear') {
      acc += dt;
      let steps = 0;
      while (acc >= 1 / 120 && steps++ < 12) {
        acc -= 1 / 120;
        const events = stepWorld(world, 1 / 120, inp);
        if (events.length) handleEvents(events);
        if (world.state === 'dead' && state === 'play') { state = 'dead'; }
        if (world.state === 'clear' && state === 'play') { state = 'clear'; setTimeout(() => { if (state === 'clear') afterClearDelay(); }, 900); }
      }
      // 리플레이용 기록
      if (world.state === 'play') {
        recAcc += dt;
        while (recAcc >= REC_DT) {
          recAcc -= REC_DT;
          const s = snapshot(makeView(world));
          rec.push(s);
          if (rec.length > REC_KEEP) rec.shift();
          if (s.md < clipMin - 0.05) { clipMin = s.md; clip = rec.slice(); clipPost = CLIP_POST; }
          else if (clip && clipPost > 0) { clip.push(s); clipPost--; }
        }
      }
      if (state === 'dead' && world.deadT > 1.1 && $('overlay').classList.contains('hidden')) {
        showOverlay(`<h2>잡혔다! 😵</h2><p>경비에게 걸렸어요.</p><button id="startBtn">다시 하기</button><div class="row"><button class="sub" id="courseBtn">코스 선택</button></div>`);
        $('startBtn').onclick = () => startStage(stageIdx);
        $('courseBtn').onclick = showSelect;
      }
    }
    // 파티클
    for (const p of particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 420 * dt; }
    particles = particles.filter((p) => p.life > 0);
    updateHud();
  }

  if (world) {
    const v = makeView(world);
    if (state === 'dead') v.player.dead = Math.min(1, world.deadT * 2);
    let banner = null;
    if (world.state === 'ready') {
      banner = [
        { text: `코스 ${stageIdx + 1}`, y: H / 2 - 30, size: 30, color: '#ffd23f' },
        { text: LEVELS[stageIdx].name, y: H / 2 + 6, size: 24, color: '#fff' },
        { text: '움직이면 시작!', y: H / 2 + 44, size: 18, color: '#8dffb0' },
      ];
    }
    drawScene(v, uiT, banner);
  } else {
    // 타이틀 뒤 배경
    ctx.fillStyle = '#1c1440';
    ctx.fillRect(0, 0, W, H);
  }
  requestAnimationFrame(frame);
}

// ---------- Input ----------
const KEY_DIR = { ArrowLeft: 'L', KeyA: 'L', ArrowRight: 'R', KeyD: 'R', ArrowUp: 'U', KeyW: 'U', ArrowDown: 'D', KeyS: 'D' };
function setDir() { inp.dir = held.length ? held[held.length - 1] : null; }
function pressDir(d) { held = held.filter((x) => x !== d); held.push(d); setDir(); }
function releaseDir(d) { held = held.filter((x) => x !== d); setDir(); }
function queueDig(side) { if (state === 'play') inp.digBuf = { side, age: 0 }; }

addEventListener('keydown', (e) => {
  if (e.code in KEY_DIR) { e.preventDefault(); if (!e.repeat) pressDir(KEY_DIR[e.code]); return; }
  if (e.repeat) return;
  if (e.code === 'KeyZ' || e.code === 'KeyQ') { queueDig(-1); return; }
  if (e.code === 'KeyX' || e.code === 'KeyE') { queueDig(1); return; }
  if (state === 'replay') { endReplay(); return; }
  if (e.code === 'KeyR' && world && (state === 'play' || state === 'dead')) { startStage(stageIdx); return; }
  if (e.code === 'KeyP' || e.code === 'Escape') { state === 'paused' ? resume() : pause(); return; }
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => { if (e.code in KEY_DIR) releaseDir(KEY_DIR[e.code]); });
function clearInput() { held = []; inp.dir = null; }
addEventListener('blur', () => { clearInput(); pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { clearInput(); pause(); } });
canvas.addEventListener('pointerdown', () => { if (state === 'replay') endReplay(); });

// 화면 버튼
const pad = $('pad');
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0 || /[?&]pad=1/.test(location.search);
if (isTouch) document.body.classList.add('touch');
pad.querySelectorAll('button').forEach((b) => {
  const k = b.dataset.k, dg = b.dataset.dig;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    b.classList.add('on');
    if (k) pressDir(k); else queueDig(Number(dg));
  });
  const up = () => { b.classList.remove('on'); if (k) releaseDir(k); };
  b.addEventListener('pointerup', up);
  b.addEventListener('pointercancel', up);
  b.addEventListener('lostpointercapture', up);
});

function toggleMute() {
  muted = !muted;
  store.set('loderunnerMuted', muted ? '1' : '0');
  $('muteBtn').textContent = muted ? '🔇' : '🔊';
}
$('muteBtn').onclick = (e) => { e.currentTarget.blur(); toggleMute(); };
$('pauseBtn').onclick = (e) => { e.currentTarget.blur(); state === 'paused' ? resume() : pause(); };
$('muteBtn').textContent = muted ? '🔇' : '🔊';

showTitle();
fit();
requestAnimationFrame(frame);
}
