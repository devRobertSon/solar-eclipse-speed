'use strict';

/* =====================================================================
 * 일식 달그림자 속도 시뮬레이션
 * 각속도(지구 자전이 큼) vs 선속도(달이 큼) 를 4개 시점으로 보여준다.
 * 의존성 없음 — 순수 Canvas 2D.
 * ===================================================================== */

/* ---------- 물리 상수 & 유도값 (실제 값) ---------- */
const PHYS = (() => {
  const R_E = 6371;            // km, 지구 반지름
  const d_M = 384400;          // km, 달 공전 궤도 반지름
  const T_E = 23.934 * 3600;   // s, 지구 자전(항성일)
  const T_M = 27.32 * 86400;   // s, 달 공전(항성월)
  const wE = (2 * Math.PI) / T_E;       // rad/s, 지구 자전 각속도
  const wM = (2 * Math.PI) / T_M;       // rad/s, 달 공전 각속도
  const vSurf = wE * R_E * 1000;        // m/s, 적도 지표 선속도 ≈ 465
  const vMoon = wM * d_M * 1000;        // m/s, 달 공전 선속도   ≈ 1023
  return {
    R_E, d_M, wE, wM, vSurf, vMoon,
    wRatio: wE / wM,           // ≈ 27.4 (지구 자전이 빠름)
    vRatio: vMoon / vSurf,     // ≈ 2.20 (달이 빠름)
    rRatio: d_M / R_E,         // ≈ 60.3
    vGround: vMoon - vSurf,    // m/s, 지면 대비 그림자 속도 ≈ 558
  };
})();

const fmt = (x, d = 0) =>
  Number(x).toLocaleString('ko-KR', { maximumFractionDigits: d, minimumFractionDigits: d });
const kmh = (ms) => ms * 3.6;

/* ---------- 색상 테마 (라이트) ---------- */
const C = {
  panel: '#ffffff',
  sky: ['#e8f4ff', '#c7e2ff'],         // 낮 하늘(부분식 중에도 밝음)
  sun: '#f5a201',
  sunCore: '#ffd866',
  sunRim: 'rgba(180, 120, 0, 0.55)',
  sunGlow: 'rgba(250, 170, 30, 0.34)',
  moon: '#10182b',                     // 어두운 달(밝은 배경에서 잘 보임)
  moonRim: 'rgba(40, 55, 85, 0.55)',
  earth: '#2f74de',
  earthDeep: '#1c4fa0',
  land: '#2f9460',
  obs: '#0e7490',                      // 청록(흰 배경 대비)
  shadow: 'rgba(10, 14, 28, 0.82)',
  penumbra: 'rgba(10, 14, 28, 0.20)',
  vLin: '#15803d',   // 선속도(linear)
  vAng: '#ea580c',   // 각속도(angular)
  wrong: '#dc2626',  // 학생들의 틀린 예측
  text: '#18202e',
  dim: '#5a6679',
  accent: '#0e7490',
  grid: 'rgba(20, 30, 50, 0.12)',
};

const FONT = '"Apple SD Gothic Neo", "Noto Sans KR", ui-sans-serif, system-ui, sans-serif';

/* ---------- 시뮬레이션 상태 ---------- */
const DURATION = 14;           // 초, p:0→1 (속도 1× 기준)
const state = {
  p: 0,                        // 0=1차 접촉, 0.5=최대식, 1=종료
  playing: true,
  speed: 1,
  showWrong: false,
  showVectors: true,
  scrubbing: false,
};

/* 미리 정의된 "여러 시점" 스냅샷 */
const SNAPSHOTS = [
  { p: 0.00, label: '1차 접촉' },
  { p: 0.25, label: '부분식 ↗' },
  { p: 0.50, label: '최대식' },
  { p: 0.75, label: '부분식 ↘' },
  { p: 1.00, label: '종료' },
];

/* =====================================================================
 * 그리기 헬퍼
 * ===================================================================== */
function text(ctx, s, x, y, opt = {}) {
  const { size = 12, color = C.text, align = 'left', baseline = 'alphabetic', weight = '400' } = opt;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.fillText(s, x, y);
}

function arrow(ctx, x1, y1, x2, y2, color, w = 2.5, head = 8) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  const a = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(a - 0.42), y2 - head * Math.sin(a - 0.42));
  ctx.lineTo(x2 - head * Math.cos(a + 0.42), y2 - head * Math.sin(a + 0.42));
  ctx.closePath();
  ctx.fill();
}

function curvedArrow(ctx, cx, cy, r, a0, a1, color, w = 3) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, a0, a1, a1 < a0);
  ctx.stroke();
  // 끝점에 화살촉
  const ex = cx + r * Math.cos(a1);
  const ey = cy + r * Math.sin(a1);
  const dir = a1 > a0 ? 1 : -1;
  const ta = a1 + (dir * Math.PI) / 2; // 접선 방향
  const head = 7;
  ctx.beginPath();
  ctx.moveTo(ex, ey);
  ctx.lineTo(ex - head * Math.cos(ta - 0.4), ey - head * Math.sin(ta - 0.4));
  ctx.lineTo(ex - head * Math.cos(ta + 0.4), ey - head * Math.sin(ta + 0.4));
  ctx.closePath();
  ctx.fill();
}

function panelTitle(ctx, s) {
  text(ctx, s, 12, 20, { size: 13, weight: '700', color: C.text });
}

function disc(ctx, s, W, H) {
  text(ctx, s, W - 10, H - 8, { size: 10.5, color: C.dim, align: 'right' });
}

/* =====================================================================
 * ① 북극 상공 시점 — 자전·공전(둘 다 반시계)과 선속도 대비
 *   · 일식 전 과정(1~4차 접촉) ≈ 2시간: 지구는 ω·t ≈ 30°만 자전, 달은 ~1° 공전
 *   · 달 거리는 화면에 맞게 압축하되, 그림자가 관측자보다 빠른(선속도 2.2배) 점은 유지
 * ===================================================================== */
function drawSpace(ctx, W, H, p) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '① 북극 상공에서 본 지구–달–햇빛');

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // 북극에서 내려다본 화면: θ가 커지면 화면상 '반시계'가 되도록 y를 뒤집어 배치
  const S = (cx, cy, r, th) => [cx + r * Math.cos(th), cy - r * Math.sin(th)];

  const Ey = H * 0.56;
  const Re = Math.min(H * 0.20, 54);
  const Ex = W - Re - 30;
  const moonR = Math.max(6, Re * 0.34);

  // 실제 각이동: 일식 ≈ 2시간 동안
  const T_ECL = 2 * 3600;                      // s
  const dThE = PHYS.wE * T_ECL;                // ≈ 0.524 rad ≈ 30° (지구 자전)
  const earthArc = Re * dThE;                  // 관측자가 쓴 호 길이(px)
  const moonPath = PHYS.vRatio * earthArc;     // 달 경로 길이(px) = 2.2배(선속도 비)
  const aM = clamp(Ex - 62, 118, 230);         // 달 궤도 반지름(압축)
  const dThM = moonPath / aM;                  // 화면상 달 공전각(가시화 위해 과장)

  // p=0.5에서 태양–달–관측자 정렬(최대식)되도록 스윕을 가운데 정렬. 둘 다 반시계(θ 증가)
  const obsTh = Math.PI - dThE / 2 + dThE * p;
  const moonTh = Math.PI - dThM / 2 + dThM * p;
  const [ox, oy] = S(Ex, Ey, Re, obsTh);
  const [mx, my] = S(Ex, Ey, aM, moonTh);

  /* 평행한 햇빛 (왼→오) */
  for (let i = 0; i < 5; i++) {
    const ry = Ey - Re * 1.1 + (i * Re * 2.2) / 4;
    arrow(ctx, 6, ry, 46, ry, 'rgba(235,150,15,0.75)', 2, 6);
  }
  text(ctx, '햇빛(평행)', 6, Ey - Re * 1.1 - 7, { size: 10.5, color: C.sun });

  /* 달 공전 궤도(압축) */
  ctx.strokeStyle = 'rgba(20,30,50,0.16)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.arc(Ex, Ey, aM, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  /* 달그림자: 달에서 +x(햇빛) 방향으로 지구 sunward 표면까지 (관성계에서 관측자보다 빠르게 이동) */
  if (Math.abs(my - Ey) < Re) {
    const hitX = Ex - Math.sqrt(Re * Re - (my - Ey) * (my - Ey));
    const g = ctx.createLinearGradient(mx, my, hitX, my);
    g.addColorStop(0, 'rgba(10,14,28,0.0)');
    g.addColorStop(1, 'rgba(10,14,28,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(mx, my - moonR * 0.6);
    ctx.lineTo(hitX, my - moonR * 0.55);
    ctx.lineTo(hitX, my + moonR * 0.55);
    ctx.lineTo(mx, my + moonR * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,14,28,0.85)';
    ctx.beginPath();
    ctx.arc(hitX + 2, my, moonR * 0.45, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 지구 본체 + 회전 대륙(반시계) */
  ctx.save();
  ctx.beginPath();
  ctx.arc(Ex, Ey, Re, 0, Math.PI * 2);
  const eg = ctx.createRadialGradient(Ex - Re * 0.3, Ey - Re * 0.3, Re * 0.2, Ex, Ey, Re);
  eg.addColorStop(0, C.earth);
  eg.addColorStop(1, C.earthDeep);
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = C.land;
  const spin = dThE * (p - 0.5);
  const blobs = [[0.42, 0.35, 0.55], [0.55, -0.25, 0.42], [0.18, 1.05, 0.32]];
  for (const [br, ba, bs] of blobs) {
    const [bx, by] = S(Ex, Ey, br * Re, ba + spin);
    ctx.beginPath();
    ctx.arc(bx, by, bs * Re * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 밤 반구 음영
  const ng = ctx.createLinearGradient(Ex - Re, Ey, Ex + Re, Ey);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(Ex, Ey, Re, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  /* 관측자가 자전으로 쓸고 간 각(≈30°) — '조금만 돈다'를 강조 */
  ctx.fillStyle = 'rgba(14,116,144,0.18)';
  ctx.beginPath();
  ctx.moveTo(Ex, Ey);
  ctx.arc(Ex, Ey, Re * 0.6, -(Math.PI - dThE / 2), -obsTh, true);
  ctx.closePath();
  ctx.fill();

  /* 관측자 */
  ctx.fillStyle = C.obs;
  ctx.beginPath();
  ctx.arc(ox, oy, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  /* 달 (태양쪽=왼쪽 밝음, 오른쪽 어둠) */
  ctx.fillStyle = '#aeb8cc';
  ctx.beginPath();
  ctx.arc(mx, my, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  ctx.arc(mx, my, moonR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = 'rgba(10,14,28,0.38)';
  ctx.beginPath();
  ctx.arc(mx + moonR * 0.55, my, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = C.moonRim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(mx, my, moonR, 0, Math.PI * 2);
  ctx.stroke();

  /* 회전 방향(반시계) */
  arrow(ctx, Ex + 11, Ey - Re - 6, Ex - 11, Ey - Re - 6, C.vAng, 2.5, 7); // 지구 위에서 왼쪽 = 반시계
  text(ctx, '자전 ↺', Ex - 14, Ey - Re - 11, { size: 10.5, color: C.vAng, align: 'right' });
  text(ctx, '공전 ↺', mx, my + moonR + 13, { size: 10, color: C.vAng, align: 'center' });

  /* 선속도 벡터(접선, 반시계) — 비율 2.2 유지 */
  if (state.showVectors) {
    const obsLen = 20, moonLen = 20 * PHYS.vRatio;
    const ot = [-Math.sin(obsTh), -Math.cos(obsTh)];   // d/dθ S = 반시계 접선
    const mt = [-Math.sin(moonTh), -Math.cos(moonTh)];
    arrow(ctx, mx, my, mx + moonLen * mt[0], my + moonLen * mt[1], C.vLin, 2.5, 8);
    arrow(ctx, ox, oy, ox + obsLen * ot[0], oy + obsLen * ot[1], C.vLin, 2.5, 7);
    text(ctx, '달 1,023 m/s', mx + 8, my - moonLen * 0.5, { size: 10.5, color: C.vLin });
    text(ctx, '관측자 465 m/s', ox - 8, oy + 14, { size: 10.5, color: C.obs, align: 'right' });
  }

  /* 라벨 */
  text(ctx, '약 2시간: 지구 30° 자전 · 달 ~1° 공전', 12, 40, { size: 11, color: C.text });
  text(ctx, '둘 다 반시계 · 선속도는 달이 2.2× (벡터 길이)', 12, 56, { size: 10.5, color: C.vLin });

  disc(ctx, '거리 압축(비례 아님) · 달 공전각은 가시화 위해 과장', W, H);
}

/* =====================================================================
 * ② 관측자 하늘 — 달이 태양을 가리는 "방향"
 * ===================================================================== */
function drawSky(ctx, W, H, p) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, C.sky[0]);
  g.addColorStop(1, C.sky[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '② 관측자가 보는 하늘');

  const cx = W / 2;
  const cy = H * 0.52;
  const sunR = Math.min(W, H) * 0.17;
  const travel = sunR * 2.1;

  // 정답: 달이 오른쪽(서) → 왼쪽(동)으로 이동. p=0 오른쪽, p=1 왼쪽
  const moonX = cx + (1 - 2 * p) * travel;

  /* 태양: 글로우 + 본체 */
  const glow = ctx.createRadialGradient(cx, cy, sunR * 0.6, cx, cy, sunR * 2.1);
  glow.addColorStop(0, C.sunGlow);
  glow.addColorStop(1, 'rgba(255,180,50,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR * 2.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = C.sun;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.sunRim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = C.sunCore;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR * 0.82, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = C.sun;
  ctx.beginPath();
  ctx.arc(cx, cy, sunR * 0.7, 0, Math.PI * 2);
  ctx.fill();

  /* 학생들의 틀린 예측(왼→오른쪽)을 먼저, 점선 유령으로 */
  if (state.showWrong) {
    const wrongX = cx - (1 - 2 * p) * travel;
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.wrong;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wrongX, cy, sunR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    text(ctx, '학생 예측(왼쪽부터·틀림)', cx, H - 26, { size: 11, color: C.wrong, align: 'center' });
  }

  /* 정답 달: 태양을 가린다 (하늘색으로 덮어 가림 표현) */
  ctx.fillStyle = C.moon;
  ctx.beginPath();
  ctx.arc(moonX, cy, sunR * 1.02, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = C.moonRim;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(moonX, cy, sunR * 1.02, 0, Math.PI * 2);
  ctx.stroke();

  /* 방위 표시: E(동) 왼쪽, W(서) 오른쪽 */
  arrow(ctx, 64, cy, 24, cy, C.dim, 1.5, 6);
  text(ctx, '동(E)', 70, cy + 4, { size: 11, color: C.dim });
  arrow(ctx, W - 64, cy, W - 24, cy, C.dim, 1.5, 6);
  text(ctx, '서(W)', W - 70, cy + 4, { size: 11, color: C.dim, align: 'right' });

  // 진행 화살표(달 이동 방향)
  if (state.showVectors) {
    arrow(ctx, moonX, cy - sunR * 1.02 - 14, moonX - 34, cy - sunR * 1.02 - 14, C.vLin, 2.5, 7);
    text(ctx, '달 이동(동쪽으로)', moonX - 4, cy - sunR * 1.02 - 20, { size: 10.5, color: C.vLin, align: 'right' });
  }

  text(ctx, '오른쪽(서)부터 가려짐 ✓', cx, H - 10, { size: 12, weight: '700', color: C.accent, align: 'center' });
  disc(ctx, '북반구·남쪽 하늘 기준', W, H);
}

/* =====================================================================
 * ③ 지표 위 경주 (관성계) — 선속도 비교
 * ===================================================================== */
function drawGround(ctx, W, H, p) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '③ 지표 위 경주 — 누가 더 빠른가');

  const m = 26;
  const laneW = W - 2 * m;
  const laneY = H * 0.62;

  // 지면 + 고정 눈금(관성계)
  ctx.fillStyle = '#e7ecf4';
  ctx.fillRect(0, laneY, W, H - laneY);
  ctx.strokeStyle = C.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = m + (laneW * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, laneY);
    ctx.lineTo(x, laneY + 10);
    ctx.stroke();
  }
  arrow(ctx, W - 80, laneY + 22, W - 36, laneY + 22, C.dim, 1.5, 6);
  text(ctx, '동(E)', W - 86, laneY + 26, { size: 11, color: C.dim, align: 'right' });

  // 위치(관성계): 관측자 느림, 그림자 빠름(비율 2.2). p=0.5에 그림자가 관측자 추월
  const aObs = 0.20, aShadow = 0.20 * PHYS.vRatio;
  const obsFrac = 0.45 + aObs * p;
  const shadowFrac = 0.45 - 0.5 * (aShadow - aObs) + aShadow * p;
  const obsX = m + obsFrac * laneW;
  const shadowX = m + shadowFrac * laneW;
  const obsY = laneY;

  // 궤적
  ctx.strokeStyle = 'rgba(14,116,144,0.45)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(m + (0.45) * laneW, obsY - 26);
  ctx.lineTo(obsX, obsY - 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(21,128,61,0.40)';
  ctx.beginPath();
  ctx.moveTo(m + (0.45 - 0.5 * (aShadow - aObs)) * laneW, obsY - 52);
  ctx.lineTo(shadowX, obsY - 52);
  ctx.stroke();

  // 일식 중?(그림자가 관측자 위)
  const umbraR = 30;
  const inEclipse = Math.abs(shadowX - obsX) < umbraR * 0.6;
  if (inEclipse) {
    ctx.fillStyle = 'rgba(20,30,50,0.14)';
    ctx.fillRect(0, 0, W, laneY);
  }

  // 달그림자 (반영+본영)
  const pg = ctx.createRadialGradient(shadowX, obsY - 52, 4, shadowX, obsY - 52, umbraR);
  pg.addColorStop(0, C.shadow);
  pg.addColorStop(0.6, C.shadow);
  pg.addColorStop(1, C.penumbra);
  ctx.fillStyle = pg;
  ctx.beginPath();
  ctx.ellipse(shadowX, obsY - 52, umbraR, umbraR * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  // 그림자에서 지면으로 떨어지는 선
  ctx.strokeStyle = 'rgba(10,14,28,0.5)';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(shadowX, obsY - 52);
  ctx.lineTo(shadowX, obsY);
  ctx.stroke();
  ctx.setLineDash([]);

  // 관측자
  ctx.fillStyle = C.obs;
  ctx.beginPath();
  ctx.arc(obsX, obsY - 26, 6, 0, Math.PI * 2);
  ctx.fill();

  // 속도 벡터(비율 2.2 유지)
  if (state.showVectors) {
    const base = 42;
    arrow(ctx, obsX, obsY - 26, obsX + base, obsY - 26, C.vLin, 2.5, 7);
    arrow(ctx, shadowX, obsY - 52, shadowX + base * PHYS.vRatio, obsY - 52, C.vLin, 2.5, 8);
    text(ctx, '지표 관측자 465 m/s', obsX + base + 6, obsY - 24, { size: 10.5, color: C.obs });
    text(ctx, '달그림자 1,023 m/s', shadowX + base * PHYS.vRatio + 6, obsY - 50, { size: 10.5, color: C.vLin });
  }

  // 캡션
  text(ctx, '관성계(우주에서 본 지면)에서의 선속도 경주', 12, 38, { size: 11, color: C.dim });
  text(
    ctx,
    '지면 기준 그림자 속도 ≈ 558 m/s (≈2,010 km/h) — 서→동 통과',
    m, H - 10, { size: 11.5, weight: '600', color: C.text }
  );
}

/* =====================================================================
 * ④ 각속도 vs 선속도 막대그래프
 * ===================================================================== */
function drawBars(ctx, W, H) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '④ 각속도 vs 선속도');

  const groups = [
    {
      title: '각속도 ω', sub: '지구가 27× 큼',
      bars: [
        { name: '지구 자전', val: PHYS.wRatio, txt: '27' },
        { name: '달 공전', val: 1, txt: '1' },
      ],
      max: PHYS.wRatio, winner: 0,
    },
    {
      title: '선속도 v = ω·r', sub: '달이 2.2× 큼',
      bars: [
        { name: '지표', val: PHYS.vSurf, txt: '465 m/s' },
        { name: '달 그림자', val: PHYS.vMoon, txt: '1,023 m/s' },
      ],
      max: PHYS.vMoon, winner: 1,
    },
  ];

  const colW = (W - 40) / 2;
  const baseY = H - 78;
  const top = 56;
  const maxBarH = baseY - top;

  groups.forEach((grp, gi) => {
    const gx = 20 + gi * colW;
    text(ctx, grp.title, gx + colW / 2, top - 26, { size: 12.5, weight: '700', align: 'center' });
    text(ctx, grp.sub, gx + colW / 2, top - 10, { size: 11, color: C.dim, align: 'center' });

    const bw = colW * 0.26;
    grp.bars.forEach((b, bi) => {
      const bx = gx + colW * (0.28 + bi * 0.44) - bw / 2;
      const h = Math.max(3, (b.val / grp.max) * maxBarH);
      const win = bi === grp.winner;
      ctx.fillStyle = win ? C.vLin : '#9aa6bf';
      ctx.fillRect(bx, baseY - h, bw, h);
      text(ctx, b.txt, bx + bw / 2, baseY - h - 6, { size: 11, weight: '600', align: 'center', color: win ? C.vLin : C.text });
      text(ctx, b.name, bx + bw / 2, baseY + 16, { size: 10.5, color: C.dim, align: 'center' });
    });

    // 바닥선
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(gx + 6, baseY);
    ctx.lineTo(gx + colW - 6, baseY);
    ctx.stroke();
  });

  // 가운데 구분선
  ctx.strokeStyle = C.grid;
  ctx.beginPath();
  ctx.moveTo(W / 2, top - 30);
  ctx.lineTo(W / 2, baseY + 24);
  ctx.stroke();

  // 핵심 공식
  text(
    ctx,
    'v달 / v지표 = (ω달/ω지구) × (d달/R지구) = (1/27) × 60 ≈ 2.2',
    W / 2, H - 30, { size: 11.5, weight: '600', align: 'center', color: C.text }
  );
  text(
    ctx,
    '각속도는 지구가 크지만, 방향을 정하는 선속도는 달이 크다',
    W / 2, H - 12, { size: 11, align: 'center', color: C.dim }
  );
}

/* =====================================================================
 * 캔버스 관리 & 렌더 루프
 * ===================================================================== */
const views = [
  { id: 'space', draw: drawSpace },
  { id: 'sky', draw: drawSky },
  { id: 'ground', draw: drawGround },
  { id: 'bars', draw: (ctx, W, H) => drawBars(ctx, W, H) },
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
  canvas._W = W;
  canvas._H = H;
  canvas._ctx = ctx;
}

function fitAll() {
  for (const v of views) {
    v.el = document.getElementById(v.id);
    if (v.el) fit(v.el);
  }
}

function render() {
  for (const v of views) {
    if (!v.el) continue;
    v.draw(v.el._ctx, v.el._W, v.el._H, state.p);
  }
}

/* ---------- UI 동기화 ---------- */
const els = {};
function nearestPhase(p) {
  let best = SNAPSHOTS[0], d = Infinity;
  for (const s of SNAPSHOTS) {
    const dd = Math.abs(s.p - p);
    if (dd < d) { d = dd; best = s; }
  }
  return best.label;
}

function syncUI() {
  if (!state.scrubbing) els.slider.value = String(Math.round(state.p * 1000));
  els.phase.textContent = nearestPhase(state.p);
  els.play.textContent = state.playing ? '⏸ 일시정지' : '▶ 재생';
  // 스냅샷 active 표시
  els.snapBtns.forEach((btn, i) => {
    btn.classList.toggle('active', Math.abs(SNAPSHOTS[i].p - state.p) < 0.02);
  });
}

/* ---------- 메인 루프 ---------- */
let lastTs = 0;
function loop(ts) {
  if (!lastTs) lastTs = ts;
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;
  if (state.playing && !state.scrubbing) {
    state.p += (dt * state.speed) / DURATION;
    if (state.p >= 1) state.p -= 1;     // 반복
  }
  render();
  syncUI();
  requestAnimationFrame(loop);
}

/* ---------- 초기화 ---------- */
function init() {
  els.play = document.getElementById('playBtn');
  els.slider = document.getElementById('timeSlider');
  els.phase = document.getElementById('phaseLabel');
  els.speed = document.getElementById('speedSel');
  els.snaps = document.getElementById('snapshots');
  els.wrong = document.getElementById('toggleWrong');
  els.vectors = document.getElementById('toggleVectors');

  // 스냅샷 버튼 생성
  els.snapBtns = SNAPSHOTS.map((s, i) => {
    const b = document.createElement('button');
    b.className = 'snap-btn';
    b.textContent = `${i + 1}. ${s.label}`;
    b.addEventListener('click', () => {
      state.p = s.p;
      state.playing = false;
      syncUI();
    });
    els.snaps.appendChild(b);
    return b;
  });

  els.play.addEventListener('click', () => {
    state.playing = !state.playing;
    syncUI();
  });
  els.slider.addEventListener('input', () => {
    state.p = Number(els.slider.value) / 1000;
  });
  els.slider.addEventListener('pointerdown', () => { state.scrubbing = true; });
  const endScrub = () => { state.scrubbing = false; };
  els.slider.addEventListener('pointerup', endScrub);
  els.slider.addEventListener('pointercancel', endScrub);
  els.slider.addEventListener('change', endScrub);

  els.speed.addEventListener('change', () => { state.speed = Number(els.speed.value); });
  els.wrong.addEventListener('change', () => { state.showWrong = els.wrong.checked; });
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
