# のぼれRUIVOSくん — デザインシステム

「引っぱって→弾けて→着地」の手触りを最優先に作った、不規則な洞窟を上へ進むワンタッチ・アクション。
**ここを読みながら「これをこうして」と言えば反映できます。**

- `design.js` 🎨 … 物理(px/s)・手触り・色（ステージ配色）の**単一の置き場**。`★`＝まず弄る
- `cave.js` 🕳 … 洞窟の形の生成＋当たり判定（**地形の形・難易度**）
- `feel.html` / `feel.js` 🧪 … 手触り検証用サンドボックス（本編とは独立。実験用に温存）
- `style.css` の `:root` 🖼 … UI（タイトル/ボタン/HUD）
- 反映 … 値を変えてブラウザ再読み込み（ビルド不要）

物理は **px/s・固定120Hz更新＋描画補間**（端末非依存）。アニメは**バネ/トゥイーン駆動**、ロジック層とジュース層は分離。

---

## よくある指示 → どこを変える（design.js）

| やりたいこと | 場所 |
|---|---|
| 弾けを強く/弱く | ★`physics.launchMul`（速度=引きpx×これ）／`physics.maxPull` |
| 重さ（弧の締まり） | ★`physics.gravity` |
| 着地のプルン量・粘り | ★`squash.landAlong`（小=深く潰れる）／`squash.c`（小=長く揺れる）／`squash.k`（大=速く戻る） |
| 射出の伸び | `squash.launchAlong` / `launchPerp` |
| タメの効き（スロー） | `slowmo.chargeScale`（小=強いスロー） |
| カメラの追従/先読み/ズーム | `camera.smoothTime` / `lookahead` / `zoomMin` |
| 画面ゆれ | `shake.perSpeed`（着地速度→trauma）／`maxOffset` |
| ステージの色 | `stages[i].palette`（`bg`空間 / `wall`岩 / `accent`雫・出口・演出 / `blob`キャラ＝発光） |
| 危険の色 | `danger`（全ステージ共通の蛍光色） |
| バンパーの跳ね | `gimmick.bumperRestitution` / `bumperMinOut`（最低弾速＝必ず気持ちよく跳ねる） |
| 上昇気流の強さ | `gimmick.boostAccel` / `boostMaxSpeed` |
| ギミック数（難易度） | `cave.js gen` の `bouncyCount`(バンパー) / `boostCount`(気流) / `hazardCount`(トゲ) |
| 飛ばし回数の上限（ステージ別） | `game.js LEVELS[].maxLaunch`（締める=下げる／緩める=上げる。コメントに最短手数の目安） |
| 💧の回復量・警告の閾値 | `rules.launchPerDango`（💧1個で回復する回数）／`rules.lowWarnAt`（残りこの数以下で赤点滅） |
| コンボ音 | `combo.base` / `pitchStep` |
| 洞窟の広さ・形・難易度 | `cave.js` の `gen`（`gapBase`幅 / `meander`蛇行 / `seed`形 / 各count） |
| 壁の揺らぎ・胞子 | `cave.wobbleAmp` / `wobbleSpeed` / `sporeCount` |
| 目の追従/瞬き | `eyes.ease` / `blinkEvery` |

---

## 採用イージング（出力指定の回答）
- **カメラ/ズーム = SmoothDamp（臨界減衰バネ）**：必ず滑らかに収束＝カクつかない。`camera.smoothTime` が遅れ量。
- **スクワッシュ = 2階バネ(k,c)**：`ease-out-back` 的オーバーシュートを物理生成。`c` を下げるほど“ぷるぷる”が長い。
- **スロー復帰 = 指数イージング**：`slowmo.toSlow/toFast`。
- **同フレーム発火**：指を離した瞬間に［射出物理・ストレッチ・SE・触覚・パーティクル］を同一フレームで。

## 最初に弄るべきツマミ（順）
1. `physics.launchMul` / `physics.maxPull`（弾けの強さと“最大チャージの手応え”）
2. `physics.gravity`（弧の締まり・重さ）
3. `squash.landAlong` / `squash.c`（着地の気持ちよさ）
4. `slowmo.chargeScale`（狙える感）
5. `shake.perSpeed` / `camera.lookahead` / `camera.zoomMin`（迫力・先読み）

## design.js トークン早見
`layout` `physics`(px/s) `slowmo` `squash` `eyes` `camera` `trajectory` `shake` `particles` `haptics` `cave` `rules`(飛ばし回数) `danger` `stages[].palette` `character`(目/影)

## ステージ（難易度カーブ＝1ステージ1概念）
1. **シアンの胎洞** — 基本（弾く・貼り付く）／広め・危険なし
2. **すみれの隘路** — バンパー（ピンボール式の跳ね）
3. **うみの縦坑** — 上昇気流（入ると一気に加速）
4. **もえぎの淵** — 複合（バンパー＋気流）
5. **あかがねの底** — 総合・最難（最も高く狭い）

ギミック（“弾く快感”の増幅）：**バンパー**＝必ず気持ちよく跳ね返す／**上昇気流**＝速度・ズーム・トレイルで爽快／**コンボ雫**＝1回の飛行で連続回収すると音程↑＋`×N`表示（任意・リスク報酬）。

**縛り：飛ばし回数（↗）** — 1ステージで弾ける回数に上限（`LEVELS[].maxLaunch`）。使い切って出口に届かなければ「もう とべない…」で**やり直し**（致死とは別演出。挑戦+1）。**💧雫を拾うと回数が回復**（`rules.launchPerDango`）＝集めるほど長く飛べるリスク報酬で、難易度の調整弁になる。回数は**毎リスポーンで満タンに復帰**（死＝回数の枯渇で詰まない）。上限は各ステージとも**最短手数＋人間のミス分**に設定（最短手数は `/tmp/minlaunch.js` のBFSで計測。締める→`maxLaunch`を下げる）。残りが `rules.lowWarnAt` 以下でHUDが赤く点滅。

## cave.js（地形）
各ステージ `gen`：`worldH` `seed` `gapBase/gapVar` `meander` `yStep` `nubCount` `hazardCount` `dangoCount` `bouncyCount`(バンパー) `boostCount`(気流)。
**左右に連続した壁があるので壁づたいに必ず上れる**（詰み防止）。下に床、上に光る出口＋足場を自動配置。

## セルフチェック
```
node --check design.js cave.js game.js   # 構文
node /tmp/harness.js                      # 起動～プレイで例外が出ないか
node /tmp/solve.js                        # 全ステージ攻略可能か（gen/seed/物理を変えたら必須）
```
> 物理（gravity / launchMul / maxPull / radius 等）を変えたら `solve.js` を必ず回す。新物理で詰みが出たら `cave.js` の `gen`（gap/yStep）か seed を調整。
