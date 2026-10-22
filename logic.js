'use strict';

// 금괴 도둑(로드러너): 규칙만 모아 둔 파일 (그리기·입력·소리 없음). 브라우저와 테스트(Node)가 같이 쓴다.
//
// - 경비를 피해 금괴를 모두 모으면 숨은 사다리(h)가 나타나고, 맨 윗줄로 올라가면 탈출
// - 바닥 벽돌(#)을 옆으로 파면 잠시 구멍이 열리고, 경비가 빠지면 한동안 갇힌다. 구멍이 메워질 때 안에 있으면 죽고 다시 나온다
// - 경비는 가까운 금괴를 미끼로 쫓기도 하고, 금괴를 주웠다가 내려놓기도 한다
// stepWorld(w, dt, inp) 가 한 번 진행하고 일어난 일(events)을 돌려준다. 소리·효과·화면은 game.js 가 맡는다.
const LOGIC_LODERUNNER = (() => {
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

return {
  COLS, ROWS, T, W, H, LEVELS, PLAYER_SPD, GUARD_SPD, DIG_T, OPEN_T, CLOSE_T, TRAP_ESCAPE, RESPAWN_T, CATCH_R, N,
  idx, cell, solid, isLadder, terrainSupport, moveOptions, bfs, parseLevel, makeEnt, ex, ey, nearTile, newWorld,
  guardAtTile, holeAt, standing, canDig, stepWorld,
};
})();
if (typeof module !== 'undefined') module.exports = LOGIC_LODERUNNER;
