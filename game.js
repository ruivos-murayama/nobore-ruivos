// ============================================================
//  のぼれRUIVOSくん — 本編（feel層を統合）
//  「引っぱって→弾けて→着地」の手触りを最優先に、不規則な洞窟を上へ。
//  物理は px/s（固定120Hz＋描画補間）。色/手触りは design.js、洞窟は cave.js。
// ============================================================
(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const D = DESIGN;
  const P = D.physics, SQ = D.squash, CAM = D.camera, GM = D.gimmick, ST = D.stealth, RU = D.rules;
  const COL = D.layout.columnWidth, R = P.radius;

  // ---- 画面 ----
  let VW = 0, VH = 0, DPR = 1, baseScale = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth; VH = window.innerHeight;
    canvas.width = Math.floor(VW * DPR); canvas.height = Math.floor(VH * DPR);
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    baseScale = Math.min(VW / COL, D.layout.maxZoom);
  }
  window.addEventListener('resize', resize); resize();

  // ---- ユーティリティ ----
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const len = (x, y) => Math.hypot(x, y);
  function hexRGB(hex) { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function hexA(hex, a) { const c = hexRGB(hex); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
  function shade(hex, f) { const c = hexRGB(hex); return `rgb(${clamp(c[0] * f | 0, 0, 255)},${clamp(c[1] * f | 0, 0, 255)},${clamp(c[2] * f | 0, 0, 255)})`; }
  function smoothDamp(cur, target, vel, smoothTime, dt) {
    const omega = 2 / smoothTime, x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const change = cur - target, temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * exp;
    return target + (change + temp) * exp;
  }

  // ---- 章（ワールド）----  全体MAPの区切り。城を下から頂上へ登る。
  const WORLDS = [
    { n: 1, name: '月夜の外郭' },
    { n: 2, name: '城内のからくり' },
    { n: 3, name: '天守へ' },
    { n: 4, name: '月天楼' },
    { n: 5, name: '水攻め' },
    { n: 6, name: '岐路の大坑' },
    { n: 7, name: '氷瀑' },
  ];
  // ---- ステージ（cave.js が形を生成。配色は design の stages・並びは一致）----
  //  code=「章-番」。maxLaunch＝飛ばし回数の上限（💧1個でRU.launchPerDango回 回復）。
  //  括弧内は BFSソルバ(/tmp/minlaunch.js)の理論最小手数。上限はそこへミス分を上乗せ。
  const LEVELS = [
    { code: '1-1', world: 1, name: '月夜の堀',   sub: '見張りを避けて登る', maxLaunch: 18, gen: { worldH: 1800, seed: 11, gapBase: 142, gapVar: 40, meander: 85, yStep: 74, nubCount: 6, hazardCount: 0, dangoCount: 5, bouncyCount: 0, sentryCount: 1, cloakCount: 0, gateHalf: 66 } }, // 最短12
    { code: '1-2', world: 1, name: '影の廻廊',   sub: 'バンパーで跳ねる',   maxLaunch: 16, gen: { worldH: 2050, seed: 23, gapBase: 134, gapVar: 44, meander: 95, yStep: 72, nubCount: 7, hazardCount: 1, dangoCount: 5, bouncyCount: 3, sentryCount: 1, cloakCount: 1, gateHalf: 62, bumperMove: 70 } }, // 最短11
    { code: '1-3', world: 1, name: '隠れ里',     sub: '隠れ蓑で忍ぶ',       maxLaunch: 19, gen: { worldH: 2300, seed: 37, gapBase: 126, gapVar: 48, meander: 105, yStep: 70, nubCount: 8, hazardCount: 2, dangoCount: 6, bouncyCount: 1, sentryCount: 3, cloakCount: 2, gateHalf: 60, bumperMove: 60, gateGuard: 1 } }, // 最短14
    { code: '2-1', world: 2, name: 'からくり堂', sub: '動く足場を乗りこなす', maxLaunch: 20, gen: { worldH: 2200, seed: 41, gapBase: 150, gapVar: 38, meander: 92, yStep: 72, nubCount: 4, hazardCount: 1, dangoCount: 6, bouncyCount: 1, sentryCount: 1, cloakCount: 0, platCount: 4, gateHalf: 60, bumperMove: 60 } }, // 最短15・動く台
    { code: '2-2', world: 2, name: '氷蔵',       sub: '滑る氷壁を渡る',       maxLaunch: 20, gen: { worldH: 2300, seed: 47, gapBase: 140, gapVar: 42, meander: 98, yStep: 70, nubCount: 5, hazardCount: 1, dangoCount: 6, bouncyCount: 1, sentryCount: 1, cloakCount: 1, slipCount: 4, gateHalf: 58, bumperMove: 70, gateGuard: 1 } }, // 最短14・滑る壁
    { code: '3-1', world: 3, name: '紅楓の砦',   sub: '組み合わせる',       maxLaunch: 21, gen: { worldH: 2550, seed: 51, gapBase: 132, gapVar: 46, meander: 108, yStep: 70, nubCount: 8, hazardCount: 3, dangoCount: 6, bouncyCount: 3, sentryCount: 2, cloakCount: 1, gateHalf: 57, bumperMove: 80, gateGuard: 1, gateMover: 1 } }, // 最短17
    { code: '3-2', world: 3, name: '天守の頂',   sub: '総合・見張り乱立',   maxLaunch: 23, gen: { worldH: 2900, seed: 67, gapBase: 130, gapVar: 48, meander: 110, yStep: 68, nubCount: 10, hazardCount: 4, dangoCount: 7, bouncyCount: 5, sentryCount: 3, cloakCount: 2, gateHalf: 53, bumperMove: 95, gateGuard: 2, gateMover: 1 } }, // 最短19
    { code: '4-1', world: 4, name: '浮雲の廊',     sub: '動く足場と見張りの嵐', maxLaunch: 24, gen: { worldH: 2700, seed: 73, gapBase: 126, gapVar: 48, meander: 110, yStep: 68, nubCount: 9, hazardCount: 4, dangoCount: 6, bouncyCount: 3, sentryCount: 3, cloakCount: 2, platCount: 3, gateHalf: 52, bumperMove: 100, gateGuard: 2, gateMover: 1 } }, // 最短20・全ギミック
    { code: '4-2', world: 4, name: '月天楼の極', sub: 'すべての試練',       maxLaunch: 28, gen: { worldH: 3100, seed: 107, gapBase: 122, gapVar: 52, meander: 116, yStep: 66, nubCount: 11, hazardCount: 5, dangoCount: 7, bouncyCount: 4, sentryCount: 3, cloakCount: 2, platCount: 2, slipCount: 3, gateHalf: 50, bumperMove: 110, gateGuard: 2, gateMover: 2 } }, // 最短24・最難
    { code: '5-1', world: 5, name: 'せまる水面', sub: 'せり上がる水から登りきれ', maxLaunch: 21, gen: { worldH: 2200, seed: 14, gapBase: 140, gapVar: 42, meander: 95, yStep: 72, nubCount: 6, hazardCount: 1, dangoCount: 6, bouncyCount: 1, sentryCount: 1, cloakCount: 0, gateHalf: 62, riseSpeed: 44 } }, // 最短14・水攻め（強制スクロール床）
    { code: '6-1', world: 6, name: '分かれ道',   sub: '道を選んで登りきれ',     maxLaunch: 60, gen: { worldH: 5600, seed: 8, gapBase: 165, gapVar: 40, meander: 120, yStep: 76, nubCount: 4, hazardCount: 2, dangoCount: 10, bouncyCount: 2, sentryCount: 1, cloakCount: 0, gateHalf: 64, forkCount: 6 } }, // 本道≈56手/近道≈32手（貪欲クライマー計測）・ルート分岐
    { code: '7-1', world: 7, name: '大滑降',     sub: '氷壁を滑り降りろ',       maxLaunch: 40, gen: { worldH: 3600, seed: 5, gapBase: 168, gapVar: 34, meander: 78, yStep: 70, hazardCount: 7, dangoCount: 8, descent: true, slipSpeed: 520 } }, // 滑降（上→下）・優しめ／爽快
  ];

  // ---- 状態 ----
  let gameState = 'title', levelIndex = 0, level = null, totalDango = 0, totalTries = 0;
  let playlist = null;   // URL ?pack=new で「新ステージだけ」を連続プレイ（[index,...]／nullで通常MAP）
  const blob = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, stuck: true, nx: 0, ny: -1, ignoreT: 0, plat: -1, slip: false };
  const def = { ang: 0, sx: 1, sy: 1, vsx: 0, vsy: 0, offx: 0, offy: 0 };
  const eyes = { x: 1, y: 0, blink: 0, blinkTimer: 2, wide: 0 };
  const cam = { x: COL / 2, y: 0, vy: { v: 0 }, zoom: 1, vz: { v: 0 } };
  let trauma = 0, flash = 0, timeScale = 1, timeScaleTarget = 1;
  let particles = [], spores = [], trail = 0;
  let alive = true, deathT = 0, tries = 0;
  let floorY = 1e9, riseBubbles = [];           // 強制スクロールの床（水攻め）：水面のy（下からせり上がる）と泡
  let launches = 0, outMsg = 0;                 // 飛ばし回数：のこり / 「もう とべない…」演出タイマー
  let winning = false, winT = 0, winFlash = 0, winSpark = 0, winRings = [], winGX = 0, winGY = 0, winHold = 0;  // 到達演出
  let combo = 0, texts = [], boostT = 0, bumpChain = 0, freeze = 0, popFlash = 0;
  let alert = 0, simTime = 0, alarmPing = 0;   // ステルス：発見メーター / 首振りの時刻 / 警告音タイマー
  let cloakT = 0;                              // 隠れ蓑：残り透明時間
  const aim = { active: false, sx: 0, sy: 0, cx: 0, cy: 0 };

  // ---- 音 ----
  let actx = null, muted = false;
  function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function beep(f, d, type = 'sine', vol = 0.18, slideTo = 0) {
    if (muted) return;
    try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type;
      o.frequency.setValueAtTime(f, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), a.currentTime + d);
      g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + d);
    } catch (e) {}
  }
  const sfx = {
    launch: (p) => beep(420 + p * 260, 0.16, 'triangle', 0.22, 180),
    land: (p) => { beep(520 + p * 300, 0.05, 'square', 0.10 + p * 0.08); beep(150, 0.18, 'sine', 0.14 + p * 0.12, 70); },
    bounce: (n = 0) => beep(300 + n * GM.bumperChainPitch * 0.5, 0.16, 'sine', 0.2, 720 + n * GM.bumperChainPitch),
    pickup: () => { beep(880, 0.08, 'square', 0.12); setTimeout(() => beep(1320, 0.1, 'square', 0.12), 70); },
    death: () => beep(160, 0.35, 'sawtooth', 0.25, 50),
    clear: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.2, 'triangle', 0.18), i * 100)),
  };
  function vibe(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ---- レベル ----
  function loadLevel(i) {
    levelIndex = i; level = LEVELS[i];
    const g = CAVE.buildCave(level.gen, COL);
    level.walls = g.walls; level.hazards = g.hazards; level.bouncy = g.bouncy; level.boosts = g.boosts; level.sentries = g.sentries; level.movers = g.movers || [];
    level.platforms = g.platforms || []; level.slipWalls = g.slipWalls || [];
    level.cloaks = g.cloaks ? g.cloaks.map(c => ({ x: c.x, y: c.y, used: false })) : [];
    level.dango = g.dango.map(d => ({ x: d.x, y: d.y, got: false }));
    level.start = g.start; level.goal = g.goal; level.worldH = g.worldH;
    level.rise = level.gen.riseSpeed || 0;   // 強制スクロールの床（水攻め）の上昇速度 px/s（simTime基準）
    level.descent = !!g.descent;             // 滑降ステージ（上→下／左右の氷壁を高速で滑り落ちる）
    level.slipSpeed = level.gen.slipSpeed || 0;   // 滑る壁の滑走速度の個別上書き（0＝rules.slipSpeed）
    level.palette = (D.stages[i] && D.stages[i].palette) || D.stages[0].palette;
    setSkin(level.palette);
    tries = 0; particles = []; texts = []; combo = 0; spawn(); initSpores(); updateHUD();
  }
  function spawn() {
    blob.x = level.start.x; blob.y = level.start.y; blob.px = blob.x; blob.py = blob.y;
    blob.vx = 0; blob.vy = 0; blob.stuck = false; blob.nx = 0; blob.ny = -1; blob.ignoreT = 0; blob.plat = -1; blob.slip = false;
    def.ang = 0; def.sx = 1; def.sy = 1; def.vsx = 0; def.vsy = 0; def.offx = 0; def.offy = 0;
    eyes.wide = 0; aim.active = false; alive = true; timeScale = 1; timeScaleTarget = 1; combo = 0; bumpChain = 0; freeze = 0; popFlash = 0;
    alert = 0; alarmPing = 0; cloakT = 0;   // simTime は連続させる（首振りは止めない）
    launches = level ? level.maxLaunch : 0; outMsg = 0;   // 飛ばし回数は毎リスポーン満タンに戻す
    floorY = (level && level.rise) ? level.start.y + 170 : 1e9;            // 水面は毎リスポーンで下端へリセット
    if (level && level.rise) { riseBubbles = []; for (let i = 0; i < 14; i++) riseBubbles.push({ x: rand(0, COL), off: rand(8, 280), s: rand(2, 5), sp: rand(22, 64), ph: rand(0, 6.28) }); }
    winning = false; winT = 0; winFlash = 0; winRings = []; winHold = 0;   // 到達演出のリセット
    if (level && level.cloaks) for (const c of level.cloaks) c.used = false;
    if (level && level.dango) for (const d of level.dango) d.got = false;        // 雫も毎リスポーンで復活
    if (level && level.sentries) for (const s of level.sentries) s.hot = false;  // 見張りの警戒色をリセット
    if (level && level.descent) attachToSlip();   // 滑降：スタートで氷壁に貼り付かせ即・滑り出す
    cam.y = clampCamY(blob.y); cam.vy.v = 0; cam.zoom = 1;
    updateHUD();   // リスポーン直後にジャンプ回数表示も満タンへ戻す（死亡時の数字のまま残らないように）
  }
  function attachToSlip() {   // 最寄りの氷壁（slipWall）へスナップして滑走状態にする
    for (let k = 0; k < level.slipWalls.length; k++) {
      const c = CAVE.circlePoly(blob.x, blob.y, R, level.slipWalls[k]);
      if (c) { blob.x += c.nx * c.pen; blob.y += c.ny * c.pen; blob.nx = c.nx; blob.ny = c.ny; blob.stuck = true; blob.slip = true; blob.vx = 0; blob.vy = 0; return; }
    }
  }
  function die() {
    if (!alive) return;
    alive = false; deathT = 0.32; flash = 1; eyes.wide = 1; tries++; totalTries++;
    addTrauma(0.7);
    for (let i = 0; i < D.particles.deathCount; i++) { const a = rand(0, 6.28), s = rand(60, 360); particles.push({ x: blob.x, y: blob.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: i % 2 ? D.danger : level.palette.blob, size: rand(4, 9) }); }
    combo = 0; bumpChain = 0; sfx.death(); vibe(D.haptics.death); updateHUD();
  }
  function caught() {  // 見張りに発見された＝負け（専用のアラーム付き）
    if (!alive) return;
    beep(900, 0.12, 'square', 0.32, 240); setTimeout(() => beep(900, 0.12, 'square', 0.32, 240), 150);
    die();
  }
  function drown() {  // せり上がる水面に飲まれた＝負け（水しぶき）
    if (!alive) return;
    for (let i = 0; i < 22; i++) { const a = -Math.PI / 2 + rand(-1.0, 1.0), s = rand(120, 480); particles.push({ x: clamp(blob.x + rand(-24, 24), 4, COL - 4), y: floorY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: i % 2 ? '#bfe9ff' : '#8fd0ff', size: rand(3, 8) }); }
    beep(300, 0.2, 'sine', 0.2, 90); beep(150, 0.34, 'triangle', 0.16, 60);
    die();
  }
  function failNoMoves() {  // 飛ばし回数を使い切り、出口に届かず＝失敗→やり直し（致死とは別の演出）
    if (!alive) return;
    alive = false; deathT = 0.8; outMsg = 1.4; eyes.wide = 1; tries++; totalTries++;
    addTrauma(0.4);
    beep(440, 0.18, 'sine', 0.16, 180); setTimeout(() => beep(300, 0.28, 'sine', 0.15, 110), 130);
    for (let i = 0; i < 16; i++) { const a = rand(0, 6.28), s = rand(40, 200); particles.push({ x: blob.x, y: blob.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: i % 2 ? level.palette.accent : level.palette.blob, size: rand(3, 7) }); }
    combo = 0; bumpChain = 0; vibe(D.haptics.land); updateHUD();
  }

  // ---- 見張りの視線（ステルス）----
  function sentryDir(s) { return s.base + ST.sweepAmp * Math.sin(simTime * ST.sweepSpeed + s.phase); }
  function sentrySees(s, x, y) {
    const dx = x - s.x, dy = y - s.y, dist = Math.hypot(dx, dy);
    if (dist > ST.range || dist < 1) return false;
    let da = Math.atan2(dy, dx) - sentryDir(s); da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) > ST.halfAngle) return false;
    for (const w of level.walls) if (CAVE.segPoly(s.x, s.y, x, y, w)) return false;  // 壁で遮られる＝隠れられる
    return true;
  }

  // ---- 到達演出（吸い込み→着弾の閃光→余韻→クリア画面）----
  const WIN_DUR = 1.15;   // 吸い込み→着弾の閃光→短い余韻 → STAGE CLEAR 画面（テキスト演出は無し）
  function winStart() {
    if (winning) return;
    winning = true; winT = 0; winFlash = 0; winSpark = 0; winRings = []; winHold = 0;
    winGX = level.goal.x; winGY = level.goal.y;
    aim.active = false; timeScaleTarget = 0.3; eyes.wide = 1; combo = 0; bumpChain = 0;
    const hudEl = document.getElementById('hud'); if (hudEl) hudEl.classList.add('hidden');  // 演出中はHUDを隠す
    beep(660, 0.14, 'sine', 0.16, 1240);   // 吸い込みの予兆
  }
  function winSound() {   // 豪華な到達スティンガー：重低音のドン＋厚い和音＋上昇＋きらめきカスケード
    beep(150, 0.55, 'sine', 0.34, 58);                       // 体（重低音のドン）
    beep(84, 0.5, 'triangle', 0.24, 48);
    [392, 523, 659, 784].forEach(f => beep(f, 0.6, 'triangle', 0.085, f));   // 厚い和音（同時）
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => setTimeout(() => beep(f, 0.4, 'triangle', 0.14, f * 1.4), 70 + i * 52));  // 上昇アルペジオ
    [2093, 2637, 3136, 2637, 3520].forEach((f, i) => setTimeout(() => beep(f, 0.5, 'sine', 0.065, f * 1.15), 250 + i * 66));        // きらめき
  }
  function fireWinBurst() {   // 着弾の“ドン”：白閃光・大きな震え・白衝撃波・ズームパンチ・大量パーティクル・豪華音
    winFlash = 1; addTrauma(1.05); flash = 0; popFlash = 0;
    blob.x = winGX; blob.y = winGY; blob.px = winGX; blob.py = winGY;
    impulseSquash(0, 1.95, 0.45);
    cam.zoom *= 1.2; cam.vz.v = 0;                             // カメラのズームパンチ（戻りはsmoothDampが処理）
    winRings.push({ r: 8, life: 1, w: 8, white: true });       // 太い白の衝撃波
    for (let i = 0; i < 3; i++) winRings.push({ r: 6, life: 1, w: 5 - i * 1.3 });
    for (let i = 0; i < 62; i++) { const a = rand(0, 6.28), s = rand(140, 640); particles.push({ x: winGX, y: winGY, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: i % 3 === 0 ? '#ffffff' : i % 3 === 1 ? level.palette.accent : level.palette.blob, size: rand(3, 9) }); }
    burstRing(winGX, winGY, '#ffffff', 28);
    winSound();
    vibe([24, 40, 16, 90]);
  }
  function updateWin(dt) {
    if (winHold > 0) { winHold -= dt; winFlash = 1; return; }   // ヒットストップ：完全停止（白閃光を最大で保持）
    const prev = winT; winT += dt;
    if (winT < 0.18) {  // フェーズA：出口へスッと吸い込まれる＋周囲から吸引粒子
      const k = 1 - Math.pow(0.0008, dt / 0.06);
      blob.x = lerp(blob.x, winGX, k); blob.y = lerp(blob.y, winGY, k); blob.px = blob.x; blob.py = blob.y;
      if (Math.random() < 0.9) { const a = rand(0, 6.28), d = rand(46, 96); particles.push({ x: winGX + Math.cos(a) * d, y: winGY + Math.sin(a) * d, vx: -Math.cos(a) * 260, vy: -Math.sin(a) * 260, life: 1, color: level.palette.accent, size: rand(2, 4) }); }
    }
    if (prev < 0.18 && winT >= 0.18) { fireWinBurst(); winHold = 0.075; return; }   // 着弾→一瞬止めて“ドン”を効かせる
    if (winT >= 0.18) {  // フェーズB：余韻（きらめき上昇）
      timeScaleTarget = 1; winSpark += dt;
      const rate = winT < 1.0 ? 0.025 : 0.05;
      while (winSpark >= rate) { winSpark -= rate; particles.push({ x: winGX + rand(-72, 72), y: winGY + rand(-12, 24), vx: rand(-26, 26), vy: rand(-270, -150), life: 1, color: Math.random() < 0.5 ? '#ffffff' : level.palette.accent, size: rand(2, 5) }); }
    }
    blob.stuck = true; blob.nx = 0; blob.ny = -1; blob.vx = 0; blob.vy = 0;   // 出口で勝ち姿勢（idleバウンド）
    updateSquash(dt); ageParticles(dt);
    for (const r of winRings) { r.r += 440 * dt; r.life -= dt / 0.7; }
    winRings = winRings.filter(r => r.life > 0);
    if (winFlash > 0) winFlash = Math.max(0, winFlash - dt / 0.45);
    if (winT >= WIN_DUR) onClear();
  }

  function onClear() {
    winning = false;
    gameState = 'clear';
    progress.cleared[levelIndex] = true;   // 進捗：クリア記録＋次を解放＋保存
    if (levelIndex + 1 < LEVELS.length) progress.unlocked = Math.max(progress.unlocked, levelIndex + 1);
    saveProgress();
    const got = dangoGot(), tot = level.dango.length;
    totalDango += got;   // 累計はクリア時に加算（リスポーンでの再取得を二重計上しない）
    document.getElementById('clear-kicker').textContent = level.code + '  ' + (WORLDS[level.world - 1] ? WORLDS[level.world - 1].name : '');
    document.getElementById('clear-sub').textContent = level.name;
    document.getElementById('clear-stats').innerHTML =
      pipsHTML(got, tot) +
      '<div class="stats">' +
        `<div class="stat-row"><span class="k">しずく</span><span class="v">${got} / ${tot}</span></div>` +
        `<div class="stat-row"><span class="k">ちょうせん</span><span class="v">${tries + 1}</span></div>` +
      '</div>' +
      (got === tot ? '<div class="badge">PERFECT</div>' : '');
    show('clear');
  }
  function pipsHTML(got, tot) {  // しずくを水滴ピップで（絵文字なし）
    let s = '<div class="pips">';
    for (let i = 0; i < tot; i++) s += '<span class="pip' + (i < got ? ' full' : '') + '"></span>';
    return s + '</div>';
  }
  function dangoGot() { return level.dango.filter(d => d.got).length; }

  function clampCamY(y) {
    const half = VH / (2 * baseScale * cam.zoom);
    if (level.worldH <= half * 2) return level.worldH / 2;
    return clamp(y, half, level.worldH - half);
  }

  // ---- 射出ベクトル（実物理と同一）----
  //  くっついている時は、面の法線まわり ±D.stick.maxOffNormal のコーン内に発射方向を制限。
  //  壁に沿う/壁へ向かう入力はコーンの縁へ折り曲げる＝壁沿いの垂直よじ登りを封じる。
  function clampToCone(dx, dy) {
    if (!blob.stuck) return [dx, dy];
    const nl = Math.hypot(blob.nx, blob.ny) || 1, Nx = blob.nx / nl, Ny = blob.ny / nl;
    const dot = dx * Nx + dy * Ny, cosM = Math.cos(D.stick.maxOffNormal);
    if (dot >= cosM) return [dx, dy];                 // すでに許容内
    let tx = dx - dot * Nx, ty = dy - dot * Ny, tl = Math.hypot(tx, ty);  // 面に沿う成分
    if (tl < 1e-4) { tx = -Ny; ty = Nx; if (ty > 0) { tx = -tx; ty = -ty; } tl = 1; }  // 真っ直ぐ面へ→上寄りの接線
    tx /= tl; ty /= tl;
    const sinM = Math.sin(D.stick.maxOffNormal);
    return [Nx * cosM + tx * sinM, Ny * cosM + ty * sinM];
  }
  function aimVel() {
    const dx = aim.sx - aim.cx, dy = aim.sy - aim.cy, d = len(dx, dy);
    if (d < 0.0001) return { vx: 0, vy: 0, speed: 0, charge: 0, pull: 0 };
    const pull = Math.min(d / baseScale, P.maxPull);
    const speed = clamp(pull * P.launchMul, P.speedMin, P.speedMax);
    const [ux, uy] = clampToCone(dx / d, dy / d);
    return { vx: ux * speed, vy: uy * speed, speed, charge: pull / P.maxPull, pull };
  }
  function platPoly(i) { const pl = level.platforms[i]; const out = []; for (const v of pl.pts) out.push({ x: v.x + pl.cx, y: v.y + pl.cy }); return out; }
  function simTrajectory(vx, vy) {
    const h = P.fixedStep, dmp = Math.pow(P.airDamping, h);
    let x = blob.x, y = blob.y, ign = P.launchIgnoreSteps;
    const beads = []; let land = null, lethal = false;
    for (let i = 0; i < D.trajectory.steps; i++) {
      vy += P.gravity * h; vx *= dmp; vy *= dmp;
      for (const bz of level.boosts) if (x > bz.x && x < bz.x + bz.w && y > bz.y && y < bz.y + bz.h) { vx += bz.dx * GM.boostAccel * h; vy += bz.dy * GM.boostAccel * h; }
      const sp = len(vx, vy); if (sp > GM.boostMaxSpeed) { vx *= GM.boostMaxSpeed / sp; vy *= GM.boostMaxSpeed / sp; }
      if (vy > P.fallClamp) vy = P.fallClamp;
      x += vx * h; y += vy * h; if (ign > 0) ign--;
      if (i % D.trajectory.beadEvery === 0) beads.push({ x, y });
      for (const b of level.bouncy) { const dx = x - b.x, dy = y - b.y, rr = R + b.r; if (dx * dx + dy * dy < rr * rr) { const d = len(dx, dy) || 1, nx = dx / d, ny = dy / d; x = b.x + nx * rr; y = b.y + ny * rr; const vn = vx * nx + vy * ny, e = GM.bumperRestitution; vx -= (1 + e) * vn * nx; vy -= (1 + e) * vn * ny; const o = len(vx, vy); if (o < GM.bumperMinOut) { const s = GM.bumperMinOut / (o || 1); vx *= s; vy *= s; } } }
      for (const hz of level.hazards) if (CAVE.circlePoly(x, y, R, hz)) { land = { x, y }; lethal = true; break; }
      if (land) break;
      if (ign <= 0) for (const sp of level.slipWalls) if (CAVE.circlePoly(x, y, R, sp)) { land = { x, y }; break; }
      if (!land && ign <= 0) for (let i = 0; i < level.platforms.length; i++) if (CAVE.circlePoly(x, y, R, platPoly(i))) { land = { x, y }; break; }
      if (!land && ign <= 0) for (let k = 0; k < level.walls.length; k++) if (CAVE.circlePoly(x, y, R, level.walls[k])) { land = { x, y }; break; }
      if (land || y > level.worldH + 200) break;
    }
    return { beads, land, lethal };
  }

  // ---- 物理（固定ステップ）----
  function stepFixed(h) {
    blob.px = blob.x; blob.py = blob.y;
    simTime += h;  // 首振りは常に進む（死亡演出中も止めない）
    if (!alive) { updateSquash(h); ageParticles(h); return; }
    // 強制スクロールの床（水攻め）：下からせり上がり、触れたら即アウト（生存中のみ進む）
    if (level.rise) { floorY -= level.rise * h; if (blob.y + R > floorY) { drown(); return; } }
    // 滑降：最下部のフィニッシュラインを越えたらクリア（貼り付き中／飛行中どちらでも）
    if (level.descent && blob.y > level.goal.y) { winStart(); return; }
    // 動くバンパー：左右に往復（基準bxからmove幅で）
    for (const b of level.bouncy) if (b.move) b.x = b.bx + b.move * Math.sin(simTime * b.mspeed + b.mphase);
    // 動く致死スパイク：位置更新＋衝突（飛行中も貼り付き中も即ミス）
    for (const m of level.movers) {
      const s = Math.sin(simTime * m.speed + m.phase);
      m.cx = m.x0 + m.ax * m.amp * s; m.cy = m.y0 + m.ay * m.amp * s;
      if (len(blob.x - m.cx, blob.y - m.cy) < R + m.r) { die(); return; }
    }
    // 動く台：位置更新＋（乗っていれば）一緒に運ぶ
    for (const pl of level.platforms) { pl.pcx = pl.cx; pl.pcy = pl.cy; const s = Math.sin(simTime * pl.speed + pl.phase); pl.cx = pl.x0 + pl.ax * pl.amp * s; pl.cy = pl.y0 + pl.ay * pl.amp * s; }
    if (blob.stuck && blob.plat >= 0 && level.platforms[blob.plat]) { const pl = level.platforms[blob.plat]; blob.x += pl.cx - pl.pcx; blob.y += pl.cy - pl.pcy; }
    if (!blob.stuck) {
      blob.vy += P.gravity * h;
      const dmp = Math.pow(P.airDamping, h); blob.vx *= dmp; blob.vy *= dmp;
      let inBoost = false;
      for (const bz of level.boosts) if (blob.x > bz.x && blob.x < bz.x + bz.w && blob.y > bz.y && blob.y < bz.y + bz.h) { blob.vx += bz.dx * GM.boostAccel * h; blob.vy += bz.dy * GM.boostAccel * h; inBoost = true; }
      if (inBoost) { const sp = len(blob.vx, blob.vy); if (sp > GM.boostMaxSpeed) { blob.vx *= GM.boostMaxSpeed / sp; blob.vy *= GM.boostMaxSpeed / sp; } boostT += h; if (boostT > 0.08) { boostT = 0; beep(1000, 0.05, 'sine', 0.05, 1500); } }
      if (blob.vy > P.fallClamp) blob.vy = P.fallClamp;
      blob.x += blob.vx * h; blob.y += blob.vy * h;
      if (blob.ignoreT > 0) blob.ignoreT--;

      for (const hz of level.hazards) if (CAVE.circlePoly(blob.x, blob.y, R, hz)) { die(); return; }
      if (blob.y > level.worldH + 250) { die(); return; }
      if (len(blob.x - level.goal.x, blob.y - level.goal.y) < R + P.goalRadius) { winStart(); return; }

      for (const b of level.bouncy) {
        const dx = blob.x - b.x, dy = blob.y - b.y, rr = R + b.r;
        if (dx * dx + dy * dy < rr * rr) {
          const d = len(dx, dy) || 1, nx = dx / d, ny = dy / d;
          blob.x = b.x + nx * rr; blob.y = b.y + ny * rr;
          const vn = blob.vx * nx + blob.vy * ny, e = GM.bumperRestitution;
          blob.vx -= (1 + e) * vn * nx; blob.vy -= (1 + e) * vn * ny;
          const o = len(blob.vx, blob.vy); if (o < GM.bumperMinOut) { const s = GM.bumperMinOut / (o || 1); blob.vx *= s; blob.vy *= s; }
          impulseSquash(Math.atan2(ny, nx), 0.7, 1 / 0.7);
          bumpChain++;
          sfx.bounce(bumpChain - 1); vibe(D.haptics.land);
          burstRing(blob.x, blob.y, level.palette.accent, 14 + bumpChain * 4);
          addTrauma(0.25 + bumpChain * 0.05); freeze = Math.max(freeze, 2);   // 一瞬ヒットストップ＝“トッ”
          if (bumpChain >= 2) { texts.push({ x: blob.x, y: blob.y - 22, n: bumpChain, life: 1 }); popFlash = Math.min(0.5, bumpChain * 0.1); }
        }
      }
      // 着地：動く台（乗る）→ 滑る壁（貼り付くが滑る）→ 通常壁
      if (blob.ignoreT <= 0) {
        let done = false;
        for (let i = 0; i < level.platforms.length && !done; i++) { const c = CAVE.circlePoly(blob.x, blob.y, R, platPoly(i)); if (c) { land(c); blob.plat = i; blob.slip = false; done = true; } }
        for (let k = 0; k < level.slipWalls.length && !done; k++) { const c = CAVE.circlePoly(blob.x, blob.y, R, level.slipWalls[k]); if (c) { land(c); blob.plat = -1; blob.slip = true; done = true; } }
        for (let k = 0; k < level.walls.length && !done; k++) { const c = CAVE.circlePoly(blob.x, blob.y, R, level.walls[k]); if (c) { land(c); blob.plat = -1; blob.slip = false; done = true; } }
      }
    } else if (blob.slip) {   // 氷の壁：貼り付くが下へ滑り落ちる（滑降ステージは高速＝level.slipSpeedで上書き）
      blob.y += (level.slipSpeed || RU.slipSpeed) * h;
      blob.x -= blob.nx * 2; blob.y -= blob.ny * 2;            // 壁へ少し押し当てて吸着を維持
      let c = null, onSlip = false;
      for (let k = 0; k < level.slipWalls.length; k++) { const cc = CAVE.circlePoly(blob.x, blob.y, R, level.slipWalls[k]); if (cc) { c = cc; onSlip = true; break; } }
      if (!c) for (let k = 0; k < level.walls.length; k++) { const cc = CAVE.circlePoly(blob.x, blob.y, R, level.walls[k]); if (cc) { c = cc; break; } }
      if (c) { blob.x += c.nx * c.pen; blob.y += c.ny * c.pen; blob.nx = c.nx; blob.ny = c.ny; blob.slip = onSlip; }
      else { blob.stuck = false; blob.slip = false; blob.vx = blob.nx * 40; blob.vy = 90; blob.ignoreT = P.launchIgnoreSteps; }   // 板の下端で離脱→落下
      const spray = level.descent ? 3 : (Math.random() < 0.3 ? 1 : 0);   // 滑降は氷しぶき多め＝スピード感
      for (let s = 0; s < spray; s++) particles.push({ x: blob.x - blob.nx * R + rand(-6, 6), y: blob.y - blob.ny * R, vx: blob.nx * rand(-40, 40), vy: level.descent ? rand(-120, -40) : 70, life: 1, color: Math.random() < 0.5 ? '#cfeaff' : '#ffffff', size: rand(2, 4) });   // 氷の粉（滑降は後方へ）
    }
    // 隠れ蓑の雫を拾う → 一定時間 透明化
    if (level.cloaks) for (const c of level.cloaks) if (!c.used && len(blob.x - c.x, blob.y - c.y) < R + D.cloak.radius) {
      c.used = true; cloakT = D.cloak.duration;
      beep(640, 0.10, 'sine', 0.16, 1180); setTimeout(() => beep(960, 0.12, 'sine', 0.14, 1480), 80);
      burstRing(c.x, c.y, '#e8f6ff', 16); texts.push({ x: c.x, y: c.y - 20, txt: 'すがた けし', life: 1.2 });
    }
    // 見張りの視線に入っていれば発見メーターが溜まる（飛行中も貼り付き中も）。隠れ蓑中は見えない。
    if (level.sentries && level.sentries.length) {
      if (cloakT > 0) {
        for (const s of level.sentries) s.hot = false;
        alert = Math.max(0, alert - h / ST.drainTime * 2);   // 透明中は警戒が速く引く
      } else {
        let seen = false;
        for (const s of level.sentries) { const v = sentrySees(s, blob.x, blob.y); s.hot = v; if (v) seen = true; }
        if (seen) {
          alert = Math.min(1, alert + h / ST.fillTime); alarmPing += h;
          if (alarmPing > 0.16) { alarmPing = 0; beep(680 + alert * 900, 0.05, 'square', 0.05 + alert * 0.07, 1100 + alert * 700); }
          if (alert >= 1) { caught(); return; }
        } else alert = Math.max(0, alert - h / ST.drainTime);
      }
    }
    if (cloakT > 0) cloakT = Math.max(0, cloakT - h);
    for (const d of level.dango) if (!d.got && len(blob.x - d.x, blob.y - d.y) < R + 14) {
      d.got = true;
      launches += RU.launchPerDango;   // 💧回収で飛ばし回数を少し回復（リスク報酬）
      combo = blob.stuck ? 1 : combo + 1;
      beep(D.combo.base + Math.min(combo, 8) * D.combo.pitchStep, 0.09, 'square', 0.13);
      burstRing(d.x, d.y, level.palette.accent, 12 + combo * 2);
      texts.push({ x: d.x, y: d.y - 32, txt: '+' + RU.launchPerDango + '↗', life: 1, good: true });   // 回復を明示
      if (combo >= 2) texts.push({ x: d.x, y: d.y - 18, n: combo, life: 1 });
      updateHUD();
    }
    updateSquash(h); ageParticles(h); flightTrail(h);
  }
  function land(c) {
    const speed = len(blob.vx, blob.vy);
    blob.x += c.nx * c.pen; blob.y += c.ny * c.pen;
    blob.vx = 0; blob.vy = 0; blob.stuck = true; blob.nx = c.nx; blob.ny = c.ny;
    const p = clamp(speed / P.speedMax, 0, 1);
    impulseSquash(Math.atan2(c.ny, c.nx), SQ.landAlong, 1 / SQ.landAlong);
    addTrauma(speed * D.shake.perSpeed);
    const cxp = blob.x - c.nx * R, cyp = blob.y - c.ny * R;
    splat(cxp, cyp, c.nx, c.ny, Math.round(6 + p * D.particles.landDust), level.palette.accent);
    burstRing(cxp, cyp, level.palette.accent, D.particles.landDust);
    if (speed > 60) { sfx.land(p); vibe(D.haptics.land); }
    if (combo >= 3) beep(1200, 0.12, 'triangle', 0.16, 1700);  // コンボ締めの達成音
    if (bumpChain >= 3) beep(1000, 0.14, 'triangle', 0.18, 1500);  // バンパー連鎖の締め
    combo = 0; bumpChain = 0;
    if (alive && launches <= 0) failNoMoves();   // 最後の1回を撃って出口でなく壁に着地＝回数ぎれ失敗
  }

  // ---- スクワッシュ（2階バネ）----
  function impulseSquash(ang, along, perp) { def.ang = ang; def.sx = along; def.sy = perp; def.vsx = 0; def.vsy = 0; }
  function updateSquash(h) {
    let tx = 1, ty = 1, toffx = 0, toffy = 0;
    if (blob.stuck && aim.active) {
      const a = aimVel(); def.ang = Math.atan2(a.vy, a.vx);
      tx = lerp(1, SQ.chargeAlong, a.charge); ty = lerp(1, SQ.chargePerp, a.charge);
      toffx = -Math.cos(def.ang) * SQ.chargeOffset * R * a.charge; toffy = -Math.sin(def.ang) * SQ.chargeOffset * R * a.charge;
    } else if (!blob.stuck) {
      const sp = len(blob.vx, blob.vy); if (sp > 1) def.ang = Math.atan2(blob.vy, blob.vx);
      const st = clamp(sp / P.speedMax, 0, 1) * SQ.flightMax; tx = 1 + st; ty = 1 - st * 0.7;
    } else {
      const br = 1 + Math.sin(performance.now() / 1000 / SQ.idlePeriod * Math.PI * 2) * SQ.idleAmp;
      tx = br; ty = 2 - br; def.ang = Math.atan2(blob.ny, blob.nx) + Math.PI / 2;
    }
    def.vsx += (-SQ.k * (def.sx - tx) - SQ.c * def.vsx) * h; def.vsy += (-SQ.k * (def.sy - ty) - SQ.c * def.vsy) * h;
    def.sx += def.vsx * h; def.sy += def.vsy * h;
    def.offx = lerp(def.offx, toffx, 1 - Math.pow(0.001, h)); def.offy = lerp(def.offy, toffy, 1 - Math.pow(0.001, h));
  }

  // ---- 目 ----
  function updateEyes(dt, predicted) {
    let tx = eyes.x, ty = eyes.y;
    if (aim.active && predicted) { const dx = predicted.x - blob.x, dy = predicted.y - blob.y, d = len(dx, dy) || 1; tx = dx / d; ty = dy / d; }
    else if (!blob.stuck) { const d = len(blob.vx, blob.vy); if (d > 1) { tx = blob.vx / d; ty = blob.vy / d; } }
    else { const t = performance.now() / 700; tx = blob.nx * 0.5 + Math.sin(t) * 0.35; ty = blob.ny * 0.5 + Math.cos(t * 0.8) * 0.25; }
    eyes.x = lerp(eyes.x, tx, D.eyes.ease); eyes.y = lerp(eyes.y, ty, D.eyes.ease); eyes.wide = lerp(eyes.wide, 0, 0.1);
    if (alert > eyes.wide) eyes.wide = alert;   // 見つかりかけはビクッと見開く
    eyes.blinkTimer -= dt;
    if (eyes.blink > 0) eyes.blink -= dt;
    else if (eyes.blinkTimer <= 0 && blob.stuck && !aim.active) { eyes.blink = D.eyes.blinkDur; eyes.blinkTimer = rand(D.eyes.blinkEvery[0], D.eyes.blinkEvery[1]); }
  }

  // ---- パーティクル / シェイク / 胞子 ----
  function burstRing(x, y, color, n) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.28, s = rand(120, 260); particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: rand(3, 6) }); } }
  function splat(x, y, nx, ny, n, color) { const tx = -ny, ty = nx; for (let i = 0; i < n; i++) { const dir = Math.random() < 0.5 ? 1 : -1, s = rand(80, 300), sp = rand(0.1, 0.5); particles.push({ x, y, vx: (tx * dir + nx * sp) * s, vy: (ty * dir + ny * sp) * s, life: 1, color, size: rand(2.5, 5) }); } }
  function launchParticles(vx, vy, charge) {
    const d = len(vx, vy) || 1, dx = vx / d, dy = vy / d;
    const n = Math.round(lerp(D.particles.launchCount[0], D.particles.launchCount[1], charge));
    for (let i = 0; i < n; i++) { const a = Math.atan2(-dy, -dx) + rand(-0.5, 0.5), s = rand(150, 380); particles.push({ x: blob.x, y: blob.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: level.palette.blob, size: rand(3, 7) }); }
    burstRing(blob.x, blob.y, level.palette.accent, D.particles.launchRing);
  }
  function ageParticles(h) { for (const p of particles) { p.vy += 900 * h; p.x += p.vx * h; p.y += p.vy * h; p.vx *= Math.pow(0.2, h); p.life -= h / 0.5; } particles = particles.filter(p => p.life > 0); }
  function flightTrail(h) { if (blob.stuck || len(blob.vx, blob.vy) < D.particles.trailSpeed) return; trail += h; if (trail >= D.particles.trailEvery) { trail = 0; particles.push({ x: blob.x, y: blob.y, vx: 0, vy: 0, life: 1, color: hexA(level.palette.blob, 0.5), size: R * 0.8, ghost: true }); } }
  function addTrauma(t) { trauma = clamp(trauma + t, 0, D.shake.max); }
  function initSpores() { spores = []; for (let i = 0; i < D.cave.sporeCount; i++) spores.push({ x: rand(0, COL), y: rand(0, VH), s: rand(2, 5), vy: rand(-30, -12), ph: rand(0, 6.28) }); }
  function updateSpores(dt) { for (const s of spores) { s.ph += dt * 1.5; s.y += s.vy * dt; if (s.y < -10) { s.y = level.worldH + 10; s.x = rand(0, COL); } } }
  function updateTexts(dt) { for (const t of texts) { t.y -= 30 * dt; t.life -= dt / 0.8; } texts = texts.filter(t => t.life > 0); }

  // ---- 入力（同フレーム発火）----
  function ptr(e) { const t = e.touches ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
  function onDown(e) {
    if (gameState === 'map') { const p = ptr(e); mapDrag.active = true; mapDrag.sx = p.x; mapDrag.sy = p.y; mapDrag.base = mapScroll; mapDrag.moved = false; mapDrag.last = p.y; mapScrollV = 0; e.preventDefault(); return; }
    if (gameState !== 'play' || !alive || winning) return; e.preventDefault(); if (!blob.stuck) return; const p = ptr(e); aim.active = true; aim.sx = p.x; aim.sy = p.y; aim.cx = p.x; aim.cy = p.y; timeScaleTarget = D.slowmo.chargeScale; }
  function onMove(e) {
    if (gameState === 'map') { if (!mapDrag.active) return; const p = ptr(e); const d = p.y - mapDrag.sy; if (Math.abs(d) > 8) mapDrag.moved = true; mapScroll = clamp(mapDrag.base - d, 0, mapMaxScroll()); mapScrollV = -(p.y - mapDrag.last) * 55; mapDrag.last = p.y; e.preventDefault(); return; }
    if (!aim.active) return; e.preventDefault(); const p = ptr(e); aim.cx = p.x; aim.cy = p.y; }
  function onUp(e) {
    if (gameState === 'map') { e.preventDefault(); if (mapDrag.active && !mapDrag.moved) mapTapAt(mapDrag.sx, mapDrag.sy); mapDrag.active = false; return; }
    if (!aim.active) return; e.preventDefault(); aim.active = false; timeScaleTarget = 1;
    const a = aimVel(); if (a.pull < 6) return;
    if (launches <= 0) return;   // 念のため（通常はのこり0で着地した瞬間に失敗判定が入る）
    blob.stuck = false; blob.plat = -1; blob.slip = false; blob.vx = a.vx; blob.vy = a.vy; blob.ignoreT = P.launchIgnoreSteps; bumpChain = 0;
    launches--; updateHUD();     // 1回の飛ばしで1消費
    impulseSquash(Math.atan2(a.vy, a.vx), SQ.launchAlong, SQ.launchPerp);
    launchParticles(a.vx, a.vy, a.charge); sfx.launch(a.charge); vibe(D.haptics.launch);
  }
  canvas.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp, { passive: false });

  // ---- 描画 ----
  function poly(p) { ctx.beginPath(); for (let i = 0; i < p.length; i++) { if (i === 0) ctx.moveTo(p[i].x, p[i].y); else ctx.lineTo(p[i].x, p[i].y); } ctx.closePath(); }

  function render(alpha) {
    if (gameState === 'map') { drawMap(); return; }   // ステージ選択MAP
    // 背景
    if (level) { const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, level.palette.bg); g.addColorStop(1, shade(level.palette.bg, 0.6)); ctx.fillStyle = g; }
    else ctx.fillStyle = '#06202a';
    ctx.fillRect(0, 0, VW, VH);
    if (!level) return;

    const z = baseScale * cam.zoom;
    const tr2 = trauma * trauma;
    const shx = (Math.random() - 0.5) * 2 * D.shake.maxOffset * tr2, shy = (Math.random() - 0.5) * 2 * D.shake.maxOffset * tr2;
    const rot = (Math.random() - 0.5) * 2 * D.shake.maxRot * tr2;

    ctx.save();
    ctx.translate(VW / 2, VH / 2); ctx.rotate(rot); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y); ctx.translate(shx / z, shy / z);

    // 奥行きブロブ
    ctx.fillStyle = hexA(level.palette.wall, 0.5);
    const off = cam.y * 0.3;
    for (let i = 0; i < 5; i++) { const bx = (i * 137) % COL; const by = (((i * 360 + off) % (level.worldH)) ); ctx.beginPath(); ctx.ellipse(bx, by, 70 + (i % 3) * 30, 60 + (i % 2) * 30, 0, 0, 6.28); ctx.fill(); }

    // 胞子
    ctx.fillStyle = level.palette.accent;
    for (const s of spores) { ctx.globalAlpha = 0.18 + 0.25 * (Math.sin(s.ph) + 1) / 2; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, COL, level.worldH); ctx.clip();
    drawSentryCones(); drawCave(); drawBoosts(); drawSlipWalls(); drawPlatforms(); drawBouncy(); drawHazards(); drawMovers(); drawGoal(); drawOrbs(); drawCloaks(); drawSentryEyes(); drawRiseFloor();
    let predicted = null;
    if (gameState === 'play' && aim.active) { const a = aimVel(); const tr = simTrajectory(a.vx, a.vy); predicted = tr.land; drawTrajectory(tr, a.charge); }
    if (winning) drawWinRings();
    drawParticles(); drawTexts();
    if (alive) drawBlob(alpha, predicted);
    ctx.restore();

    ctx.restore();
    drawAlert();
    if (level && level.rise && alive) {  // 水面が画面下から迫る警告（青いグロー＝早く登れ）
      const zz = baseScale * cam.zoom, surfSY = VH / 2 + (floorY - cam.y) * zz;
      const prox = clamp((VH - surfSY) / (VH * 0.5), 0, 1);
      if (prox > 0.02) { const a = prox * (0.22 + 0.12 * Math.sin(performance.now() / 110));
        const vg = ctx.createLinearGradient(0, VH, 0, VH * 0.5); vg.addColorStop(0, `rgba(60,140,225,${a})`); vg.addColorStop(1, 'rgba(60,140,225,0)');
        ctx.fillStyle = vg; ctx.fillRect(0, VH * 0.5, VW, VH * 0.5); }
    }
    if (flash > 0) { ctx.fillStyle = hexA(D.danger, flash * 0.5); ctx.fillRect(0, 0, VW, VH); }
    if (popFlash > 0 && level) { ctx.fillStyle = hexA(level.palette.accent, popFlash * 0.35); ctx.fillRect(0, 0, VW, VH); }
    if (winFlash > 0 && level) { ctx.fillStyle = `rgba(255,255,255,${winFlash * 0.55})`; ctx.fillRect(0, 0, VW, VH); }  // 着弾の白閃光
    if (winning && winT >= 0.18 && level) {  // 出口から走る画面リング
      const z = baseScale * cam.zoom, sx = VW / 2 + (winGX - cam.x) * z, sy = VH / 2 + (winGY - cam.y) * z;
      const bt = winT - 0.18, a = clamp(1 - bt / 0.5, 0, 1);
      if (a > 0) { ctx.strokeStyle = `rgba(255,255,255,${a * 0.6})`; ctx.lineWidth = 5 * a + 1.5; ctx.beginPath(); ctx.arc(sx, sy, bt * 1150, 0, 6.28); ctx.stroke(); }
    }
    if (outMsg > 0) {  // 回数ぎれ失敗の告知（画面中央・やり直し）
      const a = clamp(outMsg / 1.4, 0, 1);
      ctx.fillStyle = `rgba(10,12,30,${0.5 * a})`; ctx.fillRect(0, VH / 2 - 54, VW, 108);
      ctx.textAlign = 'center';
      ctx.globalAlpha = a; ctx.fillStyle = level ? level.palette.accent : '#ffd24a';
      ctx.font = 'bold 30px "Noto Sans JP", sans-serif'; ctx.fillText('もう とべない…', VW / 2, VH / 2 + 4);
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = 'bold 14px "Noto Sans JP", sans-serif';
      ctx.fillText('とばし回数ぎれ — やりなおし', VW / 2, VH / 2 + 30);
      ctx.globalAlpha = 1; ctx.textAlign = 'left';
    }
  }

  function drawCave() {
    const tm = performance.now();
    for (const pl of level.walls) {
      ctx.beginPath();
      for (let i = 0; i < pl.length; i++) { const pt = pl[i]; let x = pt.x; if (x > 5 && x < COL - 5) x += Math.sin(tm * D.cave.wobbleSpeed + i * 0.7 + pt.y * 0.012) * D.cave.wobbleAmp; if (i === 0) ctx.moveTo(x, pt.y); else ctx.lineTo(x, pt.y); }
      ctx.closePath();
      ctx.fillStyle = level.palette.wall; ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineWidth = D.cave.edgeWidth; ctx.globalAlpha = D.cave.edgeAlpha; ctx.strokeStyle = level.palette.accent; ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  function drawHazards() { for (const hz of level.hazards) { poly(hz); ctx.fillStyle = hexA(D.danger, 0.9); ctx.fill(); ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff'; ctx.globalAlpha = 0.5; ctx.stroke(); ctx.globalAlpha = 1; } }
  function drawPlatforms() {  // 動く台（からくり）：往復軌道＋木目調の台
    if (!level.platforms) return;
    for (const pl of level.platforms) {
      ctx.strokeStyle = hexA(level.palette.accent, 0.22); ctx.lineWidth = 2.5; ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(pl.x0 - pl.ax * pl.amp, pl.y0 - pl.ay * pl.amp); ctx.lineTo(pl.x0 + pl.ax * pl.amp, pl.y0 + pl.ay * pl.amp); ctx.stroke(); ctx.setLineDash([]);
      const p = platPoly(level.platforms.indexOf(pl));
      poly(p); ctx.fillStyle = shade(level.palette.wall, 1.5); ctx.fill();
      ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = level.palette.accent; ctx.stroke();
      ctx.fillStyle = hexA(level.palette.accent, 0.5); ctx.fillRect(pl.cx - 5, pl.cy - 2, 10, 4);   // 中央の留め金
    }
  }
  function xAtY(pts, y) {  // 折れ線(y昇順)の指定yでのx（氷壁の内側エッジ補間）
    if (y <= pts[0].y) return pts[0].x;
    if (y >= pts[pts.length - 1].y) return pts[pts.length - 1].x;
    for (let i = 1; i < pts.length; i++) if (pts[i].y >= y) { const a = pts[i - 1], b = pts[i], t = (y - a.y) / ((b.y - a.y) || 1); return a.x + (b.x - a.x) * t; }
    return pts[pts.length - 1].x;
  }
  function drawIceWall(s) {  // 滑降：左右まるごとの氷壁（不透明な氷＋発光する内エッジ＋下へ流れる高速シェブロン）
    const isLeft = s[0].x < COL / 2;
    poly(s); ctx.fillStyle = shade(level.palette.wall, 1.0); ctx.fill();
    const inner = s.slice(1, s.length - 1);
    ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = level.palette.accent; ctx.globalAlpha = 0.92;
    ctx.beginPath(); for (let i = 0; i < inner.length; i++) { const p = inner[i]; i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); } ctx.stroke();
    ctx.globalAlpha = 0.4; ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(200,238,255,0.5)'; ctx.stroke(); ctx.globalAlpha = 1;   // 内エッジの氷の艶
    const ylo = inner[0].y, yhi = inner[inner.length - 1].y, t = (performance.now() / 240) % 42;
    ctx.strokeStyle = 'rgba(238,251,255,0.5)'; ctx.lineWidth = 2.5;
    for (let y = ylo + t; y < yhi; y += 42) { const x = xAtY(inner, y), dir = isLeft ? 1 : -1; ctx.beginPath(); ctx.moveTo(x + dir * 4, y - 10); ctx.lineTo(x + dir * 17, y); ctx.lineTo(x + dir * 4, y + 10); ctx.stroke(); }
  }
  function drawSlipWalls() {  // 滑る壁（氷の板）：氷青の光沢＋下向きシェブロン（滑る合図）
    if (!level.slipWalls) return;
    if (level.descent) { for (const s of level.slipWalls) drawIceWall(s); return; }   // 滑降は全面の氷壁
    for (const s of level.slipWalls) {
      poly(s); ctx.fillStyle = 'rgba(180,228,255,0.45)'; ctx.fill();
      ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(220,245,255,0.9)'; ctx.stroke();
      let ylo = 1e9, yhi = -1e9, xm = 0; for (const v of s) { ylo = Math.min(ylo, v.y); yhi = Math.max(yhi, v.y); xm += v.x; } xm /= s.length;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2;
      const t = (performance.now() / 600) % 1;
      for (let y = ylo + (yhi - ylo) * t; y < yhi; y += 26) { ctx.beginPath(); ctx.moveTo(xm - 7, y - 4); ctx.lineTo(xm, y + 2); ctx.lineTo(xm + 7, y - 4); ctx.stroke(); }
    }
  }
  function drawRiseFloor() {  // 強制スクロールの床（水攻め）：下からせり上がる水面＋輝線＋泡
    if (!level.rise || floorY > level.worldH + 60) return;
    const tm = performance.now() / 1000, surf = floorY, bottomY = level.worldH + 120;
    const wave = (x) => surf + Math.sin(x * 0.045 + tm * 3) * 6 + Math.sin(x * 0.12 - tm * 2.2) * 3.2;
    const g = ctx.createLinearGradient(0, surf, 0, surf + 320);
    g.addColorStop(0, 'rgba(150,212,255,0.50)'); g.addColorStop(0.45, 'rgba(56,128,212,0.58)'); g.addColorStop(1, 'rgba(16,44,104,0.78)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-20, bottomY); ctx.lineTo(-20, wave(-20));
    for (let x = -20; x <= COL + 20; x += 22) ctx.lineTo(x, wave(x));
    ctx.lineTo(COL + 20, bottomY); ctx.closePath(); ctx.fill();
    // 泡（水中で上へ）
    ctx.fillStyle = 'rgba(220,245,255,0.5)';
    for (const b of riseBubbles) { const by = surf + b.off - ((tm * b.sp) % 300); if (by <= surf + 6) continue; ctx.globalAlpha = clamp((by - surf) / 60, 0, 1) * 0.5; ctx.beginPath(); ctx.arc(b.x, by, b.s, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    // 水面の輝線
    ctx.strokeStyle = 'rgba(225,247,255,0.9)'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.beginPath();
    for (let x = -20; x <= COL + 20; x += 10) { const y = wave(x); x === -20 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
  }
  function drawMovers() {  // 動く致死スパイク（往復するトゲ玉）＋スライド軌道
    if (!level.movers) return;
    const t = performance.now() / 200;
    for (const m of level.movers) {
      ctx.strokeStyle = hexA(D.danger, 0.18); ctx.lineWidth = 3; ctx.setLineDash([4, 7]);
      ctx.beginPath(); ctx.moveTo(m.x0 - m.amp, m.y0); ctx.lineTo(m.x0 + m.amp, m.y0); ctx.stroke(); ctx.setLineDash([]);
      ctx.save(); ctx.translate(m.cx, m.cy); ctx.rotate(t);
      ctx.fillStyle = D.danger; ctx.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * 6.28, rr = i % 2 ? m.r + 5 : m.r * 0.6; const px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.arc(0, 0, m.r * 0.32, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }
  function drawBouncy() {  // バンパー（ピンボール式）
    for (const b of level.bouncy) {
      const pu = 1 + Math.sin(performance.now() / 220 + b.x) * 0.12;
      ctx.save(); ctx.shadowColor = level.palette.accent; ctx.shadowBlur = 18;
      ctx.fillStyle = level.palette.accent; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r * pu, b.r / pu, 0, 0, 6.28); ctx.fill(); ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.66, 0, 6.28); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.2, 0, 6.28); ctx.fill();
    }
  }
  function drawSentryCones() {  // 見張りの視線（壁で遮られて見える＝cave描画前に描く）
    if (!level.sentries) return;
    const dim = cloakT > 0 ? 0.35 : 1;   // 隠れ蓑中は視線が薄れる＝隠れている合図
    for (const s of level.sentries) {
      const dir = sentryDir(s), hot = s.hot, c = hot ? '255,45,90' : '255,200,80';
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.arc(s.x, s.y, ST.range, dir - ST.halfAngle, dir + ST.halfAngle); ctx.closePath();
      const grd = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, ST.range);
      grd.addColorStop(0, `rgba(${c},${(hot ? 0.40 : 0.24) * dim})`); grd.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = grd; ctx.fill();
      ctx.strokeStyle = `rgba(${c},${(hot ? 0.65 : 0.30) * dim})`; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(dir - ST.halfAngle) * ST.range, s.y + Math.sin(dir - ST.halfAngle) * ST.range);
      ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(dir + ST.halfAngle) * ST.range, s.y + Math.sin(dir + ST.halfAngle) * ST.range);
      ctx.stroke();
    }
  }
  function drawSentryEyes() {  // 見張りの目（最前面）
    if (!level.sentries) return;
    for (const s of level.sentries) {
      const dir = sentryDir(s), hot = s.hot, col = hot ? '#ff2d6b' : '#ffc357';
      const pulse = hot ? 1 + Math.sin(performance.now() / 55) * 0.18 : 1;
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = hot ? 22 : 12;
      ctx.fillStyle = '#120a14'; ctx.beginPath(); ctx.arc(s.x, s.y, 16 * pulse, 0, 6.28); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(s.x, s.y, 10 * pulse, 0, 6.28); ctx.fill(); ctx.restore();
      ctx.fillStyle = '#120a14'; ctx.beginPath(); ctx.arc(s.x + Math.cos(dir) * 4.5, s.y + Math.sin(dir) * 4.5, 4.2, 0, 6.28); ctx.fill();
    }
  }
  function drawAlert() {  // 発見メーター＝赤いビネット＋警告（画面空間）
    if (alert <= 0.01) return;
    const pul = alert >= ST.warnAt ? (0.55 + 0.45 * Math.sin(performance.now() / 90)) : 1;
    const vg = ctx.createRadialGradient(VW / 2, VH / 2, Math.min(VW, VH) * 0.32, VW / 2, VH / 2, Math.max(VW, VH) * 0.72);
    vg.addColorStop(0, 'rgba(255,45,90,0)'); vg.addColorStop(1, `rgba(255,45,90,${(0.12 + alert * 0.42) * pul})`);
    ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
    if (alert >= ST.warnAt) {
      ctx.textAlign = 'center'; ctx.font = 'bold 22px "Noto Sans JP", sans-serif';
      ctx.fillStyle = `rgba(255,80,120,${0.55 * pul})`; ctx.fillText('！ みつかる', VW / 2, 52); ctx.textAlign = 'left';
    }
  }
  function drawBoosts() {  // 上昇気流（流れるシェブロン）
    const tm = performance.now() / 1000;
    for (const bz of level.boosts) {
      ctx.save(); ctx.beginPath(); ctx.rect(bz.x, bz.y, bz.w, bz.h); ctx.clip();
      ctx.fillStyle = hexA(level.palette.accent, 0.10); ctx.fillRect(bz.x, bz.y, bz.w, bz.h);
      ctx.strokeStyle = hexA(level.palette.accent, 0.5); ctx.lineWidth = 3; ctx.lineJoin = 'round';
      const gap = 46, off = (tm * 240) % gap, mx = bz.x + bz.w / 2;
      for (let yy = bz.y + bz.h - off; yy > bz.y - gap; yy -= gap) { ctx.beginPath(); ctx.moveTo(bz.x + 8, yy); ctx.lineTo(mx, yy - 16); ctx.lineTo(bz.x + bz.w - 8, yy); ctx.stroke(); }
      ctx.restore();
    }
  }
  function drawTexts() {  // コンボ表示
    ctx.textAlign = 'center'; ctx.font = 'bold 24px "Noto Sans JP", sans-serif';
    for (const t of texts) { ctx.globalAlpha = clamp(t.life, 0, 1); ctx.fillStyle = t.good ? level.palette.accent : t.txt ? '#e8f6ff' : '#fff'; ctx.fillText(t.txt || ('×' + t.n), t.x, t.y); }
    ctx.globalAlpha = 1; ctx.textAlign = 'left';
  }
  function drawOrbs() {
    for (const d of level.dango) {
      if (d.got) continue;
      const t = performance.now() / 400 + d.y, cy = d.y + Math.sin(t) * 3, rr = 9, wob = Math.sin(t) * 0.14;
      ctx.globalAlpha = 0.18; ctx.fillStyle = level.palette.accent; ctx.beginPath(); ctx.arc(d.x, cy, rr * 2, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = level.palette.accent; ctx.beginPath(); ctx.ellipse(d.x, cy, rr * (1 + wob), rr * (1 - wob), 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.beginPath(); ctx.arc(d.x - 3, cy - 3, 2.4, 0, 6.28); ctx.fill();
    }
  }
  function drawCloaks() {  // 隠れ蓑の雫（旋回する蓑＝丸い雫と区別）
    if (!level.cloaks) return;
    const tm = performance.now();
    for (const c of level.cloaks) {
      if (c.used) continue;
      const pr = 12 + Math.sin(tm / 500 + c.y) * 1.6;
      ctx.globalAlpha = 0.16; ctx.fillStyle = '#cfe9ff'; ctx.beginPath(); ctx.arc(c.x, c.y, pr * 2.1, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(tm / 700);
      ctx.fillStyle = 'rgba(232,246,255,0.9)';
      for (let k = 0; k < 3; k++) { const a = (k / 3) * 6.28; ctx.beginPath(); ctx.ellipse(Math.cos(a) * pr, Math.sin(a) * pr, 5.5, 3, a, 0, 6.28); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.beginPath(); ctx.arc(c.x, c.y, 4.5, 0, 6.28); ctx.fill();
    }
  }
  function drawGoal() {
    const g = level.goal, t = performance.now() / 500;
    if (level.descent) {  // 滑降：最下部のフィニッシュライン（横帯＋市松＋光）
      const dash = 22, off = (performance.now() / 60) % (dash * 2);
      ctx.save(); ctx.globalAlpha = 0.85; ctx.strokeStyle = level.palette.accent; ctx.lineWidth = 10; ctx.setLineDash([dash, dash]); ctx.lineDashOffset = -off;
      ctx.beginPath(); ctx.moveTo(-40, g.y); ctx.lineTo(COL + 40, g.y); ctx.stroke(); ctx.setLineDash([]);
      const gr = ctx.createLinearGradient(0, g.y - 60, 0, g.y); gr.addColorStop(0, hexA(level.palette.accent, 0)); gr.addColorStop(1, hexA(level.palette.accent, 0.32));
      ctx.fillStyle = gr; ctx.fillRect(-40, g.y - 60, COL + 80, 60); ctx.restore();
      ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = 'bold 20px "Noto Sans JP",sans-serif'; ctx.globalAlpha = 0.9; ctx.fillText('GOAL', g.x, g.y - 16); ctx.globalAlpha = 1; ctx.textAlign = 'left';
      return;
    }
    for (let i = 0; i < 3; i++) { const ph = (t + i / 3) % 1; ctx.globalAlpha = (1 - ph) * 0.4; ctx.strokeStyle = level.palette.accent; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(g.x, g.y, 18 + ph * 42, 0, 6.28); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const rad = ctx.createRadialGradient(g.x, g.y, 2, g.x, g.y, 38); rad.addColorStop(0, 'rgba(255,255,255,0.95)'); rad.addColorStop(0.5, hexA(level.palette.accent, 0.8)); rad.addColorStop(1, hexA(level.palette.accent, 0));
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(g.x, g.y, 38, 0, 6.28); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(g.x, g.y, 9 + Math.sin(t * 3) * 1.5, 0, 6.28); ctx.fill();
  }
  function drawWinRings() {  // 到達の光ブルーム＋衝撃波リング（出口から広がる）
    if (winT >= 0.18) {  // 白い光のブルーム（膨らんで消える）
      const bt = winT - 0.18, ba = clamp(1 - bt / 0.45, 0, 1);
      if (ba > 0) {
        const br = 36 + bt * 560;
        const gr = ctx.createRadialGradient(winGX, winGY, 0, winGX, winGY, br);
        gr.addColorStop(0, `rgba(255,255,255,${0.55 * ba})`); gr.addColorStop(0.5, `rgba(255,255,255,${0.16 * ba})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(winGX, winGY, br, 0, 6.28); ctx.fill();
      }
    }
    for (const r of winRings) {
      ctx.globalAlpha = clamp(r.life, 0, 1) * 0.85;
      ctx.strokeStyle = r.white ? '#ffffff' : level.palette.accent; ctx.lineWidth = r.w;
      ctx.beginPath(); ctx.arc(winGX, winGY, r.r, 0, 6.28); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  function drawTrajectory(tr, charge) {
    const hue = lerp(D.trajectory.coldHue, D.trajectory.warmHue, charge);
    for (let i = 0; i < tr.beads.length; i++) { const a = 1 - i / tr.beads.length; ctx.globalAlpha = 0.25 + a * 0.65; ctx.fillStyle = `hsl(${hue},90%,65%)`; ctx.beginPath(); ctx.arc(tr.beads[i].x, tr.beads[i].y, lerp(5, 2, i / tr.beads.length), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (tr.land) { ctx.lineWidth = 3; ctx.strokeStyle = tr.lethal ? D.danger : `hsl(${hue},90%,70%)`; ctx.beginPath(); ctx.arc(tr.land.x, tr.land.y, 15, 0, 6.28); ctx.stroke(); }
  }
  function drawParticles() { for (const p of particles) { ctx.globalAlpha = clamp(p.life, 0, 1) * (p.ghost ? 0.4 : 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.ghost ? 1 : p.life), 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1; }

  function drawBlob(alpha, predicted) {
    const x = lerp(blob.px, blob.x, alpha), y = lerp(blob.py, blob.y, alpha);
    ctx.save(); ctx.translate(x + def.offx, y + def.offy);
    ctx.fillStyle = D.character.shadow; ctx.beginPath(); ctx.ellipse(0, R + 6, R * 0.8, 5, 0, 0, 6.28); ctx.fill();
    const cloaked = cloakT > 0;
    if (cloaked) {  // 隠れ蓑：揺らぐオーラ＋残り時間リング（スケール前＝正円）
      const pul = 0.5 + 0.5 * Math.sin(performance.now() / 90);
      ctx.globalAlpha = 0.22 * pul; ctx.fillStyle = '#cfe9ff'; ctx.beginPath(); ctx.arc(0, 0, R * 1.7, 0, 6.28); ctx.fill();
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#e8f6ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, R + 9, -Math.PI / 2, -Math.PI / 2 + 6.28 * clamp(cloakT / D.cloak.duration, 0, 1)); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.rotate(def.ang); ctx.scale(def.sx, def.sy); ctx.rotate(-def.ang);
    const n = 18, t = performance.now() / 220; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * 6.28, rr = R * (1 + Math.sin(a * 3 + t) * 0.03 + Math.sin(a * 5 - t * 1.3) * 0.02); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath();
    ctx.globalAlpha = cloaked ? 0.5 : 1;
    ctx.fillStyle = level.palette.blob; ctx.shadowColor = level.palette.blob; ctx.shadowBlur = 22; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = hexA(level.palette.blob, 0.5); ctx.stroke();
    ctx.globalAlpha = 1;
    const lookx = clamp(eyes.x, -1, 1), looky = clamp(eyes.y, -1, 1);
    const open = eyes.blink > 0 ? clamp(1 - eyes.blink / Math.max(0.0001, D.eyes.blinkDur), 0.1, 1) : 1;
    const wide = 1 + eyes.wide * 0.5;
    for (const es of [-1, 1]) {
      const ex = es * R * 0.34, ey = -R * 0.04, er = R * 0.4 * wide;
      ctx.fillStyle = D.character.eyeWhite; ctx.beginPath(); ctx.ellipse(ex, ey, er, er * open, 0, 0, 6.28); ctx.fill();
      const pr = er * 0.5, px = ex + lookx * er * D.eyes.pupil, py = ey + looky * er * D.eyes.pupil;
      ctx.fillStyle = D.character.pupil; ctx.beginPath(); ctx.ellipse(px, py, pr, pr * open, 0, 0, 6.28); ctx.fill();
      if (open > 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.28, 0, 6.28); ctx.fill(); }
    }
    ctx.restore();
  }

  // ============ ステージ選択MAP（城を下から頂上へ登る・章ごと／クリアで解放＋保存）============
  let progress = { unlocked: 0, cleared: {} };
  function loadProgress() { try { const s = JSON.parse(localStorage.getItem('nobore_progress')); if (s && typeof s.unlocked === 'number') progress = { unlocked: clamp(s.unlocked | 0, 0, LEVELS.length - 1), cleared: s.cleared || {} }; } catch (e) {} }
  function saveProgress() { try { localStorage.setItem('nobore_progress', JSON.stringify(progress)); } catch (e) {} }

  const MAP_SP = 156, MAP_TOP = 168, MAP_BOT = 150;
  const mapContentH = () => MAP_TOP + (LEVELS.length - 1) * MAP_SP + MAP_BOT;
  const mapNodeVY = (i) => MAP_TOP + (LEVELS.length - 1 - i) * MAP_SP;   // i=0(1-1)を最下部・上ほど高層
  const mapNodeX = (i) => VW / 2 + ((i % 2 === 0) ? -1 : 1) * Math.min(VW * 0.21, 108);
  const mapMaxScroll = () => Math.max(0, mapContentH() - VH);
  let mapScroll = 0, mapScrollV = 0, mapEmbers = [], mapFog = [];
  const mapDrag = { active: false, sx: 0, sy: 0, base: 0, moved: false, last: 0, lastT: 0, vel: 0 };

  function initMapFx() {
    const H = mapContentH();
    mapEmbers = []; for (let i = 0; i < 40; i++) mapEmbers.push({ x: rand(0, VW), y: rand(0, H), s: rand(1.4, 4), vy: rand(-30, -9), ph: rand(0, 6.28) });
    mapFog = []; for (let i = 0; i < 8; i++) mapFog.push({ x: rand(0, VW), y: rand(0, H), w: rand(170, 360), vx: rand(7, 20) * (i % 2 ? 1 : -1), a: rand(0.04, 0.10) });
  }
  function enterMap(focus) {
    const f = clamp((focus == null) ? Math.min(progress.unlocked, LEVELS.length - 1) : focus, 0, LEVELS.length - 1);
    gameState = 'map'; hideOverlays(); setSkin(D.stages[f].palette);
    if (!mapEmbers.length) initMapFx();
    mapScroll = clamp(mapNodeVY(f) - VH * 0.56, 0, mapMaxScroll()); mapScrollV = 0;
  }
  function hideOverlays() { for (const o of ['title', 'clear', 'allclear']) { const e = document.getElementById(o); if (e) e.classList.add('hidden'); } const h = document.getElementById('hud'); if (h) h.classList.add('hidden'); }
  function updateMap(dt) {
    if (!mapDrag.active) { mapScroll = clamp(mapScroll + mapScrollV * dt, 0, mapMaxScroll()); mapScrollV *= Math.pow(0.002, dt); if (Math.abs(mapScrollV) < 3) mapScrollV = 0; }
    for (const e of mapEmbers) { e.y += e.vy * dt; e.ph += dt * 1.6; if (e.y < -12) { e.y = mapContentH() + 12; e.x = rand(0, VW); } }
    for (const f of mapFog) { f.x += f.vx * dt; if (f.x < -f.w) f.x = VW + f.w; if (f.x > VW + f.w) f.x = -f.w; }
  }
  function rrect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function pagoda(cx, vy, w, par, col, alpha) {   // 城（天守）シルエット：3層の屋根
    const y = vy - mapScroll * par; if (y < -260 || y > VH + 120) return;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    for (let t = 0; t < 3; t++) { const tw = w * (1 - t * 0.2), ty = y - t * w * 0.5; ctx.fillRect(cx - tw * 0.32, ty - w * 0.22, tw * 0.64, w * 0.26); ctx.beginPath(); ctx.moveTo(cx - tw / 2, ty - w * 0.18); ctx.lineTo(cx - tw * 0.32, ty - w * 0.42); ctx.lineTo(cx + tw * 0.32, ty - w * 0.42); ctx.lineTo(cx + tw / 2, ty - w * 0.18); ctx.closePath(); ctx.fill(); }
    ctx.restore();
  }
  function drawMap() {
    const g = ctx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, '#0a1126'); g.addColorStop(1, '#05060e'); ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);
    // 月（上空・遅いパララックス）
    const moonY = (MAP_TOP - 96) - mapScroll * 0.32;
    if (moonY > -80 && moonY < VH + 80) { ctx.save(); ctx.fillStyle = '#f3eccf'; ctx.beginPath(); ctx.arc(VW * 0.74, moonY, 44, 0, 6.28); ctx.fill(); ctx.globalAlpha = 1; ctx.fillStyle = '#0a1126'; ctx.beginPath(); ctx.arc(VW * 0.74 + 15, moonY - 8, 40, 0, 6.28); ctx.fill(); ctx.restore(); }
    // 城のシルエット（天守＝最上層、麓＝最下層）
    pagoda(VW * 0.5, mapNodeVY(LEVELS.length - 1) - 30, 150, 0.6, '#0c1430', 0.85);
    pagoda(VW * 0.28, mapNodeVY(0) + 80, 120, 0.6, '#0b0f24', 0.8);
    // 霧
    for (const f of mapFog) { const sy = f.y - mapScroll; if (sy < -120 || sy > VH + 120) continue; ctx.fillStyle = `rgba(180,200,255,${f.a})`; ctx.beginPath(); ctx.ellipse(f.x, sy, f.w, 28, 0, 0, 6.28); ctx.fill(); }
    // 火の粉
    for (const e of mapEmbers) { const sy = e.y - mapScroll; if (sy < -12 || sy > VH + 12) continue; ctx.globalAlpha = 0.18 + 0.32 * (Math.sin(e.ph) + 1) / 2; ctx.fillStyle = '#ffcf6a'; ctx.beginPath(); ctx.arc(e.x, sy, e.s, 0, 6.28); ctx.fill(); } ctx.globalAlpha = 1;
    // 登路（ノード間の点線・クリア済みは灯る）
    ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.setLineDash([2, 13]);
    for (let i = 0; i < LEVELS.length - 1; i++) {
      ctx.strokeStyle = progress.cleared[i] ? 'rgba(255,207,106,0.85)' : 'rgba(255,255,255,0.16)';
      ctx.beginPath(); ctx.moveTo(mapNodeX(i), mapNodeVY(i) - mapScroll); ctx.lineTo(mapNodeX(i + 1), mapNodeVY(i + 1) - mapScroll); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineCap = 'butt';
    // 章バナー＋ノード
    ctx.textAlign = 'center';
    for (let i = 0; i < LEVELS.length; i++) {
      const L = LEVELS[i], x = mapNodeX(i), y = mapNodeVY(i) - mapScroll;
      if (i === 0 || LEVELS[i - 1].world !== L.world) {
        const by = y - MAP_SP * 0.5;
        if (by > -30 && by < VH + 30) { const w = WORLDS[L.world - 1]; ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(20, by, VW - 40, 1.5); ctx.fillStyle = 'rgba(214,228,255,0.55)'; ctx.font = 'bold 13px "Noto Sans JP",sans-serif'; ctx.fillText('第' + w.n + '章  ' + w.name, VW / 2, by + 24); }
      }
      if (y < -70 || y > VH + 70) continue;
      drawMapNode(i, x, y);
    }
    // ヘッダー
    ctx.fillStyle = 'rgba(5,6,14,0.72)'; ctx.fillRect(0, 0, VW, 44);
    ctx.fillStyle = '#9fc4ff'; ctx.font = 'bold 17px "Noto Sans JP",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('のぼれRUIVOSくん', VW / 2, 29);
    ctx.textAlign = 'left';
  }
  function drawMapNode(i, x, y) {
    const L = LEVELS[i], pal = D.stages[i].palette;
    const unlocked = i <= progress.unlocked, cleared = !!progress.cleared[i], current = (i === progress.unlocked);
    if (unlocked) { ctx.save(); ctx.globalAlpha = cleared ? 0.45 : (0.35 + 0.28 * (Math.sin(performance.now() / 280) + 1) / 2); ctx.fillStyle = pal.accent; ctx.beginPath(); ctx.arc(x, y, 42, 0, 6.28); ctx.fill(); ctx.restore(); }
    const r = 27;
    ctx.lineWidth = 3.5; ctx.strokeStyle = unlocked ? pal.accent : 'rgba(255,255,255,0.2)';
    ctx.fillStyle = unlocked ? shade(pal.wall, 1.25) : '#11162a';
    rrect(x - r, y - r, r * 2, r * 2, 11); ctx.fill(); ctx.stroke();
    if (current) { ctx.strokeStyle = pal.accent; ctx.lineWidth = 2; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(performance.now() / 240); rrect(x - r - 5, y - r - 5, r * 2 + 10, r * 2 + 10, 14); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.textAlign = 'center';
    if (!unlocked) {   // 鍵（小さな南京錠）
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y - 3, 7, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.4)'; rrect(x - 9, y - 3, 18, 14, 3); ctx.fill();
    } else {
      ctx.fillStyle = pal.accent; ctx.font = 'bold 20px "Noto Sans JP",sans-serif'; ctx.fillText(L.code, x, y + 7);
      if (cleared) { ctx.strokeStyle = '#ffcf6a'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x + r - 4, y - r - 2); ctx.lineTo(x + r + 3, y - r + 5); ctx.lineTo(x + r + 12, y - r - 8); ctx.stroke(); ctx.lineCap = 'butt'; }
    }
    ctx.fillStyle = unlocked ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)';
    ctx.font = 'bold 13px "Noto Sans JP",sans-serif'; ctx.fillText(L.name, x, y + r + 19);
    ctx.textAlign = 'left';
  }
  function mapTapAt(px, py) {
    for (let i = 0; i < LEVELS.length; i++) {
      const x = mapNodeX(i), y = mapNodeVY(i) - mapScroll;
      if (Math.hypot(px - x, py - y) < 38) { if (i <= progress.unlocked) { ac(); startLevel(i); } else { beep(220, 0.12, 'square', 0.12, 160); } return; }
    }
  }

  // ---- UI ----
  //  ステージのパレットを CSS 変数へ流し込む（UIも同じ3色＝フラットで統一）
  function setSkin(p) {
    const r = document.documentElement.style;
    r.setProperty('--bg', p.bg); r.setProperty('--wall', p.wall);
    r.setProperty('--accent', p.accent); r.setProperty('--blob', p.blob);
    r.setProperty('--danger', D.danger); r.setProperty('--veil', hexA(p.bg, 0.86));
  }
  function show(id) { for (const o of ['title', 'clear', 'allclear']) document.getElementById(o).classList.toggle('hidden', o !== id); document.getElementById('hud').classList.toggle('hidden', id !== 'play'); }
  function updateHUD() {  // ゲーム画面はジャンプ回数だけ（他のステータスは出さない）
    const n = document.getElementById('jumps-n');
    if (n) n.textContent = launches;
    const j = document.getElementById('jumps');
    if (j) j.classList.toggle('low', launches <= RU.lowWarnAt);
  }
  function startGame() { ac(); totalDango = 0; totalTries = 0; if (playlist && playlist.length) startLevel(playlist[0]); else enterMap(); }   // タイトル→（通常）全体MAP／（pack）新ステージへ直行
  function startLevel(i) { gameState = 'play'; loadLevel(i); show('play'); }    // MAP→ステージ開始
  function showAllClear() { gameState = 'allclear'; document.getElementById('allclear-stats').innerHTML = '<div class="stats">' + `<div class="stat-row"><span class="k">あつめた しずく</span><span class="v">${totalDango}</span></div>` + `<div class="stat-row"><span class="k">そう ちょうせん</span><span class="v">${totalTries}</span></div>` + '</div>'; show('allclear'); }
  // タップでも確実に発火させる（スマホで click が合成されない/握りつぶされる対策）。
  //  指のブレ(>12px)はタップ扱いにしない＝スクロール誤爆を防ぐ。touchで発火したら直後の合成clickは無視（二重発火ガード）。
  function bindTap(id, fn) {
    const el = document.getElementById(id); if (!el) return;
    let sx = 0, sy = 0, moved = false, lastTouch = -1e9;
    el.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; sx = t.clientX; sy = t.clientY; moved = false; }, { passive: true });
    el.addEventListener('touchmove', (e) => { const t = e.changedTouches[0]; if (Math.hypot(t.clientX - sx, t.clientY - sy) > 12) moved = true; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (moved) return; e.preventDefault(); lastTouch = performance.now(); fn(el, e); }, { passive: false });
    el.addEventListener('click', (e) => { if (performance.now() - lastTouch < 700) return; fn(el, e); });
  }
  bindTap('btn-start', startGame);
  bindTap('btn-replay', () => { gameState = 'play'; loadLevel(levelIndex); show('play'); });
  bindTap('btn-next', () => {
    if (playlist) {   // 新ステージパック：次の新ステージへ（最後ならクリア画面）
      const pos = playlist.indexOf(levelIndex);
      if (pos >= 0 && pos + 1 < playlist.length) startLevel(playlist[pos + 1]); else showAllClear();
      return;
    }
    if (levelIndex + 1 < LEVELS.length) { enterMap(levelIndex + 1); }   // 全体MAPへ（次が解放された状態で表示）
    else showAllClear();
  });
  bindTap('btn-home', () => { gameState = 'title'; setSkin(D.stages[0].palette); show('title'); });

  // ---- ループ ----
  let lastT = performance.now(), acc = 0; const h = P.fixedStep;
  function frame(now) {
    let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.1) dt = 0.1;
    const toT = timeScaleTarget < timeScale ? D.slowmo.toSlow : D.slowmo.toFast;
    timeScale = lerp(timeScale, timeScaleTarget, 1 - Math.pow(0.001, dt / Math.max(0.0001, toT)));
    if (trauma > 0) trauma = Math.max(0, trauma - dt / D.shake.decay);
    if (flash > 0) flash = Math.max(0, flash - dt / 0.25);
    if (popFlash > 0) popFlash = Math.max(0, popFlash - dt / 0.22);
    if (outMsg > 0) outMsg = Math.max(0, outMsg - dt);
    if (gameState === 'play' && !alive) { deathT -= dt; if (deathT <= 0) spawn(); }
    if (gameState === 'map') updateMap(dt);

    if (gameState === 'play' && winning) { updateWin(dt); }
    else if (gameState === 'play') { acc += dt * timeScale; let guard = 0; while (acc >= h && guard++ < 8) { if (freeze > 0) { freeze--; acc -= h; continue; } stepFixed(h); acc -= h; } }

    let predicted = null;
    if (gameState === 'play' && aim.active) predicted = simTrajectory(...(() => { const a = aimVel(); return [a.vx, a.vy]; })()).land;
    if (level) { updateEyes(dt, predicted); updateSpores(dt); updateTexts(dt); }

    if (level) {
      let camTY = blob.y + clamp(blob.vy * CAM.lookaheadK, -CAM.lookahead, CAM.lookahead);
      if (level.descent && blob.slip) camTY = blob.y + CAM.lookahead * 0.7;   // 滑降中は下を先読み＝スピード感
      camTY = clampCamY(camTY);
      cam.y = smoothDamp(cam.y, camTY, cam.vy, CAM.smoothTime, dt);
      const sp = len(blob.vx, blob.vy);
      cam.zoom = smoothDamp(cam.zoom, lerp(1, CAM.zoomMin, clamp(sp / CAM.zoomSpeedRef, 0, 1)), cam.vz, CAM.zoomSmooth, dt);
    }
    render(clamp(acc / h, 0, 1));
    requestAnimationFrame(frame);
  }
  // URL ?pack=new で「新しく追加した3面だけ」を連続プレイ（タイトル「あそぶ」→ 5-1→6-1→7-1）
  try {
    if (new URLSearchParams(location.search).get('pack') === 'new') {
      playlist = LEVELS.map((l, i) => i).filter(i => ['5-1', '6-1', '7-1'].includes(LEVELS[i].code));
      if (!playlist.length) playlist = null;
      const lead = document.querySelector('#title .lead'); if (lead && playlist) lead.textContent = '新ステージ3面をあそぶ';
    }
  } catch (e) {}
  loadProgress(); initSpores(); requestAnimationFrame(frame);
})();
