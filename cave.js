// ============================================================
//  CAVE — 洞窟ジオメトリの手続き生成＋円×多角形の当たり判定
//  game.js（ブラウザ）と solve.js（Node検証）の両方が同じこれを使う＝挙動が一致。
//  方針：左右に「連続した不規則壁」を必ず置く → 壁づたいに必ず上れる（詰み防止）。
//  さらに 出っ張り(足場) / 有機トゲ(危険) / 下の床 / 上の光る出口 / 雫 / ぷよ。
// ============================================================
(function (root) {
  'use strict';
  const clampC = (v, a, b) => (v < a ? a : v > b ? b : v);

  // 決定論的な乱数（シード固定で毎回同じ洞窟）
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- 当たり判定 ---
  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const t = clampC(((px - ax) * dx + (py - ay) * dy) / len2, 0, 1);
    return { x: ax + dx * t, y: ay + dy * t };
  }
  function pointInPoly(px, py, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
      if (((yi > py) !== (yj > py)) && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-9) + xi)) inside = !inside;
    }
    return inside;
  }
  // 線分AB×線分CD が交差するか（見張りの視線遮蔽に使用）
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    const r1 = bx - ax, r2 = by - ay, s1 = dx - cx, s2 = dy - cy;
    const den = r1 * s2 - r2 * s1;
    if (Math.abs(den) < 1e-9) return false;
    const t = ((cx - ax) * s2 - (cy - ay) * s1) / den;
    const u = ((cx - ax) * r2 - (cy - ay) * r1) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  }
  // 線分AB が多角形 poly の辺と交差するか（視線が壁で遮られる＝物陰に隠れる）
  function segPoly(ax, ay, bx, by, poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (segSeg(ax, ay, bx, by, poly[j].x, poly[j].y, poly[i].x, poly[i].y)) return true;
    }
    return false;
  }

  // 円(cx,cy,R)が多角形(solid)に重なれば押し出し量と法線を返す（creatureは外側にいる前提）
  function circlePoly(cx, cy, R, poly) {
    let best = Infinity, bx = 0, by = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const c = closestOnSeg(cx, cy, poly[j].x, poly[j].y, poly[i].x, poly[i].y);
      const dx = cx - c.x, dy = cy - c.y, d2 = dx * dx + dy * dy;
      if (d2 < best) { best = d2; bx = c.x; by = c.y; }
    }
    const inside = pointInPoly(cx, cy, poly);
    const d = Math.sqrt(best);
    if (!inside && d >= R) return null;
    if (inside) {
      const id = d > 1e-6 ? d : 1e-6;
      return { nx: (bx - cx) / id, ny: (by - cy) / id, pen: R + d };  // 食い込み → 境界外へ
    }
    const od = d > 1e-6 ? d : 1e-6;
    return { nx: (cx - bx) / od, ny: (cy - by) / od, pen: R - d };     // 法線はキャラ側を向く
  }

  // --- 洞窟生成 ---
  function buildCave(p, COL) {
    const rng = mulberry32(p.seed);
    const H = p.worldH, yStep = p.yStep || 80;
    const cx0 = COL / 2;
    const A1 = p.meander != null ? p.meander : 60, F1 = 0.0016 + rng() * 0.001, P1 = rng() * 6.28;
    const A2 = A1 * 0.5, F2 = 0.0035 + rng() * 0.002, P2 = rng() * 6.28;
    const G0 = p.gapBase || 150, GA = p.gapVar || 45, F3 = 0.0022 + rng() * 0.0015, P3 = rng() * 6.28;
    const centerX = (y) => clampC(cx0 + A1 * Math.sin(y * F1 + P1) + A2 * Math.sin(y * F2 + P2), 130, COL - 130);
    const halfGap = (y) => G0 + GA * Math.sin(y * F3 + P3);

    const top = 70, bot = H - 170;
    const leftPts = [], rightPts = [];
    for (let y = top; y <= bot + 1; y += yStep) {
      leftPts.push({ x: centerX(y) - halfGap(y), y });
      rightPts.push({ x: centerX(y) + halfGap(y), y });
    }

    // 出っ張り（足場）：左右交互に内側へ膨らませる
    const nubCount = p.nubCount || 0;
    for (let i = 0; i < nubCount; i++) {
      const yy = top + ((i + 1) / (nubCount + 1)) * (bot - top) + (rng() - 0.5) * yStep;
      const pts = i % 2 === 0 ? leftPts : rightPts;
      const sign = i % 2 === 0 ? +1 : -1;          // 左は+x, 右は-x が内側
      const depth = 38 + rng() * 30;
      let bi = 0, bd = Infinity;
      for (let k = 0; k < pts.length; k++) { const dd = Math.abs(pts[k].y - yy); if (dd < bd) { bd = dd; bi = k; } }
      pts[bi].x += sign * depth;
      if (pts[bi - 1]) pts[bi - 1].x += sign * depth * 0.5;
      if (pts[bi + 1]) pts[bi + 1].x += sign * depth * 0.5;
    }

    // 頂上チャンバー：コリドー上端を左右へ大きく開いて「登りきった先の広間」を作る。
    //  ゴール前に余白を確保（＝狭くて入れないストレスを解消）。外へ膨らませるだけなので登路は途切れない。
    //  紡錘形（中ほどが最も広い）。t=0:上端 → t=1:広間の底。nubで内側に寄ってもmin/maxで必ず開く。
    const chDepth = p.chamberDepth || 300;   // 広間の縦の広がり（top から下へ）
    const chWiden = p.chamberWiden || 130;   // 左右をどれだけ外へ開くか（広さ）
    for (let k = 0; k < leftPts.length; k++) {
      const t = (leftPts[k].y - top) / chDepth;
      if (t < 0 || t > 1) continue;
      const open = Math.sin(t * Math.PI) * chWiden;
      leftPts[k].x  = Math.min(leftPts[k].x,  centerX(leftPts[k].y) - halfGap(leftPts[k].y) - open);
      rightPts[k].x = Math.max(rightPts[k].x, centerX(rightPts[k].y) + halfGap(rightPts[k].y) + open);
      leftPts[k].x  = clampC(leftPts[k].x, 40, COL / 2 - 50);
      rightPts[k].x = clampC(rightPts[k].x, COL / 2 + 50, COL - 40);
    }

    // 壁ポリゴン（左：x=0〜内側エッジ / 右：内側エッジ〜x=COL）
    const leftWall = [{ x: -20, y: top - 60 }];
    for (const pt of leftPts) leftWall.push({ x: pt.x, y: pt.y });
    leftWall.push({ x: -20, y: bot + 60 });
    const rightWall = [{ x: COL + 20, y: top - 60 }];
    for (const pt of rightPts) rightWall.push({ x: pt.x, y: pt.y });
    rightWall.push({ x: COL + 20, y: bot + 60 });

    // 下の床（アーチ状の盛り上がり）
    const floorTop = H - 150;
    const floor = [
      { x: -20, y: floorTop + 30 }, { x: COL * 0.3, y: floorTop + 8 },
      { x: cx0, y: floorTop - 10 }, { x: COL * 0.7, y: floorTop + 8 },
      { x: COL + 20, y: floorTop + 30 }, { x: COL + 20, y: H + 40 }, { x: -20, y: H + 40 },
    ];
    const start = { x: clampC(centerX(floorTop - 60), 150, COL - 150), y: floorTop - 80 };

    // ---- 頂上の出口：天井のくぼみ（チュート）に収めた“スキルショット”ゲート ----
    //  横からのかすめ取りを「リップ」で塞ぎ、中央の開口（ゲート）から下→上へ射し込む必要がある。
    //  ＝「光に触れただけクリア」を解消し、狙って決める達成感に。開口は広め（詰みではなく“狙い”）。
    //  形は下向きに口を開けた凹ポリゴン（∩にスリット）。出口はくぼみの奥にぶら下げる。
    const roomCx = clampC(centerX(top + 70), 175, COL - 175);
    const gateHalf = p.gateHalf || 60;    // ★ゲート開口の半幅（狭いほど難しい。ステージで段階的に絞る）
    const outerHalf = gateHalf + 78;      // くぼみブロックの外半幅（リップの張り出し）
    const cupRoofY = top - 52;            // ブロック上端（天井際）
    const pocketRoofY = top - 2;          // くぼみ内側の天井（出口はこの下にぶら下がる）
    const cupMouthY = top + 104;          // リップ下端＝ゲートの口
    const cupGate = [
      { x: roomCx - outerHalf, y: cupRoofY },
      { x: roomCx + outerHalf, y: cupRoofY },
      { x: roomCx + outerHalf, y: cupMouthY },
      { x: roomCx + gateHalf,  y: cupMouthY },
      { x: roomCx + gateHalf,  y: pocketRoofY },
      { x: roomCx - gateHalf,  y: pocketRoofY },
      { x: roomCx - gateHalf,  y: cupMouthY },
      { x: roomCx - outerHalf, y: cupMouthY },
    ];
    const goal = { x: roomCx, y: top + 20 };   // くぼみの奥（射し込んで届く位置）

    // 最終足場：ゲートの下・片側に置いた踏み台（中央は塞がない）。
    //  「広間に入る→足場で狙いを定める→上向き45°で射し込む」直接ルート用。
    const ledgeSide = (Math.round(roomCx) % 2 === 0) ? -1 : 1;   // 形に応じて左右を振る
    const ledgeCx = clampC(roomCx + ledgeSide * 96, 110, COL - 110);
    const ledgeY = top + 248;
    const lw = 58, lh = 20;
    const topLedge = [
      { x: ledgeCx - lw,        y: ledgeY - lh * 0.4 },
      { x: ledgeCx - lw * 0.55, y: ledgeY - lh },
      { x: ledgeCx + lw * 0.55, y: ledgeY - lh },
      { x: ledgeCx + lw,        y: ledgeY - lh * 0.4 },
      { x: ledgeCx + lw * 0.85, y: ledgeY + lh },
      { x: ledgeCx - lw * 0.85, y: ledgeY + lh },
    ];

    const walls = [leftWall, rightWall, floor, topLedge, cupGate];

    // 有機トゲ（壁から内側へ）：危険
    const hazards = [];
    const hazardCount = p.hazardCount || 0;
    for (let i = 0; i < hazardCount; i++) {
      const yy = top + 220 + rng() * (bot - top - 360);
      const onLeft = rng() < 0.5;
      const ex = onLeft ? centerX(yy) - halfGap(yy) : centerX(yy) + halfGap(yy);
      const depth = (onLeft ? +1 : -1) * (30 + rng() * 16);
      hazards.push([{ x: ex, y: yy - 20 }, { x: ex + depth, y: yy }, { x: ex, y: yy + 20 }]);
    }

    // 雫（収集）：中央付近の空間に
    const dango = [];
    const dangoCount = p.dangoCount || 0;
    for (let i = 0; i < dangoCount; i++) {
      const yy = top + ((i + 1) / (dangoCount + 1)) * (bot - top);
      dango.push({ x: clampC(centerX(yy) + (rng() - 0.5) * 40, 120, COL - 120), y: yy });
    }

    // バンパー（ピンボール式）：中段に“跳ね部屋”としてジグザグ配置（連鎖しやすい）
    const bouncy = [];
    const bouncyCount = p.bouncyCount || 0;
    if (bouncyCount === 1) {
      const yy = top + (bot - top) * 0.5;
      bouncy.push({ x: clampC(centerX(yy), 140, COL - 140), y: yy, r: 30 });
    } else if (bouncyCount > 1) {
      const cyc = top + (bot - top) * 0.55, span = Math.min((bot - top) * 0.42, bouncyCount * 150);
      for (let i = 0; i < bouncyCount; i++) {
        const yy = cyc - span / 2 + (i / (bouncyCount - 1)) * span;
        const off = (i % 2 ? 1 : -1) * Math.min(95, halfGap(yy) * 0.6);
        bouncy.push({ x: clampC(centerX(yy) + off, 120, COL - 120), y: yy, r: 30 });
      }
    }

    // 頂上のバンパー：広間に1つ置き、跳ね返してゲートへ回り込む“バンクショット”ルートを作る。
    //  踏み台の反対側・ゲートの下方に配置（中央の直接射し込みは塞がない）。
    //  bumperMove>0 で左右に往復＝動く的（バンクの読みが要る）。bx=基準x（ソルバはこの静止位置で評価）。
    const sbx = clampC(roomCx - ledgeSide * 96, 100, COL - 100);
    bouncy.push({ x: sbx, bx: sbx, y: top + 176, r: 28, summit: true, move: p.bumperMove || 0, mspeed: 1.5, mphase: rng() * 6.28 });

    // 上昇気流（ブースト帯）：入ると一気に加速する縦の流れ
    const boosts = [];
    const boostCount = p.boostCount || 0;
    for (let i = 0; i < boostCount; i++) {
      const yy = top + 360 + ((i + 0.5) / Math.max(1, boostCount)) * (bot - top - 620);
      const cx = centerX(yy), gw = halfGap(yy) * 1.5;
      boosts.push({ x: cx - gw / 2, y: yy - 150, w: gw, h: 300, dx: 0, dy: -1 });
    }

    // 見張り（固定の目／首振りサーチライト）：壁際に設置しコリドー内側＋上下に傾けて視線を振る。
    //  幾何配置のみ生成（range/half/振れ幅/速さは DESIGN.stealth で実行時に適用＝単一の真実）。
    const sentries = [];
    const sentryCount = p.sentryCount || 0;
    for (let i = 0; i < sentryCount; i++) {
      const yy = top + 340 + ((i + 0.5) / Math.max(1, sentryCount)) * (bot - top - 600);
      const onLeft = (i % 2 === 0);
      // 実際の壁エッジ（nub/広間の拡張を反映した leftPts/rightPts）の最寄り点から内側へ置く。
      //  ※ 元の式は素の centerX±halfGap 基準で、nubの出っ張りに埋まって視線が常時遮られていた（見張りが反応しないバグ）。
      const pts = onLeft ? leftPts : rightPts;
      let bi = 0, bd = Infinity;
      for (let k = 0; k < pts.length; k++) { const dd = Math.abs(pts[k].y - yy); if (dd < bd) { bd = dd; bi = k; } }
      const ex = clampC(onLeft ? pts[bi].x + 18 : pts[bi].x - 18, 28, COL - 28);  // 壁の内側18px・必ず画面内＝埋まらない
      const ey = pts[bi].y;
      const tilt = (rng() < 0.5 ? -1 : 1) * 0.5;          // 上下に傾け、横の逃げ場を残す
      const base = onLeft ? tilt : Math.PI - tilt;        // コリドー内側を向く
      sentries.push({ x: ex, y: ey, base, phase: rng() * 6.28 });
    }

    // 頂上の見張り（ゲート番）：広間の壁際から「ゲート口の少し下」を掃く＝最後の射し込みに見張りの間を読む要素。
    //  踏み台(下)はコーンの外＝狙いは付けられる。首振りの隙/隠れ蓑で突破する。
    const guardCount = p.gateGuard || 0;
    for (let i = 0; i < guardCount; i++) {
      const onLeft = (i % 2 === 0);
      const pts = onLeft ? leftPts : rightPts;
      const gy = top + 150;
      let bi = 0, bd = Infinity;
      for (let k = 0; k < pts.length; k++) { const dd = Math.abs(pts[k].y - gy); if (dd < bd) { bd = dd; bi = k; } }
      const gx = clampC(onLeft ? pts[bi].x + 18 : pts[bi].x - 18, 28, COL - 28);
      const gyy = pts[bi].y;
      const base = Math.atan2((top + 86) - gyy, roomCx - gx);   // ゲート口の手前を向く
      sentries.push({ x: gx, y: gyy, base, phase: rng() * 6.28, guard: true });
    }

    // 頂上の動く致死スパイク：ゲート口の少し下を左右に往復＝通る窓を読む“動く障害”。
    //  振幅は端で必ず広い開口が残る大きさ（＝詰まない／ソルバは無視し、幾何の到達性は別途保証）。
    const movers = [];
    const moverCount = p.gateMover || 0;
    for (let i = 0; i < moverCount; i++) {
      movers.push({ x0: roomCx, y0: cupMouthY + 44 + i * 48, cx: roomCx, cy: cupMouthY + 44 + i * 48,
        ax: 1, ay: 0, amp: gateHalf + 30, speed: 1.5 + i * 0.5, phase: i * 1.9, r: 15 });
    }

    // 隠れ蓑の雫：見張りの少し手前（下）に置き、拾って透明化→視線を突破できるように
    const cloaks = [];
    const cloakCount = p.cloakCount || 0;
    for (let i = 0; i < cloakCount; i++) {
      let yy;
      if (sentries.length) yy = sentries[i % sentries.length].y + 130 + Math.floor(i / sentries.length) * 90;
      else yy = top + ((i + 1) / (cloakCount + 1)) * (bot - top);
      yy = clampC(yy, top + 120, bot - 120);
      cloaks.push({ x: clampC(centerX(yy) + (rng() - 0.5) * 36, 120, COL - 120), y: yy });
    }

    return { walls, hazards, bouncy, boosts, sentries, cloaks, movers, dango, start, goal, worldH: H };
  }

  const CAVE = { buildCave, circlePoly, pointInPoly, mulberry32, segSeg, segPoly };
  if (typeof window !== 'undefined') window.CAVE = CAVE;
  if (typeof module !== 'undefined') module.exports = CAVE;
})(typeof window !== 'undefined' ? window : globalThis);
