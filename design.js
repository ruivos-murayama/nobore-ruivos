// ============================================================
//  DESIGN — のぼれRUIVOSくん デザインシステム（単一の真実の置き場）
//  feel.html で詰めた「引っぱって→弾けて→着地」の手触りを本編に統合。
//  物理は px/s（固定120Hz＋描画補間）。全ツマミここ。★=まず弄る。
//  ※ UI（タイトル/ボタン/HUD）は style.css の :root。
// ============================================================
const DESIGN = {

  layout: { columnWidth: 480, maxZoom: 1.6 },

  // ---- 物理（px/s）----
  physics: {
    fixedStep: 1 / 120,
    gravity: 2600,          // ★ 重力 px/s²
    fallClamp: 2200,        // 落下速度上限
    airDamping: 0.4,        // 1秒で速度×0.4 相当
    launchMul: 8.5,         // ★ 射出威力：速度 = pull(px) × これ
    maxPull: 140,           // ★ 引っぱり上限px
    speedMin: 700, speedMax: 1700,  // 射出速度クランプ
    bounceRestitution: 0.72,
    radius: 24,
    launchIgnoreSteps: 7,   // 射出直後に壁判定を無視するステップ数
    goalRadius: 30,         // 出口の判定半径（くぼみゲートに射し込む“狙い”の手応え用に絞り気味）
  },

  // ---- 貼り付き面からの発射制約 ----
  //  くっついた面の法線まわり ±maxOffNormal の範囲しか撃てない（壁に沿う/壁へ向かう入力は縁へ折り曲げ）。
  //  → 壁沿いの“垂直よじ登り”を封じ、必ず宙へ飛び出してアーチで渡る操作にする。
  stick: { maxOffNormal: 1.0 },   // ★ 発射できる最大角(rad ≒57°)。小さいほど真上登りが効かない

  slowmo: { chargeScale: 0.35, toSlow: 0.12, toFast: 0.07 },  // タメ演出

  // ---- ギミック（“弾く快感”の増幅装置）----
  gimmick: {
    bumperRestitution: 0.95, // ★ バンパーの反発（高いほどよく跳ねる）
    bumperMinOut: 900,       // バンパー後の最低速度（必ず気持ちよく弾く）
    boostAccel: 5600,        // ★ 上昇気流の加速 px/s²
    boostMaxSpeed: 2300,     // 気流での速度上限
    bumperChainPitch: 150,   // ★ 連続ヒットで上がる音程の刻み
  },
  combo: { base: 720, pitchStep: 90 },  // コンボ雫：連続回収で音程上昇

  // ---- ステルス（見張りに見つからず最上階へ）----
  //  固定の“見張りの目”が首を振る。視線（コーン）に入ると発見メーターが溜まり、満タンで負け。
  //  視線は壁で遮られる＝物陰に隠れられる。sweepAmp≥halfAngle で必ず安全な隙ができる（詰み防止）。
  stealth: {
    range: 320,          // ★ 視線の届く距離 px
    halfAngle: 0.42,     // ★ コーンの半角 rad（約24°）
    sweepAmp: 0.62,      // ★ 首振りの振れ幅 rad（halfAngle以上＝安全な隙が必ずできる）
    sweepSpeed: 1.1,     // 首振りの速さ rad/s
    fillTime: 0.7,       // ★ 視線に入って捕まるまで（メーター満タン）秒
    drainTime: 0.5,      // 視線から外れて警戒が下がる秒
    warnAt: 0.35,        // 「みつかる！」警告の閾値（メーター値）
  },

  // ---- 隠れ蓑の雫（拾うと一定時間 透明化＝見張りに見えない）----
  cloak: {
    duration: 4.0,       // ★ 透明でいられる秒数
    radius: 13,          // 拾える判定半径
  },

  // ---- 縛り：飛ばし回数（ステージごとの上限。0になり出口に届かなければ失敗→やり直し）----
  //  各ステージの上限は game.js の LEVELS[].maxLaunch（ステージ個別＝難易度カーブ）。
  //  下は全ステージ共通のツマミ。難易度は「上限を下げる／回復量を減らす」で締める。
  rules: {
    launchPerDango: 1,   // ★ 💧雫を1つ拾うごとに回復する飛ばし回数（小さく＝シビア）
    lowWarnAt: 3,        // ★ のこりがこの数以下でHUDを赤く点滅（警告）
    slipSpeed: 95,       // ★ 滑る壁：貼り付いても下へずり落ちる速さ px/s（大きい＝早く落ちる）
  },

  // ---- もちっと（2階バネ＝ease-out-back）----
  squash: {
    k: 260,                 // ★ 剛性（大=速く戻る）
    c: 9,                   // ★ 減衰（小=ぷるぷる長い）
    idleAmp: 0.03, idlePeriod: 2.0,
    chargeAlong: 0.78, chargePerp: 1.22, chargeOffset: 0.45,
    launchAlong: 1.8, launchPerp: 0.62,
    flightMax: 0.15,
    landAlong: 0.45,
  },

  eyes: { ease: 0.18, blinkEvery: [1.4, 4.5], blinkDur: 0.09, pupil: 0.42 },

  camera: { smoothTime: 0.18, lookahead: 170, lookaheadK: 0.11, zoomMin: 0.92, zoomSpeedRef: 1400, zoomSmooth: 0.25 },

  trajectory: { steps: 90, beadEvery: 3, coldHue: 190, warmHue: 330 },

  shake: { perSpeed: 0.0011, max: 1.0, decay: 0.2, maxOffset: 24, maxRot: 0.04 },

  particles: { launchCount: [6, 10], launchRing: 14, landDust: 12, trailEvery: 0.03, trailSpeed: 700, deathCount: 28 },

  haptics: { launch: 8, land: 16, death: [28, 18, 28] },

  // ---- 洞窟の見た目（フラット＋有機アニメ）----
  cave: { wobbleAmp: 3.2, wobbleSpeed: 0.0013, edgeWidth: 5, edgeAlpha: 0.9, sporeCount: 26 },

  danger: '#ff5238',        // 致死/トゲ（竹槍・撒菱）の警告色：朱（全ステージ共通）

  // ---- ステージ配色（忍び込み：夜の藍・墨bg＋提灯/金 accent＋映える blob）----
  //  月夜の堀 → 影の廻廊 → 隠れ里 → 紅楓の砦 → 天守の頂 へ忍び上がる。
  //  bg=夜闇 / wall=石垣・板塀 / accent=灯り・出口・演出 / blob=忍ぶ生き物（発光して闇に映える）
  //  ※並び＝game.js LEVELS と一致（章: 1 月夜の外郭 / 2 城内のからくり / 3 天守へ）
  stages: [
    { palette: { bg: '#0a1230', wall: '#1b2750', accent: '#9fc4ff', blob: '#ff5a47' } }, // 1-1 月夜の堀（藍×月光×朱）
    { palette: { bg: '#15101f', wall: '#2a2238', accent: '#ffb347', blob: '#54e0c4' } }, // 1-2 影の廻廊（墨紫×提灯×翡翠）
    { palette: { bg: '#0b1f1a', wall: '#163129', accent: '#ffd24a', blob: '#ff6f91' } }, // 1-3 隠れ里（竹林×灯×紅）
    { palette: { bg: '#15101a', wall: '#2b2233', accent: '#e8a23c', blob: '#56e0c4' } }, // 2-1 からくり堂（黄銅×翡翠）
    { palette: { bg: '#0a1622', wall: '#18293c', accent: '#bfe9ff', blob: '#ff7a9e' } }, // 2-2 氷蔵（氷青×紅）
    { palette: { bg: '#1d0f13', wall: '#34181f', accent: '#ff7a4d', blob: '#54d6e0' } }, // 3-1 紅楓の砦（紅葉×橙×浅葱）
    { palette: { bg: '#0a0a14', wall: '#1d1b2a', accent: '#ffcf5c', blob: '#ff5d7a' } }, // 3-2 天守の頂（墨×金×紅）
    { palette: { bg: '#0b1530', wall: '#1d2c52', accent: '#cfe0ff', blob: '#ff8a4d' } }, // 4-1 浮雲の廊（群青×銀×橙）
    { palette: { bg: '#0c0a1e', wall: '#231f3e', accent: '#ffe6a0', blob: '#ff4d6d' } }, // 4-2 月天楼の極（漆黒×月金×緋）
  ],

  // 目・影など共通
  character: { eyeWhite: '#ffffff', pupil: '#0b1a20', shadow: 'rgba(0,0,0,0.22)' },
};

if (typeof window !== 'undefined') window.DESIGN = DESIGN;
if (typeof module !== 'undefined') module.exports = DESIGN;
