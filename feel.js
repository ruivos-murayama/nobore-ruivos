// ============================================================
//  FEEL LAB — 北極星の一瞬「引っぱって→弾けて→着地」だけを最高の操作感で。
//  ・物理は固定 1/120s で更新、描画は補間（端末非依存・全値 px/s）
//  ・離した瞬間に［射出・ストレッチ・SE・触覚・パーティクル］を同フレーム発火
//  ・全ツマミは下の CONFIG に集約（ホットチューニング前提）
//  当たり判定は cave.js の CAVE.circlePoly を流用。
// ============================================================
(() => {
  'use strict';

  // ============================================================
  //  CONFIG — まず弄るべきツマミは ★ 印
  // ============================================================
  const CONFIG = {
    physics: {
      fixedStep: 1 / 120,     // 物理の固定ステップ（基本いじらない）
      gravity: 2600,          // ★ 重力 px/s²。大=ストンと落ちて弧が締まる
      fallClamp: 2200,        // 落下速度の上限 px/s
      airDamping: 0.4,        // 空気抵抗：1秒で速度×0.4 相当（1に近いほど滑る）
      launchMul: 8.5,         // ★ 射出威力：速度 = pull(px) × これ
      maxPull: 140,           // ★ 引っぱり上限px（最大チャージを手で感じる）
      speedMin: 700,          // 射出速度クランプ下限 px/s（小チャージでも“弾ける”）
      speedMax: 1700,         // 射出速度クランプ上限 px/s
      restitution: 0.0,       // 通常面の反発（0=ぴたっと吸着）
      bounceRestitution: 0.72,// バウンド面の反発
      radius: 24,             // 生き物の半径（基準単位）
      launchIgnoreSteps: 7,   // 射出直後に足場判定を無視するステップ数（離脱用）
    },

    slowmo: {                 // タメ演出（狙いを定めさせる）
      chargeScale: 0.35,      // ★ 引っぱり中のタイムスケール
      toSlow: 0.12,           // スローへ入る時間 s
      toFast: 0.07,           // 通常へ戻る時間 s（離した瞬間はキビッと）
    },

    squash: {                 // スクワッシュ＆ストレッチ（バネ駆動・体積ほぼ保存）
      k: 260,                 // ★ バネ剛性（大=速く戻る）
      c: 9,                   // ★ バネ減衰（小=ぷるぷる長く＝オーバーシュート大）
      idleAmp: 0.03, idlePeriod: 2.0,         // 待機の呼吸 1.0↔1.03
      chargeAlong: 0.78, chargePerp: 1.22,    // 引っぱり中：引く軸に潰れ/直交に膨らむ（×チャージ率）
      chargeOffset: 0.45,                     // タメで重心を引いた側へ（×r×チャージ率）
      launchAlong: 1.8, launchPerp: 0.62,     // 射出：進行方向へ強くストレッチ
      flightMax: 0.15,                        // 飛行中の微ストレッチ上限
      landAlong: 0.45,                        // 着地：面法線方向へ強く潰す（→バネで大きくプルン）
    },

    eyes: {
      ease: 0.18,             // 視線の追従なめらかさ
      blinkEvery: [1.4, 4.5], // 瞬き間隔のランダム範囲 s
      blinkDur: 0.09,         // 瞬きの長さ s
      pupil: 0.42,            // 黒目の振れ幅（×白目半径）
    },

    camera: {
      smoothTime: 0.18,       // ★ 追従の遅れ（臨界減衰バネ）
      lookahead: 120,         // 速度方向への先読み px 上限
      lookaheadK: 0.10,       // 先読み量 = vel × これ（上限 lookahead）
      zoomMin: 0.92,          // 高速時のズームアウト
      zoomSpeedRef: 1400,     // この速度でズーム最小
      zoomSmooth: 0.25,       // ズームの追従
    },

    trajectory: {
      steps: 90,              // 予測の最大ステップ（実物理と同一）
      beadEvery: 3,           // 何ステップごとに点を打つか
      coldHue: 190, warmHue: 330, // 弱=寒色→強=暖色
    },

    shake: {                  // trauma 方式：shake = trauma²
      perSpeed: 0.0011,       // 着地速度 × これ を trauma に加算
      max: 1.0, decay: 0.2,   // trauma 減衰時間 s
      maxOffset: 26,          // 最大ゆれ px
      maxRot: 0.05,           // 最大回転 rad
    },

    particles: {
      launchCount: [6, 10],   // 射出の後方コーンの雫数（min,max）
      launchRing: 14,         // 射出リングの粒数
      landDust: 12,           // 着地の粉塵リング
      trailEvery: 0.03,       // 飛行トレイルの間隔 s（高速時）
      trailSpeed: 700,        // この速度超でトレイル
      deathCount: 30,         // 死亡スプラッシュ
    },

    haptics: { launch: 8, land: 16, death: [28, 18, 28] },

    colors: {
      bgTop: '#06202a', bgBot: '#0a3340',
      blob: '#ff4fa3', blobRim: 'rgba(255,160,210,0.5)',
      eyeWhite: '#ffffff', pupil: '#0b1a20',
      safe: '#0e3b44', safeRim: '#2fe6d6',
      lethal: '#c6ff3d', lethalRim: '#eaffb0',
      bounce: '#ffb13d',
      goal: '#ff4fa3',
      spore: 'rgba(120,240,220,0.5)',
      accent: '#2fe6d6',
    },

    world: { w: 720, h: 1480, deathHue: 95 },
  };

  // ============================================================
  //  キャンバス / 高DPI
  // ============================================================
  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  let VW = 0, VH = 0, DPR = 1, baseScale = 1;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    VW = window.innerWidth; VH = window.innerHeight;
    canvas.width = Math.floor(VW * DPR); canvas.height = Math.floor(VH * DPR);
    canvas.style.width = VW + 'px'; canvas.style.height = VH + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    baseScale = VW / CONFIG.world.w;     // 横幅フィット
  }
  window.addEventListener('resize', resize); resize();

  // ============================================================
  //  ユーティリティ / イージング
  // ============================================================
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const len = (x, y) => Math.hypot(x, y);
  // 採用イージング：
  //  ・カメラ/ズーム = SmoothDamp（臨界減衰バネ。ガクつかない遅延追従）
  //  ・スクワッシュ = 2階バネ（k,c）＝ ease-out-back 的オーバーシュート
  //  ・スロー復帰 = 指数イージング（exp）
  function smoothDamp(cur, target, vel, smoothTime, dt) {
    const omega = 2 / smoothTime, x = omega * dt;
    const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    let change = cur - target;
    const temp = (vel.v + omega * change) * dt;
    vel.v = (vel.v - omega * temp) * exp;
    return target + (change + temp) * exp;
  }

  // ============================================================
  //  シーン（最小：足場/壁/天井・バウンド・致死液・出口）
  // ============================================================
  const W = CONFIG.world.w, H = CONFIG.world.h;
  function blob(cx, cy, rx, ry, n) {        // 有機的な多角形（足場づくり）
    const pts = []; n = n || 12;
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
    return pts;
  }
  const scene = {
    safe: [
      blob(180, 1180, 150, 70, 14),                 // スタート足場
      blob(560, 980, 70, 150, 14),                  // 右の壁
      blob(360, 360, 150, 60, 14),                  // 天井ぎみの足場
      blob(150, 720, 80, 70, 12),                   // 中継の小島
    ],
    bouncy: [blob(470, 720, 46, 46, 14)],           // バウンド面（ぷよ）
    lethal: [
      [{ x: -40, y: 1340 }, { x: W + 40, y: 1340 }, { x: W + 40, y: H + 60 }, { x: -40, y: H + 60 }], // 底の致死液
    ],
    goal: { x: 360, y: 250, r: 30 },
    start: { x: 180, y: 1180 - 70 - CONFIG.physics.radius + 2, nx: 0, ny: -1 },
  };

  // ============================================================
  //  状態
  // ============================================================
  const R = CONFIG.physics.radius;
  const blobS = { x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, stuck: true, nx: 0, ny: -1, ignoreT: 0 };
  const def = { ang: 0, sx: 1, sy: 1, vsx: 0, vsy: 0, offx: 0, offy: 0 }; // スクワッシュ
  const eyes = { x: 1, y: 0, blink: 0, blinkTimer: 2, wide: 0 };
  const cam = { x: W / 2, y: 0, vx: { v: 0 }, vy: { v: 0 }, zoom: 1, vz: { v: 0 } };
  let trauma = 0, flash = 0, timeScale = 1, timeScaleTarget = 1;
  let particles = [], spores = [], trail = 0;
  let alive = true, deathT = 0, won = false, winT = 0;
  let running = false;
  const aim = { active: false, sx: 0, sy: 0, cx: 0, cy: 0 };

  // ============================================================
  //  音（WebAudio）
  // ============================================================
  let actx = null, chargeOsc = null, chargeGain = null;
  function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
  function beep(f, d, type = 'sine', vol = 0.18, slideTo = 0) {
    try { const a = ac(), o = a.createOscillator(), g = a.createGain(); o.type = type;
      o.frequency.setValueAtTime(f, a.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), a.currentTime + d);
      g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + d);
      o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + d);
    } catch (e) {}
  }
  function startCharge() {
    try { const a = ac(); chargeOsc = a.createOscillator(); chargeGain = a.createGain();
      chargeOsc.type = 'sawtooth'; chargeOsc.frequency.value = 180; chargeGain.gain.value = 0.06;
      chargeOsc.connect(chargeGain).connect(a.destination); chargeOsc.start();
    } catch (e) {}
  }
  function updateCharge(p) { try { if (chargeOsc) chargeOsc.frequency.setTargetAtTime(180 + p * 520, ac().currentTime, 0.02); } catch (e) {} }
  function stopCharge() { try { if (chargeOsc) { chargeGain.gain.setTargetAtTime(0.0001, ac().currentTime, 0.03); chargeOsc.stop(ac().currentTime + 0.1); chargeOsc = null; } } catch (e) {} }
  const sfx = {
    launch: (p) => beep(420 + p * 260, 0.16, 'triangle', 0.22, 180),  // 濡れたポン
    land: (p) => { beep(520 + p * 300, 0.05, 'square', 0.10 + p * 0.08); beep(150, 0.18, 'sine', 0.14 + p * 0.12, 70); },
    bounce: () => beep(300, 0.18, 'sine', 0.2, 720),
    death: () => beep(160, 0.35, 'sawtooth', 0.25, 50),
    win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, 0.18, 'triangle', 0.18), i * 90)),
  };
  function vibe(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // ============================================================
  //  リセット
  // ============================================================
  function respawn() {
    blobS.x = scene.start.x; blobS.y = scene.start.y; blobS.px = blobS.x; blobS.py = blobS.y;
    blobS.vx = 0; blobS.vy = 0; blobS.stuck = true; blobS.nx = scene.start.nx; blobS.ny = scene.start.ny; blobS.ignoreT = 0;
    def.ang = 0; def.sx = 1; def.sy = 1; def.vsx = 0; def.vsy = 0; def.offx = 0; def.offy = 0;
    eyes.wide = 0;
    cam.y = blobS.y; cam.vy.v = 0; cam.zoom = 1;
    alive = true; won = false; aim.active = false; timeScale = 1; timeScaleTarget = 1;
  }
  function initSpores() { spores = []; for (let i = 0; i < 30; i++) spores.push({ x: rand(0, W), y: rand(0, H), s: rand(2, 5), vy: rand(-30, -12), ph: rand(0, 6.28) }); }

  // ============================================================
  //  射出ベクトル（実物理と同一の計算）
  // ============================================================
  function aimVel() {
    const dx = aim.sx - aim.cx, dy = aim.sy - aim.cy;  // 引いた逆へ飛ぶ
    const d = len(dx, dy);
    if (d < 0.0001) return { vx: 0, vy: 0, speed: 0, charge: 0, pull: 0 };
    const pull = Math.min(d / baseScale, CONFIG.physics.maxPull);  // 画面px→ワールドpx
    const speed = clamp(pull * CONFIG.physics.launchMul, CONFIG.physics.speedMin, CONFIG.physics.speedMax);
    const charge = pull / CONFIG.physics.maxPull;
    return { vx: (dx / d) * speed, vy: (dy / d) * speed, speed, charge, pull };
  }

  // 予測軌道＋着地点（実物理シミュ）
  function simTrajectory(vx, vy) {
    const h = CONFIG.physics.fixedStep, g = CONFIG.physics.gravity, dmp = Math.pow(CONFIG.physics.airDamping, h);
    let x = blobS.x, y = blobS.y, ign = CONFIG.physics.launchIgnoreSteps;
    const beads = []; let land = null, lethal = false;
    for (let i = 0; i < CONFIG.trajectory.steps; i++) {
      vy += g * h; vx *= dmp; vy *= dmp; if (vy > CONFIG.physics.fallClamp) vy = CONFIG.physics.fallClamp;
      x += vx * h; y += vy * h; if (ign > 0) ign--;
      if (i % CONFIG.trajectory.beadEvery === 0) beads.push({ x, y });
      for (const poly of scene.lethal) if (CAVE.circlePoly(x, y, R, poly)) { land = { x, y }; lethal = true; break; }
      if (land) break;
      if (ign <= 0) { for (const poly of scene.safe) if (CAVE.circlePoly(x, y, R, poly)) { land = { x, y }; break; } }
      if (land) break;
      for (const poly of scene.bouncy) if (CAVE.circlePoly(x, y, R, poly)) { land = { x, y }; break; }
      if (land || y > H + 200) break;
    }
    return { beads, land, lethal };
  }

  // ============================================================
  //  物理（固定ステップ）
  // ============================================================
  function stepFixed(h) {
    blobS.px = blobS.x; blobS.py = blobS.y;

    if (!alive) { updateSquash(h); ageParticles(h); return; }
    if (won) { updateSquash(h); ageParticles(h); return; }

    if (!blobS.stuck) {
      blobS.vy += CONFIG.physics.gravity * h;
      const dmp = Math.pow(CONFIG.physics.airDamping, h);
      blobS.vx *= dmp; blobS.vy *= dmp;
      if (blobS.vy > CONFIG.physics.fallClamp) blobS.vy = CONFIG.physics.fallClamp;
      blobS.x += blobS.vx * h; blobS.y += blobS.vy * h;
      if (blobS.ignoreT > 0) blobS.ignoreT--;

      // 致死
      for (const poly of scene.lethal) if (CAVE.circlePoly(blobS.x, blobS.y, R, poly)) { die(); return; }
      if (blobS.y > H + 250) { die(); return; }
      // ゴール
      if (len(blobS.x - scene.goal.x, blobS.y - scene.goal.y) < R + scene.goal.r) { win(); return; }
      // バウンド
      for (const poly of scene.bouncy) {
        const c = CAVE.circlePoly(blobS.x, blobS.y, R, poly);
        if (c) {
          blobS.x += c.nx * c.pen; blobS.y += c.ny * c.pen;
          const vn = blobS.vx * c.nx + blobS.vy * c.ny;
          const e = CONFIG.physics.bounceRestitution;
          blobS.vx -= (1 + e) * vn * c.nx; blobS.vy -= (1 + e) * vn * c.ny;
          impulseSquash(Math.atan2(c.ny, c.nx), 0.7, 1.0);
          sfx.bounce(); burstRing(blobS.x, blobS.y, CONFIG.colors.bounce, 10);
          addTrauma(0.18);
        }
      }
      // 足場（吸着）
      if (blobS.ignoreT <= 0) {
        for (const poly of scene.safe) { const c = CAVE.circlePoly(blobS.x, blobS.y, R, poly); if (c) { land(c); break; } }
      }
    }
    updateSquash(h); ageParticles(h); flightTrail(h);
  }

  function land(c) {
    const speed = len(blobS.vx, blobS.vy);
    blobS.x += c.nx * c.pen; blobS.y += c.ny * c.pen;
    blobS.vx = 0; blobS.vy = 0; blobS.stuck = true; blobS.nx = c.nx; blobS.ny = c.ny;
    const p = clamp(speed / CONFIG.physics.speedMax, 0, 1);
    impulseSquash(Math.atan2(c.ny, c.nx), CONFIG.squash.landAlong, 1 / CONFIG.squash.landAlong); // 法線へ潰す→プルン
    addTrauma(speed * CONFIG.shake.perSpeed);
    const cxp = blobS.x - c.nx * R, cyp = blobS.y - c.ny * R;
    splat(cxp, cyp, c.nx, c.ny, Math.round(6 + p * CONFIG.particles.landDust), CONFIG.colors.accent);
    burstRing(cxp, cyp, CONFIG.colors.accent, CONFIG.particles.landDust);
    sfx.land(p); vibe(CONFIG.haptics.land);
  }

  function die() {
    alive = false; deathT = 0.35; flash = 1; eyes.wide = 1;
    addTrauma(0.7);
    for (let i = 0; i < CONFIG.particles.deathCount; i++) {
      const a = rand(0, 6.28), s = rand(60, 360);
      particles.push({ x: blobS.x, y: blobS.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: i % 2 ? CONFIG.colors.lethal : CONFIG.colors.blob, size: rand(4, 9) });
    }
    sfx.death(); vibe(CONFIG.haptics.death);
  }
  function win() { won = true; winT = 0.7; sfx.win(); burstRing(scene.goal.x, scene.goal.y, CONFIG.colors.goal, 30); }

  // ============================================================
  //  スクワッシュ（2階バネ＝ease-out-back）
  // ============================================================
  function impulseSquash(ang, along, perp) { def.ang = ang; def.sx = along; def.sy = perp; def.vsx = 0; def.vsy = 0; }
  function updateSquash(h) {
    const S = CONFIG.squash;
    let tx = 1, ty = 1, toffx = 0, toffy = 0;
    if (blobS.stuck && aim.active) {
      const a = aimVel(); def.ang = Math.atan2(a.vy, a.vx);
      tx = lerp(1, S.chargeAlong, a.charge); ty = lerp(1, S.chargePerp, a.charge);
      toffx = -Math.cos(def.ang) * S.chargeOffset * R * a.charge;   // 引いた側へ重心
      toffy = -Math.sin(def.ang) * S.chargeOffset * R * a.charge;
    } else if (!blobS.stuck) {
      const sp = len(blobS.vx, blobS.vy);
      if (sp > 1) def.ang = Math.atan2(blobS.vy, blobS.vx);
      const st = clamp(sp / CONFIG.physics.speedMax, 0, 1) * S.flightMax;
      tx = 1 + st; ty = 1 - st * 0.7;
    } else {
      const br = 1 + Math.sin(performance.now() / 1000 / S.idlePeriod * Math.PI * 2) * S.idleAmp;
      tx = br; ty = 2 - br; def.ang = Math.atan2(blobS.ny, blobS.nx) + Math.PI / 2;
    }
    // バネ積分
    const ax = -S.k * (def.sx - tx) - S.c * def.vsx;
    const ay = -S.k * (def.sy - ty) - S.c * def.vsy;
    def.vsx += ax * h; def.vsy += ay * h;
    def.sx += def.vsx * h; def.sy += def.vsy * h;
    def.offx = lerp(def.offx, toffx, 1 - Math.pow(0.001, h));
    def.offy = lerp(def.offy, toffy, 1 - Math.pow(0.001, h));
  }

  // ============================================================
  //  目玉
  // ============================================================
  function updateEyes(dt, predicted) {
    let tx = eyes.x, ty = eyes.y;
    if (aim.active && predicted) { const dx = predicted.x - blobS.x, dy = predicted.y - blobS.y, d = len(dx, dy) || 1; tx = dx / d; ty = dy / d; }
    else if (!blobS.stuck) { const d = len(blobS.vx, blobS.vy); if (d > 1) { tx = blobS.vx / d; ty = blobS.vy / d; } }
    else { const t = performance.now() / 700; tx = blobS.nx * 0.5 + Math.sin(t) * 0.35; ty = blobS.ny * 0.5 + Math.cos(t * 0.8) * 0.25; }
    eyes.x = lerp(eyes.x, tx, CONFIG.eyes.ease); eyes.y = lerp(eyes.y, ty, CONFIG.eyes.ease);
    eyes.wide = lerp(eyes.wide, 0, 0.1);
    // 瞬き
    eyes.blinkTimer -= dt;
    if (eyes.blink > 0) eyes.blink -= dt;
    else if (eyes.blinkTimer <= 0 && blobS.stuck && !aim.active) { eyes.blink = CONFIG.eyes.blinkDur; eyes.blinkTimer = rand(CONFIG.eyes.blinkEvery[0], CONFIG.eyes.blinkEvery[1]); }
  }

  // ============================================================
  //  パーティクル / シェイク
  // ============================================================
  function burstRing(x, y, color, n) { for (let i = 0; i < n; i++) { const a = (i / n) * 6.28; const s = rand(120, 260); particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, size: rand(3, 6) }); } }
  function splat(x, y, nx, ny, n, color) { const tx = -ny, ty = nx; for (let i = 0; i < n; i++) { const dir = Math.random() < 0.5 ? 1 : -1, s = rand(80, 300), sp = rand(0.1, 0.5); particles.push({ x, y, vx: (tx * dir + nx * sp) * s, vy: (ty * dir + ny * sp) * s, life: 1, color, size: rand(2.5, 5) }); } }
  function launchParticles(vx, vy, charge) {
    const d = len(vx, vy) || 1, dx = vx / d, dy = vy / d;
    const n = Math.round(lerp(CONFIG.particles.launchCount[0], CONFIG.particles.launchCount[1], charge));
    for (let i = 0; i < n; i++) { const spread = rand(-0.5, 0.5); const a = Math.atan2(-dy, -dx) + spread; const s = rand(150, 380); particles.push({ x: blobS.x, y: blobS.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color: CONFIG.colors.blob, size: rand(3, 7) }); }
    burstRing(blobS.x, blobS.y, CONFIG.colors.accent, CONFIG.particles.launchRing);
  }
  function ageParticles(h) { for (const p of particles) { p.vy += 900 * h; p.x += p.vx * h; p.y += p.vy * h; p.vx *= Math.pow(0.2, h); p.life -= h / 0.5; } particles = particles.filter(p => p.life > 0); }
  function flightTrail(h) {
    if (blobS.stuck) return;
    if (len(blobS.vx, blobS.vy) < CONFIG.particles.trailSpeed) return;
    trail += h; if (trail >= CONFIG.particles.trailEvery) { trail = 0; particles.push({ x: blobS.x, y: blobS.y, vx: 0, vy: 0, life: 1, color: CONFIG.colors.blobRim, size: R * 0.8, ghost: true }); }
  }
  function addTrauma(t) { trauma = clamp(trauma + t, 0, CONFIG.shake.max); }

  // ============================================================
  //  入力（同フレーム発火）
  // ============================================================
  function ptr(e) { const t = e.touches ? e.touches[0] : e; return { x: t.clientX, y: t.clientY }; }
  function onDown(e) {
    if (!running || !alive || won) return; e.preventDefault();
    if (!blobS.stuck) return;
    const p = ptr(e); aim.active = true; aim.sx = p.x; aim.sy = p.y; aim.cx = p.x; aim.cy = p.y;
    timeScaleTarget = CONFIG.slowmo.chargeScale;   // 引っぱり中の音はなし
  }
  function onMove(e) { if (!aim.active) return; e.preventDefault(); const p = ptr(e); aim.cx = p.x; aim.cy = p.y; }
  function onUp(e) {
    if (!aim.active) return; e.preventDefault();
    aim.active = false; timeScaleTarget = 1;
    const a = aimVel();
    if (a.pull < 6) return; // 弱すぎ＝キャンセル
    // ── 同フレーム発火：射出物理・ストレッチ・SE・触覚・パーティクル ──
    blobS.stuck = false; blobS.vx = a.vx; blobS.vy = a.vy; blobS.ignoreT = CONFIG.physics.launchIgnoreSteps;
    impulseSquash(Math.atan2(a.vy, a.vx), CONFIG.squash.launchAlong, CONFIG.squash.launchPerp);
    launchParticles(a.vx, a.vy, a.charge);
    sfx.launch(a.charge); vibe(CONFIG.haptics.launch);
  }
  canvas.addEventListener('mousedown', onDown); window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
  canvas.addEventListener('touchstart', onDown, { passive: false }); canvas.addEventListener('touchmove', onMove, { passive: false }); canvas.addEventListener('touchend', onUp, { passive: false });

  // ============================================================
  //  描画
  // ============================================================
  function worldToCam() {
    const z = baseScale * cam.zoom;
    const shx = (Math.random() - 0.5) * 2 * CONFIG.shake.maxOffset * (trauma * trauma);
    const shy = (Math.random() - 0.5) * 2 * CONFIG.shake.maxOffset * (trauma * trauma);
    const rot = (Math.random() - 0.5) * 2 * CONFIG.shake.maxRot * (trauma * trauma);
    ctx.translate(VW / 2, VH / 2); ctx.rotate(rot); ctx.scale(z, z); ctx.translate(-cam.x, -cam.y); ctx.translate(shx / z, shy / z);
  }
  function poly(p) { ctx.beginPath(); for (let i = 0; i < p.length; i++) { if (i === 0) ctx.moveTo(p[i].x, p[i].y); else ctx.lineTo(p[i].x, p[i].y); } ctx.closePath(); }

  function render(alpha) {
    // 背景（パララックス）
    const g = ctx.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, CONFIG.colors.bgTop); g.addColorStop(1, CONFIG.colors.bgBot);
    ctx.fillStyle = g; ctx.fillRect(0, 0, VW, VH);

    ctx.save(); worldToCam();

    // 胞子
    ctx.fillStyle = CONFIG.colors.spore;
    for (const s of spores) { ctx.globalAlpha = 0.2 + 0.3 * (Math.sin(s.ph) + 1) / 2; ctx.beginPath(); ctx.arc(s.x, s.y, s.s, 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    // 致死液
    for (const p of scene.lethal) { poly(p); ctx.fillStyle = CONFIG.colors.lethal; ctx.globalAlpha = 0.9; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 4; ctx.strokeStyle = CONFIG.colors.lethalRim; ctx.stroke(); }
    // 足場
    for (const p of scene.safe) { poly(p); ctx.fillStyle = CONFIG.colors.safe; ctx.fill(); ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.strokeStyle = CONFIG.colors.safeRim; ctx.stroke(); }
    // バウンド
    for (const p of scene.bouncy) { const pu = 1 + Math.sin(performance.now() / 250) * 0.08; ctx.save(); const cx = avg(p, 'x'), cy = avg(p, 'y'); ctx.translate(cx, cy); ctx.scale(pu, 1 / pu); ctx.translate(-cx, -cy); poly(p); ctx.fillStyle = CONFIG.colors.bounce; ctx.fill(); ctx.restore(); }

    // ゴール（光の出口）
    drawGoal();

    // 予測軌道（実物理）
    let predicted = null;
    if (aim.active) { const a = aimVel(); const tr = simTrajectory(a.vx, a.vy); predicted = tr.land; drawTrajectory(tr, a.charge); }

    // パーティクル
    for (const p of particles) { ctx.globalAlpha = clamp(p.life, 0, 1) * (p.ghost ? 0.4 : 1); ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.ghost ? 1 : p.life), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;

    // 生き物
    if (alive) drawBlob(alpha, predicted);

    ctx.restore();

    if (flash > 0) { ctx.fillStyle = `hsla(${CONFIG.world.deathHue},100%,60%,${flash * 0.5})`; ctx.fillRect(0, 0, VW, VH); }
  }
  function avg(p, k) { let s = 0; for (const q of p) s += q[k]; return s / p.length; }

  function drawGoal() {
    const gg = scene.goal, t = performance.now() / 500;
    for (let i = 0; i < 3; i++) { const ph = (t + i / 3) % 1; ctx.globalAlpha = (1 - ph) * 0.4; ctx.strokeStyle = CONFIG.colors.goal; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gg.x, gg.y, gg.r * 0.6 + ph * 40, 0, 6.28); ctx.stroke(); }
    ctx.globalAlpha = 1;
    const rad = ctx.createRadialGradient(gg.x, gg.y, 2, gg.x, gg.y, gg.r + 10);
    rad.addColorStop(0, 'rgba(255,255,255,0.95)'); rad.addColorStop(0.5, hexA(CONFIG.colors.goal, 0.8)); rad.addColorStop(1, hexA(CONFIG.colors.goal, 0));
    ctx.fillStyle = rad; ctx.beginPath(); ctx.arc(gg.x, gg.y, gg.r + 10, 0, 6.28); ctx.fill();
  }

  function drawTrajectory(tr, charge) {
    const hue = lerp(CONFIG.trajectory.coldHue, CONFIG.trajectory.warmHue, charge);
    for (let i = 0; i < tr.beads.length; i++) { const a = 1 - i / tr.beads.length; ctx.globalAlpha = 0.25 + a * 0.65; ctx.fillStyle = `hsl(${hue},90%,65%)`; ctx.beginPath(); ctx.arc(tr.beads[i].x, tr.beads[i].y, lerp(5, 2, i / tr.beads.length), 0, 6.28); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (tr.land) { ctx.lineWidth = 3; ctx.strokeStyle = tr.lethal ? CONFIG.colors.lethal : `hsl(${hue},90%,70%)`; ctx.beginPath(); ctx.arc(tr.land.x, tr.land.y, 16, 0, 6.28); ctx.stroke(); }
  }

  function drawBlob(alpha, predicted) {
    const x = lerp(blobS.px, blobS.x, alpha), y = lerp(blobS.py, blobS.y, alpha);
    ctx.save(); ctx.translate(x + def.offx, y + def.offy);
    // 影
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.beginPath(); ctx.ellipse(0, R + 6, R * 0.8, 5, 0, 0, 6.28); ctx.fill();
    ctx.rotate(def.ang); ctx.scale(def.sx, def.sy); ctx.rotate(-def.ang);
    // ぷるぷる輪郭（頂点ジグル）
    const n = 18, t = performance.now() / 220; ctx.beginPath();
    for (let i = 0; i <= n; i++) { const a = (i / n) * 6.28; const rr = R * (1 + Math.sin(a * 3 + t) * 0.03 + Math.sin(a * 5 - t * 1.3) * 0.02); const px = Math.cos(a) * rr, py = Math.sin(a) * rr; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
    ctx.closePath();
    ctx.fillStyle = CONFIG.colors.blob; ctx.shadowColor = CONFIG.colors.blob; ctx.shadowBlur = 24; ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = CONFIG.colors.blobRim; ctx.stroke();
    // 目
    const lookx = clamp(eyes.x, -1, 1), looky = clamp(eyes.y, -1, 1);
    const eo = 1 - eyes.blink / Math.max(0.0001, CONFIG.eyes.blinkDur);  // 0=閉, 1=開
    const open = eyes.blink > 0 ? clamp(eo, 0.1, 1) : 1;
    const wide = 1 + eyes.wide * 0.5;
    for (const es of [-1, 1]) {
      const ex = es * R * 0.34, ey = -R * 0.04, er = R * 0.4 * wide;
      ctx.fillStyle = CONFIG.colors.eyeWhite; ctx.beginPath(); ctx.ellipse(ex, ey, er, er * open, 0, 0, 6.28); ctx.fill();
      const pr = er * 0.5; const px = ex + lookx * er * CONFIG.eyes.pupil, py = ey + looky * er * CONFIG.eyes.pupil;
      ctx.fillStyle = CONFIG.colors.pupil; ctx.beginPath(); ctx.ellipse(px, py, pr, pr * open, 0, 0, 6.28); ctx.fill();
      if (open > 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(px - pr * 0.35, py - pr * 0.4, pr * 0.28, 0, 6.28); ctx.fill(); }
    }
    ctx.restore();
  }

  function hexA(hex, a) { let h = hex.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h, 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }

  // ============================================================
  //  メインループ（realDt：カメラ/スロー/trauma、固定step：物理）
  // ============================================================
  let lastT = performance.now(), acc = 0;
  const h = CONFIG.physics.fixedStep;
  function frame(now) {
    let dt = (now - lastT) / 1000; lastT = now; if (dt > 0.1) dt = 0.1;

    // スロー（実時間で補間）
    const toT = timeScaleTarget < timeScale ? CONFIG.slowmo.toSlow : CONFIG.slowmo.toFast;
    timeScale = lerp(timeScale, timeScaleTarget, 1 - Math.pow(0.001, dt / Math.max(0.0001, toT)));

    // trauma / flash（実時間）
    if (trauma > 0) trauma = Math.max(0, trauma - dt / CONFIG.shake.decay);
    if (flash > 0) flash = Math.max(0, flash - dt / 0.25);

    // 死亡→即リスタート
    if (!alive) { deathT -= dt; if (deathT <= 0) respawn(); }
    if (won) { winT -= dt; if (winT <= 0) respawn(); }

    // 物理（スローを反映した時間を蓄積）
    if (running) { acc += dt * timeScale; let guard = 0; while (acc >= h && guard++ < 8) { stepFixed(h); acc -= h; } }

    // 目（予測は描画前に必要なので軽く先取り）
    let predicted = null;
    if (aim.active) { const a = aimVel(); predicted = simTrajectory(a.vx, a.vy).land; }
    updateEyes(dt, predicted);
    updateSpores(dt);

    // カメラ（実時間・SmoothDamp）
    const interpY = blobS.y;
    let camTY = interpY + clamp(blobS.vy * CONFIG.camera.lookaheadK, -CONFIG.camera.lookahead, CONFIG.camera.lookahead);
    camTY = clamp(camTY, VH / (2 * baseScale * cam.zoom), H - VH / (2 * baseScale * cam.zoom));
    cam.y = smoothDamp(cam.y, camTY, cam.vy, CONFIG.camera.smoothTime, dt);
    cam.x = W / 2;
    const speed = len(blobS.vx, blobS.vy);
    const zTarget = lerp(1, CONFIG.camera.zoomMin, clamp(speed / CONFIG.camera.zoomSpeedRef, 0, 1));
    cam.zoom = smoothDamp(cam.zoom, zTarget, cam.vz, CONFIG.camera.zoomSmooth, dt);

    render(clamp(acc / h, 0, 1));

    // デバッグHUD
    if (running) { const a = aim.active ? aimVel() : null; dbg.textContent = `v:${Math.round(speed)} ts:${timeScale.toFixed(2)}${a ? ' chg:' + (a.charge * 100 | 0) + '%' : ''}`; }
    requestAnimationFrame(frame);
  }
  function updateSpores(dt) { for (const s of spores) { s.ph += dt * 1.5; s.y += s.vy * dt; if (s.y < -10) { s.y = H + 10; s.x = rand(0, W); } } }

  const dbg = document.getElementById('dbg');
  document.getElementById('go').addEventListener('click', () => { ac(); running = true; respawn(); document.getElementById('tap').style.display = 'none'; });

  initSpores(); respawn();
  requestAnimationFrame(frame);
})();
