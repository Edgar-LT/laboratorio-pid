// Laboratorio PID: planta de 2º orden  y'' + 2ζωn y' + ωn² y = ωn² (u + d)
const $ = id => document.getElementById(id);
const canvas = $('scope'), ctx = canvas.getContext('2d');

const DT = 0.002;          // paso de integración (s)
const WINDOW = 10;         // ventana visible (s)
const U_MAX = 20;          // saturación del actuador

const P = {};
const sliders = ['kp', 'ki', 'kd', 'wn', 'z', 'sp'];
function readParams() {
  sliders.forEach(k => { P[k] = parseFloat($(k).value); $(k + 'V').textContent = P[k].toFixed(2); });
}
sliders.forEach(k => $(k).addEventListener('input', () => {
  const oldSp = P.sp; readParams();
  if (k === 'sp' && oldSp !== P.sp) newStep();
}));

let S, hist, paused = false, stepInfo;
function reset() {
  S = { t: 0, y: 0, v: 0, integ: 0, prevMeas: 0, dFilt: 0, d: 0, dUntil: 0, iae: 0, r: P.sp, u: 0 };
  hist = [];
  newStep(0);
}
function newStep(from) {
  stepInfo = { t0: S.t, y0: from ?? S.y, r: P.sp, peak: from ?? S.y, ts: null, lastOut: S.t };
  S.r = P.sp;
}

function simStep() {
  const noise = $('noise').checked ? (Math.random() - 0.5) * 0.04 : 0;
  const meas = S.y + noise;
  const e = S.r - meas;

  // Derivada sobre la medición con filtro de 1er orden (evita "derivative kick")
  const rawD = -(meas - S.prevMeas) / DT;
  S.dFilt += (rawD - S.dFilt) * Math.min(1, DT / 0.01);
  S.prevMeas = meas;

  let u = P.kp * e + P.ki * S.integ + P.kd * S.dFilt;
  // Anti-windup por integración condicional
  if (Math.abs(u) < U_MAX || Math.sign(e) !== Math.sign(u)) S.integ += e * DT;
  u = Math.max(-U_MAX, Math.min(U_MAX, u));
  S.u = u;

  const d = S.t < S.dUntil ? S.d : 0;
  const a = P.wn * P.wn * (u + d - S.y) - 2 * P.z * P.wn * S.v;
  S.v += a * DT;              // Euler semi-implícito
  S.y += S.v * DT;
  S.t += DT;
  S.iae += Math.abs(e) * DT;
  S.e = e;

  // Métricas de respuesta al escalón
  const amp = stepInfo.r - stepInfo.y0;
  if (Math.abs(amp) > 1e-6) {
    if ((S.y - stepInfo.peak) * Math.sign(amp) > 0) stepInfo.peak = S.y;
    if (Math.abs(S.y - stepInfo.r) > 0.02 * Math.abs(amp)) stepInfo.lastOut = S.t;
  }
}

function updateTelemetry() {
  const amp = stepInfo.r - stepInfo.y0;
  if (Math.abs(amp) > 1e-6) {
    const mp = Math.max(0, (stepInfo.peak - stepInfo.r) / amp * 100);
    $('mp').textContent = mp.toFixed(1) + '%';
    const settled = S.t - stepInfo.lastOut > 1;
    $('ts').textContent = settled ? (stepInfo.lastOut - stepInfo.t0).toFixed(2) + 's' : '...';
    $('state').textContent = settled ? 'ESTABLE' : 'TRANSITORIO';
  }
  $('err').textContent = (S.e || 0).toFixed(4);
  $('u').textContent = S.u.toFixed(3) + (Math.abs(S.u) >= U_MAX ? ' (SAT)' : '');
  $('iae').textContent = S.iae.toFixed(3);
  $('clock').textContent = `t = ${S.t.toFixed(2)} s`;
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== W * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const tEnd = Math.max(WINDOW, S.t), tStart = tEnd - WINDOW;
  let ymin = -0.5, ymax = 1.5;
  hist.forEach(h => { ymin = Math.min(ymin, h.y, h.r); ymax = Math.max(ymax, h.y, h.r); });
  const pad = (ymax - ymin) * 0.1; ymin -= pad; ymax += pad;
  const X = t => (t - tStart) / WINDOW * W;
  const Y = v => H - (v - ymin) / (ymax - ymin) * H;

  // Rejilla
  ctx.strokeStyle = '#13233a'; ctx.lineWidth = 1; ctx.fillStyle = '#4c6680'; ctx.font = '10px Consolas';
  for (let i = 0; i <= 10; i++) { const x = i / 10 * W; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  for (let i = 0; i <= 8; i++) {
    const y = i / 8 * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText((ymax - i / 8 * (ymax - ymin)).toFixed(2), 4, y - 3);
  }
  // Banda ±2%
  const amp = Math.abs(stepInfo.r - stepInfo.y0) || 1;
  ctx.fillStyle = 'rgba(46,230,166,0.07)';
  ctx.fillRect(0, Y(stepInfo.r + 0.02 * amp), W, Y(stepInfo.r - 0.02 * amp) - Y(stepInfo.r + 0.02 * amp));

  const line = (key, color, scale = 1, dash = []) => {
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.setLineDash(dash); ctx.beginPath();
    hist.forEach((h, i) => { const x = X(h.t), y = Y(h[key] * scale); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke(); ctx.setLineDash([]);
  };
  line('u', 'rgba(255,107,107,0.55)', 0.1, [3, 3]);
  line('r', '#f5c542', 1, [6, 4]);
  line('y', '#2ee6a6');
  ctx.fillStyle = '#ff6b6b'; ctx.fillText('u(t) ×0.1', W - 70, 14);
}

function loop() {
  if (!paused) {
    for (let i = 0; i < Math.round(1 / 60 / DT); i++) simStep();
    hist.push({ t: S.t, y: S.y, r: S.r, u: S.u });
    while (hist.length && hist[0].t < S.t - WINDOW) hist.shift();
    updateTelemetry();
  }
  draw();
  requestAnimationFrame(loop);
}

$('step').onclick = () => { $('sp').value = P.sp === 0 ? 1 : 0; readParams(); newStep(); };
$('dist').onclick = () => { S.d = -0.5 * (P.sp || 1); S.dUntil = S.t + 1.5; };
$('pause').onclick = e => { paused = !paused; e.target.textContent = paused ? 'Reanudar' : 'Pausa'; };
$('reset').onclick = reset;

readParams(); reset(); loop();
