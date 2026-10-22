'use strict';
// 오락실 튜토리얼이 '진짜로 일어난 일'을 알아채는 신호 (arcade/public/tutorial.js 가 듣는다. 튜토리얼이 아니면 아무도 안 듣는다)
const tutorialSignal = (type) => window.dispatchEvent(new CustomEvent('arcade:tutorial', { detail: { type } }));

// 금괴 도둑: 화면·입력·소리·기록·리플레이. 규칙(지형·이동·파기·경비·구멍)은 logic.js (LOGIC_LODERUNNER) 에 있다.
const L = LOGIC_LODERUNNER;
const { COLS, ROWS, T, W, H, LEVELS, DIG_T, OPEN_T, CLOSE_T, cell, isLadder, ex, ey, newWorld, stepWorld } = L;
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
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
    tutorialSignal(e.type);
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
      <span class="pc">⌨️ ← → ↑ ↓ 이동 · Z 왼쪽 파기 · X 오른쪽 파기<br>R 다시 시작 · P 일시정지 · M 소리</span>
      <span class="touch">👆 화면 아래 버튼으로 이동·파기</span>
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
    try { b.setPointerCapture(e.pointerId); } catch (_) {}      // 손가락이 이미 떨어졌으면 예외가 난다
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
