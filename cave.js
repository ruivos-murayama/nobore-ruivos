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

    // 上の光る出口（足場＝丸い膨らみ＋その上にゴール）
    const ledgeY = top + 80;
    const ledgeX = clampC(centerX(ledgeY), 150, COL - 150);
    const lr = 52;
    const topLedge = [];
    for (let a = 0; a < 12; a++) { const ang = (a / 12) * Math.PI * 2; topLedge.push({ x: ledgeX + Math.cos(ang) * lr, y: ledgeY + Math.sin(ang) * (lr * 0.7) }); }
    const goal = { x: ledgeX, y: ledgeY - lr * 0.7 - 18 };

    const walls = [leftWall, rightWall, floor, topLedge];

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
      const ex = onLeft ? centerX(yy) - halfGap(yy) + 12 : centerX(yy) + halfGap(yy) - 12;
      const tilt = (rng() < 0.5 ? -1 : 1) * 0.5;          // 上下に傾け、横の逃げ場を残す
      const base = onLeft ? tilt : Math.PI - tilt;        // コリドー内側を向く
      sentries.push({ x: ex, y: yy, base, phase: rng() * 6.28 });
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

    return { walls, hazards, bouncy, boosts, sentries, cloaks, dango, start, goal, worldH: H };
  }

  const CAVE = { buildCave, circlePoly, pointInPoly, mulberry32, segSeg, segPoly };
  if (typeof window !== 'undefined') window.CAVE = CAVE;
  if (typeof module !== 'undefined') module.exports = CAVE;
})(typeof window !== 'undefined' ? window : globalThis);
