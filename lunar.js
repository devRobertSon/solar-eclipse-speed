'use strict';

/* =====================================================================
 * 월식 시뮬레이션
 * 일식과 똑같이 달은 동쪽(왼쪽)으로 공전하지만, 월식에서는 달이 '가려지는 쪽'이라
 * 앞서가는 동쪽(왼쪽) 가장자리부터 지구 그림자에 들어간다 → 일식과 반대로 보임.
 * 의존성 없음 — 순수 Canvas 2D. (solar.js와 동일한 골격)
 * ===================================================================== */

/* ---------- 색상 (라이트 테마 + 밤하늘/핏빛 그림자) ---------- */
const C = {
  panel: '#ffffff',
  sun: '#f5a201',
  sunCore: '#ffd866',
  sunRim: 'rgba(180, 120, 0, 0.55)',
  moonPale: '#f3efe0',
  earth: '#2f74de',
  earthDeep: '#1c4fa0',
  umbra: 'rgba(95, 34, 22, 0.95)',   // 핏빛 본영
  vLin: '#15803d',
  vAng: '#ea580c',
  text: '#18202e',
  dim: '#5a6679',
  accent: '#0e7490',
  red: '#b23a23',
  grid: 'rgba(20, 30, 50, 0.12)',
  night: ['#070912', '#0e1426'],
};
const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", ui-sans-serif, system-ui, sans-serif';

/* ---------- 상태 ---------- */
const DURATION = 16; // 초, p:0→1
const state = { p: 0, playing: true, speed: 1, showVectors: true, scrubbing: false };

const SNAPSHOTS = [
  { p: 0.00, label: '1차 접촉(동)' },
  { p: 0.25, label: '부분식' },
  { p: 0.50, label: '개기·최대' },
  { p: 0.75, label: '부분식' },
  { p: 1.00, label: '종료(서)' },
];

/* ---------- 그리기 헬퍼 ---------- */
function text(ctx, s, x, y, opt = {}) {
  const { size = 12, color = C.text, align = 'left', baseline = 'alphabetic', weight = '400' } = opt;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillText(s, x, y);
}
function arrow(ctx, x1, y1, x2, y2, color, w = 2.5, head = 8) {
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
  ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
  ctx.closePath(); ctx.fill();
}
function panelTitle(ctx, s, color) {
  text(ctx, s, 12, 20, { size: 13, weight: '700', color: color || C.text });
}
function disc(ctx, s, W, H, color) {
  text(ctx, s, W - 10, H - 8, { size: 10.5, color: color || C.dim, align: 'right' });
}

/* =====================================================================
 * ① 북극 상공 — 지구가 만든 본영을 달이 동쪽으로 통과
 * ===================================================================== */
function drawSpaceL(ctx, W, H, p) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '① 북극 상공에서 본 지구–그림자–달');

  const Ey = H * 0.55;
  const Re = Math.min(H * 0.17, 46);
  const Ex = W * 0.30;

  /* 평행한 햇빛 (왼→오) */
  for (let i = 0; i < 5; i++) {
    const ry = Ey - Re * 1.2 + (i * Re * 2.4) / 4;
    arrow(ctx, 6, ry, 46, ry, 'rgba(235,150,15,0.75)', 2, 6);
  }
  text(ctx, '햇빛(평행)', 6, Ey - Re * 1.2 - 7, { size: 10.5, color: C.sun });

  const uLen = (W - Ex) * 0.92;
  const xApex = Ex + uLen;

  /* 반영(penumbra): 바깥쪽으로 벌어짐 */
  ctx.fillStyle = 'rgba(20,30,50,0.08)';
  ctx.beginPath();
  ctx.moveTo(Ex, Ey - Re); ctx.lineTo(xApex, Ey - Re * 2.4);
  ctx.lineTo(xApex, Ey + Re * 2.4); ctx.lineTo(Ex, Ey + Re);
  ctx.closePath(); ctx.fill();

  /* 본영(umbra): 지구 양 끝 → 한 점으로 수렴하는 어두운 원뿔 */
  ctx.fillStyle = 'rgba(10,14,28,0.80)';
  ctx.beginPath();
  ctx.moveTo(Ex, Ey - Re); ctx.lineTo(xApex, Ey); ctx.lineTo(Ex, Ey + Re);
  ctx.closePath(); ctx.fill();
  text(ctx, '지구 본영(그림자)', (Ex + xApex) / 2, Ey - 6, { size: 10.5, color: '#cdd6e6', align: 'center' });

  /* 달 궤도(압축) + 달이 본영을 세로로 통과 */
  const aM = Math.min(W - Ex - 28, Re * 3.6);
  const moonXc = Ex + aM;
  const Uh = Math.max(8, Re * (xApex - moonXc) / uLen); // 달 거리에서 본영 반폭
  const Rm = Math.max(5, Re * 0.22);
  const my = Ey + (1 - 2 * p) * (Uh + Rm);             // 아래→위(반시계=동쪽)
  const mx = Ex + Math.sqrt(Math.max(0, aM * aM - (my - Ey) * (my - Ey)));

  ctx.strokeStyle = 'rgba(20,30,50,0.16)';
  ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(Ex, Ey, aM, -1.0, 1.0); ctx.stroke();
  ctx.setLineDash([]);

  /* 지구 (왼쪽 낮·오른쪽 밤) */
  const eg = ctx.createLinearGradient(Ex - Re, Ey, Ex + Re, Ey);
  eg.addColorStop(0, C.earth); eg.addColorStop(1, C.earthDeep);
  ctx.fillStyle = eg;
  ctx.beginPath(); ctx.arc(Ex, Ey, Re, 0, Math.PI * 2); ctx.fill();
  const ng = ctx.createLinearGradient(Ex - Re, Ey, Ex + Re, Ey);
  ng.addColorStop(0, 'rgba(0,0,0,0)'); ng.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = ng;
  ctx.beginPath(); ctx.arc(Ex, Ey, Re, 0, Math.PI * 2); ctx.fill();
  text(ctx, '지구', Ex, Ey + Re + 14, { size: 10.5, color: C.dim, align: 'center' });

  /* 달 (본영 안이면 핏빛) */
  const inUmbra = Math.abs(my - Ey) < Uh;
  ctx.fillStyle = inUmbra ? '#7a3322' : '#aeb8cc';
  ctx.beginPath(); ctx.arc(mx, my, Rm, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(40,55,85,0.55)'; ctx.lineWidth = 1; ctx.stroke();

  if (state.showVectors) {
    arrow(ctx, mx, my, mx, my - 22, C.vLin, 2.5, 7); // 공전 접선(반시계=동쪽=위)
    text(ctx, '달 공전(동쪽)', mx + 7, my - 11, { size: 10, color: C.vLin });
  }

  disc(ctx, '거리 압축(비례 아님) · 북극 상공', W, H);
}

/* =====================================================================
 * ② 관측자 하늘(밤) — 달이 왼쪽(동)부터 어두워짐
 * ===================================================================== */
function drawSkyL(ctx, W, H, p) {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, C.night[0]); sky.addColorStop(1, C.night[1]);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  const stars = [[40, 40], [120, 70], [255, 48], [330, 120], [80, 150], [300, 205], [205, 42], [445, 95], [415, 205], [150, 215], [500, 60], [520, 160]];
  for (const [sx, sy] of stars) { if (sx < W - 4 && sy < H - 4) { ctx.beginPath(); ctx.arc(sx, sy, 1, 0, Math.PI * 2); ctx.fill(); } }

  panelTitle(ctx, '② 관측자가 보는 하늘 (밤)', '#e9eefc');

  const cx = W / 2, cy = H * 0.52, Rm = Math.min(W, H) * 0.16;
  const Ru = Rm * 2.6;
  const ux = cx + (2 * p - 1) * (Rm + Ru); // 본영 중심: 왼→오 (관측자 시야에서 달이 왼쪽부터 들어감)
  const uy = cy;

  /* 본영 경계 안내선(빈 하늘의 그림자는 원래 안 보이지만 위치를 점선으로 표시) */
  ctx.strokeStyle = 'rgba(180,90,70,0.4)';
  ctx.setLineDash([5, 5]); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(ux, uy, Ru, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
  text(ctx, '지구 본영(그림자)', ux, uy - Ru - 6, { size: 10.5, color: 'rgba(220,130,100,0.95)', align: 'center' });

  /* 보름달 + 겹치는 부분 어둡게(핏빛) */
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, Rm, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = C.moonPale; ctx.fillRect(cx - Rm, cy - Rm, 2 * Rm, 2 * Rm);
  ctx.fillStyle = 'rgba(150,150,165,0.32)';
  for (const [mx, mY, mr] of [[-0.3, -0.2, 0.28], [0.25, 0.18, 0.22], [-0.08, 0.42, 0.17], [0.42, -0.34, 0.13]]) {
    ctx.beginPath(); ctx.arc(cx + mx * Rm, cy + mY * Rm, mr * Rm, 0, Math.PI * 2); ctx.fill();
  }
  // 반영(옅은 어둠) 먼저
  ctx.fillStyle = 'rgba(15,12,20,0.16)';
  ctx.beginPath(); ctx.arc(ux, uy, Ru * 1.5, 0, Math.PI * 2); ctx.fill();
  // 본영(핏빛) 위에
  const ug = ctx.createRadialGradient(ux, uy, Ru * 0.2, ux, uy, Ru);
  ug.addColorStop(0, 'rgba(58,18,12,0.96)');
  ug.addColorStop(0.7, 'rgba(95,34,22,0.95)');
  ug.addColorStop(1, 'rgba(120,55,40,0.82)');
  ctx.fillStyle = ug;
  ctx.beginPath(); ctx.arc(ux, uy, Ru, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(225,225,235,0.5)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(cx, cy, Rm, 0, Math.PI * 2); ctx.stroke();

  /* 방위: 동(E) 왼쪽, 서(W) 오른쪽 */
  arrow(ctx, 64, cy, 24, cy, 'rgba(200,210,230,0.7)', 1.5, 6);
  text(ctx, '동(E)', 70, cy + 4, { size: 11, color: 'rgba(205,215,235,0.85)' });
  arrow(ctx, W - 64, cy, W - 24, cy, 'rgba(200,210,230,0.7)', 1.5, 6);
  text(ctx, '서(W)', W - 70, cy + 4, { size: 11, color: 'rgba(205,215,235,0.85)', align: 'right' });

  if (state.showVectors) {
    arrow(ctx, cx, cy - Rm - 14, cx - 34, cy - Rm - 14, '#8fd3ff', 2.5, 7);
    text(ctx, '달 공전(동←)', cx - 2, cy - Rm - 20, { size: 10.5, color: '#8fd3ff', align: 'right' });
  }

  text(ctx, '왼쪽(동)부터 어두워짐 ✓', cx, H - 24, { size: 12, weight: '700', color: '#ffb59a', align: 'center' });
  text(ctx, '일식은 오른쪽(서)부터 — 반대!', cx, H - 9, { size: 10.5, color: 'rgba(225,205,205,0.85)', align: 'center' });
}

/* =====================================================================
 * ③ 일식 ↔ 월식 — 같은 동쪽 공전, 반대쪽부터
 * ===================================================================== */
function drawWhyL(ctx, W, H, p) {
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '③ 일식 ↔ 월식 — 왜 반대쪽부터?');

  const midX = W / 2;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, H * 0.52); ctx.lineTo(W - 10, H * 0.52); ctx.stroke();

  const r = Math.min(W * 0.11, H * 0.135);

  /* 위: 일식 (달이 가린다 → 태양 오른쪽/서부터) */
  const sy = H * 0.30, sunX = midX;
  ctx.fillStyle = C.sun; ctx.beginPath(); ctx.arc(sunX, sy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = C.sunRim; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.fillStyle = '#10182b';
  ctx.beginPath(); ctx.arc(sunX + r * 0.7, sy, r * 0.98, 0, Math.PI * 2); ctx.fill();
  arrow(ctx, sunX + r * 0.7 + 12, sy, sunX + r * 0.7 - 24, sy, C.vAng, 2.5, 7);
  text(ctx, '일식: 달(가리개)이 동(←)으로', 14, sy - r - 6, { size: 11, weight: '700', color: C.text });
  text(ctx, '→ 태양 오른쪽(서)부터 가려짐', 14, sy + r + 16, { size: 11, color: C.text });

  /* 아래: 월식 (달이 가려진다 → 달 왼쪽/동부터) */
  const my = H * 0.78, moonX = midX;
  ctx.fillStyle = C.moonPale; ctx.beginPath(); ctx.arc(moonX, my, r, 0, Math.PI * 2); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.arc(moonX, my, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = C.umbra;
  ctx.beginPath(); ctx.arc(moonX - r * 0.7, my, r * 1.4, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(120,120,140,0.6)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(moonX, my, r, 0, Math.PI * 2); ctx.stroke();
  arrow(ctx, moonX + 12, my, moonX - 24, my, C.vAng, 2.5, 7);
  text(ctx, '월식: 달(피사체)이 동(←)으로', 14, my - r - 6, { size: 11, weight: '700', color: C.text });
  text(ctx, '→ 달 왼쪽(동)부터 어두워짐', 14, my + r + 16, { size: 11, color: C.text });

  disc(ctx, '둘 다 달은 동(왼쪽)으로 공전', W, H);
}

/* =====================================================================
 * ④ 요약
 * ===================================================================== */
function drawSummaryL(ctx, W, H, p) {
  ctx.fillStyle = C.panel; ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '④ 요약 — 같은 공전, 반대 결과');

  const rows = [
    ['공통', '달은 동쪽(왼쪽)으로 공전 (~1 km/s)'],
    ['일식', '달이 태양을 “가린다” → 태양 서(오른쪽)부터'],
    ['', '그림자가 지표를 동쪽으로 빠르게(≈2,000 km/h) 통과'],
    ['월식', '달이 지구 그림자에 “가려진다” → 달 동(왼쪽)부터'],
    ['', '달이 우주의 지구 본영(달 지름의 ~2.6배)을 통과'],
    ['핵심', '가리는 쪽 vs 가려지는 쪽 → 같은 동쪽 운동이 반대로'],
  ];
  let y = 48;
  for (const [tag, body] of rows) {
    if (tag) text(ctx, tag, 14, y, { size: 11.5, weight: '700', color: tag === '핵심' ? C.red : C.accent });
    text(ctx, body, 64, y, { size: 11.5, color: C.text });
    y += 27;
  }
}

/* =====================================================================
 * 캔버스 관리 & 렌더 루프 (solar.js와 동일 구조)
 * ===================================================================== */
const views = [
  { id: 'space', draw: drawSpaceL },
  { id: 'sky', draw: drawSkyL },
  { id: 'why', draw: drawWhyL },
  { id: 'summary', draw: drawSummaryL },
];

function fit(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const W = Math.max(1, Math.round(rect.width));
  const H = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  canvas._W = W; canvas._H = H; canvas._ctx = ctx;
}
function fitAll() {
  for (const v of views) { v.el = document.getElementById(v.id); if (v.el) fit(v.el); }
}
function render() {
  for (const v of views) { if (v.el) v.draw(v.el._ctx, v.el._W, v.el._H, state.p); }
}

const els = {};
function nearestPhase(p) {
  let best = SNAPSHOTS[0], d = Infinity;
  for (const s of SNAPSHOTS) { const dd = Math.abs(s.p - p); if (dd < d) { d = dd; best = s; } }
  return best.label;
}
function syncUI() {
  if (!state.scrubbing) els.slider.value = String(Math.round(state.p * 1000));
  els.phase.textContent = nearestPhase(state.p);
  els.play.textContent = state.playing ? '⏸ 일시정지' : '▶ 재생';
  els.snapBtns.forEach((btn, i) => btn.classList.toggle('active', Math.abs(SNAPSHOTS[i].p - state.p) < 0.02));
}

let lastTs = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000); lastTs = ts;
  if (state.playing && !state.scrubbing) {
    state.p += (dt * state.speed) / DURATION;
    if (state.p >= 1) state.p -= 1;
  }
  render(); syncUI();
  requestAnimationFrame(loop);
}

function init() {
  els.play = document.getElementById('playBtn');
  els.slider = document.getElementById('timeSlider');
  els.phase = document.getElementById('phaseLabel');
  els.speed = document.getElementById('speedSel');
  els.snaps = document.getElementById('snapshots');
  els.vectors = document.getElementById('toggleVectors');

  els.snapBtns = SNAPSHOTS.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'snap-btn';
    b.textContent = `${i + 1}. ${s.label}`;
    b.addEventListener('click', () => { state.p = s.p; state.playing = false; syncUI(); });
    els.snaps.appendChild(b);
    return b;
  });

  els.play.addEventListener('click', () => { state.playing = !state.playing; syncUI(); });
  els.slider.addEventListener('input', () => { state.p = Number(els.slider.value) / 1000; });
  els.slider.addEventListener('pointerdown', () => { state.scrubbing = true; });
  const endScrub = () => { state.scrubbing = false; };
  els.slider.addEventListener('pointerup', endScrub);
  els.slider.addEventListener('pointercancel', endScrub);
  els.slider.addEventListener('change', endScrub);
  els.speed.addEventListener('change', () => { state.speed = Number(els.speed.value); });
  els.vectors.addEventListener('change', () => { state.showVectors = els.vectors.checked; });

  fitAll();
  window.addEventListener('resize', () => { fitAll(); render(); });
  requestAnimationFrame(loop);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
