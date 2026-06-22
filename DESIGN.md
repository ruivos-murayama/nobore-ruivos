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

## ステージ選択MAP / 章（game.js）
全9面を4章に区切り、城を下から頂上へ登る縦スクロールの全体MAP（`gameState==='map'`／canvas描画 `drawMap`）。月・霧・火の粉・城のシルエットで雰囲気。提灯ノード＝クリア済み(灯る＋✓)／現在地(点滅)／未解放(南京錠)。`WORLDS`＝章、`LEVELS[].code`(1-1…)/`world`。タイトル「あそぶ」→MAP、ノードtapで開始、クリアで次を解放しMAPへ。進捗は `localStorage('nobore_progress')` に保存（`loadProgress/saveProgress`）。タップ判定は `mapTapAt`、慣性スクロールは `updateMap`。MAPは `LEVELS.length` 駆動なので、面を増やしても自動で段数・章バナーが伸びる（要 `design.js stages[]` に同数の配色／`WORLDS` に章）。
- 章: **第1章 月夜の外郭**(1-1〜1-3) → **第2章 城内のからくり**(2-1 動く台 / 2-2 滑る壁) → **第3章 天守へ**(3-1 / 3-2) → **第4章 月天楼**(4-1 浮雲の廊＝動く足場＋見張りの嵐 / 4-2 月天楼の極＝全ギミック総動員・最難)。難易度は終盤ほど飛ばし回数の余裕（`maxLaunch`−最短手数）を詰めて締める。

## 新ギミック（game.js / cave.js）
- **動く台**（`platforms`）：乗ると一緒に運ばれる足場。横/縦に往復（`platCount`）。乗っている間 `blob.plat` で追従。
- **滑る壁**（`slipWalls`）：貼り付くが `rules.slipSpeed` でゆっくり下へ滑り、板の下端で離脱→落下（`blob.slip`）。ソルバは“掴めて即発射できる”ので着地面に含める。

## cave.js（地形）
各ステージ `gen`：`worldH` `seed` `gapBase/gapVar` `meander` `yStep` `nubCount` `hazardCount` `dangoCount` `bouncyCount`(バンパー) `boostCount`(気流) `chamberDepth/chamberWiden`(頂上の広間) `gateHalf`(ゲート開口) `bumperMove`(頂上バンパーの往復幅) `gateGuard`(ゲート番の見張り数) `gateMover`(動く致死スパイク数)。
**左右に連続した壁があるので壁づたいに必ず上れる**（詰み防止）。下に床、上に光る出口を自動配置。

**頂上チャンバー（ゴール周りの広間）** — コリドー上端を左右へ大きく開いて「登りきった先の広間」を作る。広さは `gen.chamberWiden`（左右の開き／既定130）、縦の範囲は `gen.chamberDepth`（topからの深さ／既定300）。外へ膨らませるだけなので登路は途切れない。

**スキルショット・ゲート（攻略性）** — 出口は天井のくぼみ（∩にスリットの凹ポリゴン `cupGate`）の奥にぶら下げる。横からのかすめ取りを「リップ」で塞ぎ、**中央の開口（ゲート）から下→上へ射し込んで初めて届く**＝「光に触れただけクリア」を解消し、狙って決める手応えに。開口は広め（`gateHalf` 半幅60＝径の約2.5倍。詰みではなく“狙い”）。当たり判定 `physics.goalRadius`（＋キャラ半径）はゲート用に **40→30** に絞り、奥まで射し込まないと入らないように。広間には**バンパーを1つ自動配置**（踏み台の反対側）し、跳ね返して回り込む**バンクショット**の別ルートを用意。さらに片側に**着地用の足場**（狙いを定める踏み台）。＝直接射し込む／バンクで回り込む／足場で構える、の読める複数ルート。

**頂上の難易度カーブ（攻略パターン＝動く要素で段階的に）** — ステージが進むほどゲート周りを厳しくする：
①月夜の堀＝広いゲートのみ ②影の廻廊＝**動くバンパー**（バンクの読み） ③隠れ里＝+**ゲート番の見張り**（首振りの隙/隠れ蓑で射し込む） ④紅楓の砦＝+**動く致死スパイク**（往復する開口の窓を読む） ⑤天守の頂＝ゲートを狭く＋見張り2＋スパイク ⑥浮雲の廊＝動く足場＋見張り3＋スパイク（足場で構え直す） ⑦月天楼の極＝**最も狭いゲート(gateHalf50)＋見張り3＋ゲート番2＋スパイク2＋滑る壁＋動く足場**＝全部入りの最難。
ツマミ：`gen.gateHalf`（開口を狭く＝難）／`gen.bumperMove`（頂上バンパーの往復幅）／`gen.gateGuard`（ゲート番の数）／`gen.gateMover`（動くスパイクの数）。スパイクは端で必ず広い開口が残る振幅＝詰みではなく“タイミング”。見張り番は踏み台(下)を向かない＝狙いは付けられる。**ソルバはスパイクを無視して幾何到達性を検証**し、スパイク/見張りは「安全な窓が必ずある」タイミング層として上乗せ（見張りは sweepAmp≥halfAngle で隙を保証）。

**到達演出（気持ちよさ）** — 出口に届くと即クリア画面…ではなく、`winStart→updateWin→onClear` の多段シーケンス（既定 `WIN_DUR`=1.7s）：①出口へ吸い込まれ→②着弾の閃光・画面震え・衝撃波リング・大量パーティクル・上昇和音→③「クリア！」がぼよんと出て、きらめきが立ち昇る→④クリア画面へ。すべて game.js 内（色はステージの `accent`/`blob`）。

## セルフチェック
```
node --check design.js cave.js game.js   # 構文
node /tmp/harness.js                      # 起動～プレイで例外が出ないか
node /tmp/solve.js                        # 全ステージ攻略可能か（gen/seed/物理を変えたら必須）
```
> 物理（gravity / launchMul / maxPull / radius 等）を変えたら `solve.js` を必ず回す。新物理で詰みが出たら `cave.js` の `gen`（gap/yStep）か seed を調整。
