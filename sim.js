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

/* ---------- 색상 테마 ---------- */
const C = {
  panel: '#0d1326',
  sky: ['#0a1430', '#142a52'],
  sun: '#ffce3a',
  sunCore: '#fff2c2',
  sunGlow: 'rgba(255, 180, 50, 0.40)',
  moon: '#0c1226',
  moonRim: 'rgba(150, 165, 195, 0.7)',
  earth: '#2a6cd6',
  earthDeep: '#1b4a99',
  land: '#2f9460',
  obs: '#22d3ee',
  shadow: 'rgba(4, 7, 16, 0.82)',
  penumbra: 'rgba(4, 7, 16, 0.30)',
  vLin: '#4ade80',   // 선속도(linear)
  vAng: '#fb923c',   // 각속도(angular)
  wrong: '#f87171',  // 학생들의 틀린 예측
  text: '#e6ebf5',
  dim: '#9aa6c0',
  accent: '#22d3ee',
  grid: 'rgba(255, 255, 255, 0.08)',
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
 * ① 우주 시점 — 자전(각속도)과 공전(선속도)의 대비
 * ===================================================================== */
function drawSpace(ctx, W, H, p) {
  ctx.fillStyle = C.panel;
  ctx.fillRect(0, 0, W, H);
  panelTitle(ctx, '① 우주에서 본 지구–달–햇빛');

  const midY = H * 0.54;
  const earthR = Math.min(H * 0.21, 64);
  const earthX = W - earthR - 26;
  const moonR = Math.max(7, earthR * 0.36);
  const moonX = W * 0.45;
  const drift = (p - 0.5) * earthR * 1.0;     // 달이 위로 천천히 이동
  const moonY = midY - drift;

  /* 평행한 햇빛 (왼쪽 → 오른쪽) */
  ctx.save();
  for (let i = 0; i < 5; i++) {
    const ry = midY - earthR * 1.05 + (i * earthR * 2.1) / 4;
    arrow(ctx, 8, ry, 56, ry, 'rgba(255,206,58,0.55)', 2, 6);
  }
  text(ctx, '햇빛(평행)', 8, midY - earthR * 1.05 - 8, { size: 11, color: C.sun });
  ctx.restore();

  /* 달 공전 궤도 (지구 중심 기준, 모식) */
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.ellipse(earthX, midY, earthX - moonX, earthR * 1.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  /* 달그림자: 달에서 오른쪽(햇빛 방향)으로 지구 표면까지 */
  if (Math.abs(moonY - midY) < earthR) {
    const hitX = earthX - Math.sqrt(earthR * earthR - (moonY - midY) * (moonY - midY));
    const g = ctx.createLinearGradient(moonX, 0, hitX, 0);
    g.addColorStop(0, 'rgba(4,7,16,0.55)');
    g.addColorStop(1, 'rgba(4,7,16,0.0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(moonX, moonY - moonR * 0.7);
    ctx.lineTo(hitX, midY + (moonY - midY) - moonR * 0.5);
    ctx.lineTo(hitX, midY + (moonY - midY) + moonR * 0.5);
    ctx.lineTo(moonX, moonY + moonR * 0.7);
    ctx.closePath();
    ctx.fill();
  }

  /* 지구 (자전: 대륙 회전 + 관측자 + 자전 화살표) */
  const spin = p * 6 * Math.PI * 2;           // 모식적으로 여러 바퀴
  ctx.save();
  ctx.beginPath();
  ctx.arc(earthX, midY, earthR, 0, Math.PI * 2);
  const eg = ctx.createRadialGradient(earthX - earthR * 0.3, midY - earthR * 0.3, earthR * 0.2, earthX, midY, earthR);
  eg.addColorStop(0, C.earth);
  eg.addColorStop(1, C.earthDeep);
  ctx.fillStyle = eg;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // 회전하는 대륙(모식)
  ctx.fillStyle = C.land;
  const blobs = [[0.35, -0.2, 0.55], [-0.4, 0.25, 0.45], [0.1, 0.55, 0.35]];
  for (const [bx, by, br] of blobs) {
    const ang = Math.atan2(by, bx) + spin;
    const rad = Math.hypot(bx, by) * earthR;
    const x = earthX + rad * Math.cos(ang);
    const y = midY + rad * Math.sin(ang);
    ctx.beginPath();
    ctx.arc(x, y, br * earthR * 0.55, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  // 밤(그림자 쪽) 약하게
  const ng = ctx.createLinearGradient(earthX - earthR, 0, earthX + earthR, 0);
  ng.addColorStop(0, 'rgba(0,0,0,0)');
  ng.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.arc(earthX, midY, earthR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // 관측자 (자전과 함께 도는 점, 햇빛 받는 왼쪽 반구 위주)
  const obsAng = Math.PI + spin;              // 왼쪽 림에서 시작
  const obsX = earthX + earthR * Math.cos(obsAng);
  const obsY = midY + earthR * Math.sin(obsAng);
  ctx.fillStyle = C.obs;
  ctx.beginPath();
  ctx.arc(obsX, obsY, 4, 0, Math.PI * 2);
  ctx.fill();

  /* 달 */
  ctx.fillStyle = '#b9c2d6';
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.arc(moonX + moonR * 0.3, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();

  /* 벡터 & 라벨 */
  if (state.showVectors) {
    // 관측자 선속도(짧음) — 접선 방향
    const tA = obsAng + Math.PI / 2;
    const vS = 22;
    arrow(ctx, obsX, obsY, obsX + vS * Math.cos(tA), obsY + vS * Math.sin(tA), C.vLin, 2.5, 7);
    // 달 선속도(긺) — 위쪽(공전 접선), 비율 2.2배
    const vM = vS * PHYS.vRatio;
    arrow(ctx, moonX, moonY, moonX, moonY - vM, C.vLin, 2.5, 8);

    // 자전 각속도(큰 곡선 화살표)
    curvedArrow(ctx, earthX, midY, earthR + 12, -1.1, 0.7, C.vAng, 3);
    // 공전 각속도(작은 곡선 화살표)
    curvedArrow(ctx, moonX, moonY, moonR + 9, Math.PI * 0.85, Math.PI * 1.15, C.vAng, 2.5);

    text(ctx, '자전 ω 큼 (27×)', earthX, midY + earthR + 30, { size: 11, color: C.vAng, align: 'center' });
    text(ctx, '465 m/s', obsX + 6, obsY + 16, { size: 10.5, color: C.vLin });
    text(ctx, '공전 ω 작음', moonX, moonY + moonR + 16, { size: 11, color: C.vAng, align: 'center' });
    text(ctx, '1,023 m/s', moonX + moonR + 6, moonY - vM + 12, { size: 10.5, color: C.vLin });
  }

  disc(ctx, '거리·크기 비례 아님 · 속도 비율은 실제값', W, H);
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
  ctx.fillStyle = '#161d33';
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
  ctx.strokeStyle = 'rgba(34,211,238,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(m + (0.45) * laneW, obsY - 26);
  ctx.lineTo(obsX, obsY - 26);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(74,222,128,0.30)';
  ctx.beginPath();
  ctx.moveTo(m + (0.45 - 0.5 * (aShadow - aObs)) * laneW, obsY - 52);
  ctx.lineTo(shadowX, obsY - 52);
  ctx.stroke();

  // 일식 중?(그림자가 관측자 위)
  const umbraR = 30;
  const inEclipse = Math.abs(shadowX - obsX) < umbraR * 0.6;
  if (inEclipse) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
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
  ctx.strokeStyle = 'rgba(4,7,16,0.5)';
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
      ctx.fillStyle = win ? C.vLin : '#39507f';
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
