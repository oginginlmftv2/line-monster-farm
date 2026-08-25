# アシストカードデータ監査

監査日: 2026-08-23

対象: P12-3
本番影響: ⚪（リポジトリ内の読取監査のみ）

## 1. 監査方法

`node scripts/audit-assist-data.js`でリポジトリ内の既存データを読み取り、件数、参照関係、
文字数、画像ファイル名、SHA-256を集計した。`assist-card-data.js`など100KBを超える入力は
スクリプト内で処理し、内容を監査報告へ複製していない。

能力と現行カードの突合は表示名の完全一致だけを使った。候補となる`cardId`が1件のときだけ
`resolved`とし、複数なら`ambiguous`、0件なら`unlinked`とした。レアリティなどからの推測確定は
行っていない。SAPOはmainの`固有名`またはsubの`キャラ名`で名前候補を取得し、
`main.レアリティ`または`sub.名称`で1件に絞れた場合だけ`exact`とした。名前候補0件は`none`、
名前一致後にレアリティで0件または複数件となる行は`candidate`とし、名前候補をすべて保持した。

可視本文は、効果の`name + desc`、`resolved`能力の`name + desc`、解説の`explanation`を、
各文字列から`/<[^>]+>/g`でタグを除去した後の`String.length`で合計した。四分位点は91件を
昇順に並べ、25%点は23番目、中央値は46番目、75%点は69番目の値とした。

Firestoreは今回の詳細指示で範囲外とされたため、読み取りも書き込みも行っていない。
`cardAbilities/assignments`のexportと照合は管理者の別作業として残る。

## 2. 確定した事実

### 能力画像の割当

管理画面から手動コピーしたFirestore `cardAbilities/assignments`の一次資料を
`node scripts/build-ability-assignments.js`で機械変換した。元の配列順を維持し、全カードで
配列indexが0からの連番であることを検査した。カードは`cards/cards-data.js`のキー順にそろえた。

| 項目 | 結果 |
|---|---:|
| cardId | 88件 |
| 割当 | 193件 |
| 参照画像 | 189種 |
| 存在しない画像参照 | 0件 |
| `cards-data.js`に無いcardId | 0件 |
| 配列indexの欠番・重複 | 0件 |
| 割当が無い現行カード | 3件 |
| `assist-abilities/`の実ファイル | JPG 200枚、ほかに`.gitkeep` 1件 |

割当が無い現行カードは次の3件である。

- `g1-MR-serafina`
- `g2-SSR-monodasu`
- `g3-MR-jingorou`

どのカードからも参照されない画像は次の11枚である。未使用か割当漏れかは判断できないため、
削除していない。

- `S__143507552_0.jpg`
- `S__143515681.jpg`
- `S__150462486_0.jpg`
- `S__150462487_0.jpg`
- `S__29696034.jpg`
- `S__29761550_0.jpg`
- `S__29761551_0.jpg`
- `S__71049220_0.jpg`
- `S__94109706_0.jpg`
- `S__94838790_0.jpg`
- `S__94838791_0.jpg`

2カードで共有される画像は次の4枚である。すべて`a10j-MR-fureria`と
`a10j-SSR-fureria`の間の共有で、同一キャラの別レアリティによる正常な割当として保持した。

- `S__71049236_0.jpg`
- `S__94117891_0.jpg`
- `S__94117892_0.jpg`
- `S__94117893_0.jpg`

### カードと画像

| 項目 | 結果 |
|---|---:|
| 現行カード | 91件 |
| 固有名 | 89種 |
| カード画像の欠落 | 0件 |
| 未参照カード画像 | 0件 |

同名カードは次の2組である。

- イッキ: `c26j-SSR-ikki`、`c24j-MR-ikki`
- フレリア: `a10j-SSR-fureria`、`a10j-MR-fureria`

### 解説

| 項目 | 結果 |
|---|---:|
| `src/data/cards-editorial.json`収録 | 90カード |
| editorialだけにある未知ID | 0件 |
| 現行カードだけにあるID | 1件（`g3-MR-jingorou`） |
| 解説0字 | 6件 |
| 解説1〜99字 | 25件 |
| 解説100〜199字 | 44件 |
| 解説200字以上 | 16件 |
| 編成データあり | 5件 |
| 評価あり | 90件 |

### アシスト効果

83カードに888効果があり、効果側だけにある未知`cardId`は0件だった。未登録は次の8カードである。

`g1-MR-serafina`、`g2-SSR-monodasu`、`g3-MR-jingorou`、`c20k-MR-teosu`、
`d24k-SSR-rupinasu`、`d23k-MR-eiru`、`c28j-SSR-rokusho`、`c27j-MR-godemperor`

| `totsujou` | 件数 |
|---|---:|
| 無凸 | 416 |
| 1凸 | 147 |
| 2凸 | 156 |
| 3凸 | 86 |
| 4凸 | 83 |

カード当たり効果数は最小8、中央値11、最大14だった。

### 能力DB

| 項目 | 結果 |
|---|---:|
| `lMfDB_abilities.json` | 1,079件 |
| ID重複 | 0件 |
| UTF-8 BOM | あり |
| `lmfdb_abilities_data.json` | 593件 |
| card値 | 172種 |
| `resolved` | 560件 |
| `ambiguous` | 7件 |
| `unlinked` | 512件 |

`source`はイベント644件、閃き403件、EXトレ32件。`rarity`はSSR 733件、MR 310件、
欠落36件で、欠落の内訳はEXトレ32件、閃き2件、イベント2件だった。

`unlinked`のカード名は100種。そのうちモンスター名に一致したのは
`アインズ(SSR)`と`メカお父さん`の2種で、括弧内レアリティを除いた名前で照合した。
残る98種495件は現行カード名にもモンスター名にも一致しなかった。

能力が1件以上付く現行カードは71件、能力0件は20件。能力があるカードだけを基準にした
カード当たり能力数は最小1、中央値5、最大24だった。効果0件は8カード、能力0件は20カード、
両方0件は7カードだった。

### 可視本文

| 項目 | 結果 |
|---|---:|
| 最小 | 0字 |
| 25%点 | 662字 |
| 中央値 | 870字 |
| 75%点 | 1,167字 |
| 最大 | 1,677字 |
| 600字以上 | 72件 |
| 800字以上 | 54件 |
| 1,000字以上 | 33件 |

内訳の中央値は効果481字、能力242字、解説136字だった。本文800字以上かつ解説150字以上の
二軸ゲートを通るカードは28件。参考値は解説100字で46件、解説200字で13件だった。
解説80〜149字かつ本文800字以上の昇格候補は22件だった。

### SAPO_DATA

| 項目 | 結果 |
|---|---:|
| 全件 | 213件 |
| main / sub | 175件 / 38件 |
| mainの項目 | 52個 |
| mainの固有名 | 175種 |
| mainのSSR / SR / MR | 107件 / 35件 / 33件 |
| 現行89名のうちSAPOにない名前 | 47件 |
| SAPOにあって現行にない名前 | 133件 |
| 能力DBの172名のうちSAPOにある名前 | 116種 |
| main（固有名で照合） | exact 42 / candidate 0 / none 133 |
| sub（キャラ名で照合） | exact 14 / candidate 3 / none 21 |
| 全体 | exact 56 / candidate 3 / none 154 |
| exact行が指す一意な現行カード | 56 / 91 |
| 凸データが得られない現行カード | 35件 |

mainは`固有名`、subは`キャラ名`で名前候補を取得し、`main.レアリティ`または`sub.名称`と
現行カードのレアリティが一致する1件だけを`exact`とした。名前一致があってもレアリティで
一意に決まらない3件は`candidate`に残した。`sapoIndex`はmain内の添字ではなく、
SAPO_DATA全体213件での添字へ採番基準を変更した。

## 3. 候補

能力の`ambiguous` 7件はすべて表示名が「フレリア」で、現行カード側にSSRとMRの2 IDがある。
能力DBの`rarity`がSSRであっても、表示名だけを根拠に自動確定していない。
詳細は`src/data/_audit/ability-card-map.json`の`linkStatus: "ambiguous"`の行を参照する。

SAPO対応表の`candidate`は次の3件である。名前一致候補は保持するが、確定`cardId`は出力しない。

- sub「新たな大陸へ」/ ホリィ / SR → `f9-SSR-hori`
- sub「聖夜に乾杯」/ エイル / SSR → `d23k-MR-eiru`
- sub「非番」/ リヴァイ / SR → `d7-SSR-rivai`

## 4. 未解決

- 能力512件は現行カードへ未帰属のまま。うち495件はカード名にもモンスター名にも一致しない。
- SAPOの154件（main 133件、sub 21件）は現行カード名との一致がなく、`none`のまま。
- SAPOの3件は名前一致後のレアリティが一致せず、`candidate`のまま。
- 現行8カードのアシスト効果が未登録。
- 現行20カードに`resolved`能力がない。
- `g3-MR-jingorou`はeditorial未収録。
- Firestore `cardAbilities/assignments`は未exportであり、能力画像との対応は未確認。

これらはこの監査で推測補完していない。P12-4〜6で人が根拠を確認して確定する。

## 5. 生成した対応表と安全検査

- `src/data/_audit/ability-card-map.json`: 1,079件。`resolved`以外の`cardId`は全件`null`
- `src/data/_audit/sapo-card-map.json`: main 175件 + sub 38件 = 213件。
  `exact`以外に確定`cardId`プロパティなし

機械検査結果は、`resolved`以外で`cardId`が入った能力0件、`exact`以外で確定`cardId`が
入ったSAPO行0件、`exact`行の`cardId`重複0件だった。

## 6. 入力SHA-256

| 入力 | SHA-256 |
|---|---|
| `cards/cards-data.js` | `a5282feead8a907a31b047c07195608eca74ad4198fa4abcd0746d51e9f0ce97` |
| `cards/editorial-data.js` | `9794650c5e5596b84a759ce0673a1ef82ac30471eb4ffdf77ea817fe5a5a90e0` |
| `assist-effect-data.js` | `1b47687f15a077a40e6ae51be7b154eca4e5fb67fd2d35a10779948bd0c31750` |
| `assist-card-data.js` | `4770b60ab2a46bf355f484b60ff85e9021ed17fbc0f1c2186408ad173025327c` |
| `src/data/cards-editorial.json` | `c708e8fd443eba8c934c8a14f4074717ba86efddcefc7de6afc6cf934c6cd38e` |
| `lMfDB_abilities.json` | `397f16d5f1bae4b35c440ec4194ddf18286a9b4573e133a78e2609892219bf90` |
| `lmfdb_abilities_data.json` | `c4c3c8639abe1475d9c0513d695856a0046883bfb48cdc997876ff872796a6e2` |
| `src/data/monster-ids.json` | `9e001a141b611ed877161999e2418b53474e917eaad8165e0bff6ec23a7eb7e1` |

## 7. カードDBの統合結果

P12-4で`node scripts/build-assist-cards.js`を実行し、現行91カードを
`src/data/assist-cards.json`へ`cardId`基準で統合した。SAPO_DATAは
`src/data/_audit/sapo-card-map.json`の`matchType: "exact"`だけを移送し、
`candidate` 3件と`none`は移送していない。全カードの状態は`draft`とし、公開表示は切り替えていない。

| 項目 | 統合結果 |
|---|---:|
| cards | 91件。`cards/cards-data.js`のキー集合・キー順と完全一致 |
| image | 91件すべて実在（jpg 76 / png 15） |
| rarity | MR 47 / SSR 44 |
| aura | 赤 20 / 緑 14 / 黄 16 / 白 11 / 黒 17 / 青 13 |
| cardType | 24種 |
| monType | 幻霊14 / 無機12 / 創造15 / 獣族9 / 魔族14 / 怪物10 / null 17 |
| distanceが非null | 22件（零距離5 / 遠距離7 / 中距離4 / 近距離6） |
| terrainが非空 | 19件。2要素`["海岸", "砂漠"]`は1件 |
| event2が非null | 27件 |
| ratings | 90件。全件`ikusei / karyo / battle / ta`の4項目 |
| explanationが非空 | 85件。空5件と未収録1件の計6件は空文字 |
| formations | 5カード。参照するcardId 11種はすべて実在 |
| stats・limitBreakあり | 56件（main 42 / sub 14） |
| stats・limitBreakなし | 35件。全項目null |
| limitBreak 1a / 1b | 56 / 45 |
| limitBreak 2a / 2b | 56 / 53 |
| limitBreak 3a / 3b | 56 / 7 |
| limitBreak 4a / 4b | 56 / 2 |
| main専用stats | main由来42件で5項目すべて充足。欠損0 |
| sub専用stats | sub由来14件で5項目すべて充足。欠損0 |
| releasedAt | 対応56件すべて`YYYY/MM/DD`形式。日付以外0 |
| candidateから移送 | 0件 |

`generatedAt`は`null`固定である。生成を3回行った結果、各回のSHA-256は
`43cf9323af826621c912e73da49126c842342bdd54fb2ba3198b21a648dccbbf`で一致し、
バイト単位の決定性を確認した。

## 8. 効果DBの変換結果

P12-5で`node scripts/build-assist-effects.js`を実行し、`assist-effect-data.js`の効果を
`src/data/assist-effects.json`へ`cardId`基準で損失なく変換した。カードの順序は
`src/data/assist-cards.json`の配列順、カード内の効果順は入力配列順を維持している。
テキストのトリム、全角半角変換、記号統一、表記ゆれの補正は行っていない。

| 項目 | 変換結果 |
|---|---:|
| cardsエントリ | 91件。`assist-cards.json`と集合一致 |
| 効果を持つカード | 83件。`status: verified` |
| 未登録カード | 8件。`status: draft`かつ`effects: []` |
| 効果総数 | 888件。入力からの欠落・増加0 |
| unlockRank | 無凸416 / 1凸147 / 2凸156 / 3凸86 / 4凸83 |
| カード当たり効果数 | 最小8 / 中央値11 / 最大14（効果を持つ83カード） |
| `name + description + unlockRank`の重複 | 0件 |
| `name + description`だけの重複 | 81件。凸で同じ効果が再度上乗せされる仕様として保持 |
| 空文字 | name 0 / description 0 / unlockRank 0 |
| HTMLタグを含む効果 | 0件 |
| effectId重複 | 0件 |
| sortOrderの欠番・重複 | 0件 |
| 元データとの文字列一致 | 888件すべてname・desc・totsujouが完全一致 |

未登録8カードは`g1-MR-serafina`、`g2-SSR-monodasu`、`g3-MR-jingorou`、
`c20k-MR-teosu`、`d24k-SSR-rupinasu`、`d23k-MR-eiru`、
`c28j-SSR-rokusho`、`c27j-MR-godemperor`である。

同一カード内で`name + description`が同じ81件は削除していない。これらは凸段階が異なり、
同じ効果が再度上乗せされるゲーム仕様である。一意性は`name + description + unlockRank`の
3つ組で検査し、この3つ組の重複は0件だった。

## 9. 能力DBの正規化結果

P12-6で`node scripts/build-assist-abilities.js`を実行し、`lMfDB_abilities.json`の全能力を
`src/data/assist-abilities.json`へ入力配列順のまま変換した。カード対応は
`src/data/_audit/ability-card-map.json`をそのまま使い、名前による再照合や推測確定はしていない。
`generatedAt`は`null`固定で、文字列のトリム、HTMLタグの除去、表記統一もしていない。

| 項目 | 正規化結果 |
|---|---:|
| abilities | 1,079件。入力からの欠落・増加0 |
| abilityId / legacyId重複 | 0件 / 0件 |
| 入力のid欠番 | 520、566、567、568、569の5件 |
| linkStatus | resolved 560 / ambiguous 7 / unlinked 512 |
| ambiguousのsourceName | 7件すべて「フレリア」 |
| resolved以外でcardId非null | 0件 |
| source | イベント644 / 閃き403 / EXトレ32 |
| rarity | SSR 733 / MR 310 / null 36 |
| rarity nullの内訳 | EXトレ32 / 閃き2 / イベント2 |
| tags | 36種 / 空配列115件 |
| descriptionにHTMLタグを含む | 186件。タグをそのまま保持 |
| resolvedが付くカード | 71件 / 91件。71件すべて画像割当にも存在 |
| カード当たり能力数 | 最小1 / 中央値5 / 最大24 |
| duplicate-candidate | 22グループ44件。全件保持 |
| 元データとの一致 | 1,079件すべて`name / desc / card / source / rarity / tags`が一致 |

`unlinked` 512件は現行91カードに結べないが、1件も捨てていない。`cardId: null`のまま
元の表示名を`sourceName`へ保持しており、将来カードの母集団を広げた際の再対応に使える。

`name + description + sourceName`が完全一致する重複候補は次の22グループである。
原本確認前にはどちらのlegacyIdが正しいか判断できないため、44件すべてへ
`duplicate-candidate`を付け、マージ・除去していない。

| # | legacyIdのペア | 備考 |
|---:|---|---|
| 1 | 139 / 655 | legacyId以外は同一 |
| 2 | 140 / 656 | tagsのみ相違 |
| 3 | 1044 / 1064 | legacyId以外は同一 |
| 4 | 1045 / 1065 | legacyId以外は同一 |
| 5 | 1046 / 1066 | legacyId以外は同一 |
| 6 | 1047 / 1067 | legacyId以外は同一 |
| 7 | 1048 / 1068 | legacyId以外は同一 |
| 8 | 1049 / 1069 | legacyId以外は同一 |
| 9 | 1050 / 1070 | legacyId以外は同一 |
| 10 | 1051 / 1071 | legacyId以外は同一 |
| 11 | 1052 / 1072 | legacyId以外は同一 |
| 12 | 1053 / 1073 | legacyId以外は同一 |
| 13 | 1054 / 1074 | legacyId以外は同一 |
| 14 | 1055 / 1075 | legacyId以外は同一 |
| 15 | 1056 / 1076 | legacyId以外は同一 |
| 16 | 1057 / 1077 | legacyId以外は同一 |
| 17 | 1058 / 1078 | legacyId以外は同一 |
| 18 | 1059 / 1079 | legacyId以外は同一 |
| 19 | 1060 / 1080 | legacyId以外は同一 |
| 20 | 1061 / 1081 | legacyId以外は同一 |
| 21 | 1062 / 1082 | legacyId以外は同一 |
| 22 | 1063 / 1083 | legacyId以外は同一 |

旧`lmfdb_abilities_data.json`の593件は、全legacyIdが新形式に存在し、消失は0件だった。
旧形式が持つ共通項目で比較すると575件は完全一致し、18件は同一idで内容が更新されている。
この旧形式との関係は監査記録だけに残し、能力DBには追加していない。

生成を2回行った結果、各回のSHA-256は
`cf0cb7fe3b61e625c5c53f53db61d8ff4d33e91adbcb139a7eaab8c64fb42a90`で一致し、
バイト単位の決定性を確認した。

## 10. 静的カード詳細の生成結果

P12-7で3DBを入力に`cards/<cardId>.html`を91件生成した。公開導線切替前の確認用として、
全件を`noindex,follow`・広告なし・sitemap非掲載とした。`assist.html`、旧共通詳細、
既存`cards/SSR-hori.html`は変更していない。

| 項目 | 生成結果 |
|---|---:|
| 生成ページ | 91件。`assist-cards.json`のcardIdと1対1 |
| noindex,follow | 91件。例外0 |
| adsbygoogle | 0件 |
| title / description / canonical / h1 | 全91件にあり、各項目の重複0 |
| canonical | 全91件が自己URL。重複0 |
| 画像参照 | 91件すべて`assist-cards/`に実在 |
| 効果を表示 | 83カード |
| resolved能力を表示 | 71カード |
| ステータス節を表示 | 56カード |
| 解説節を表示 | 85カード |
| 編成節を表示 | 5カード |
| 評価節を表示 | 90カード |

評価4項目は`src/data/cards-editorial.json`（2026-08-18のFirestore `cards` collection export）
からカードDBへ文字列の意味を変えず移送された。表示名は本番`cards/card.html`を正として、
`ikusei=総合力育成`、`karyo=火力`、`battle=バトル性能`、`ta=他オーラモン類`とする。
総合評価は4項目、一致評価は`ta`を除く3項目の平均を小数第1位で切り捨てて表示する。

`limitBreak`は効果DBと重複するため独立節を出していない。能力は`linkStatus: resolved`だけを
`sortOrder`順に出し、`ambiguous`と`unlinked`は表示していない。効果は`unlockRank`を
無凸から4凸の順にグループ化した。

可視本文は効果とresolved能力の`name + description`、解説を、各文字列からタグ除去後に
加算した。最小0字、中央値870字、最大1,677字、800字以上54件だった。可視本文800字以上かつ
解説160字以上のレポート用ゲートは24件が通過した。この判定はHTMLへ適用せず、91件すべての
robotsをnoindexに固定した。

`node build.js`を2回連続で実行し、両方ともカードHTMLの更新0件だった。91件をカードDB順に
連結したSHA-256は両回とも
`483a768a75c1efa5b14372f01f50af46038719d6aef0efc71176263c8ade5d0d`で一致した。
本番の旧ルピナス・ホリィ詳細と比較し、カード画像の中央配置、`/ 5.0`付き評価カード、
能力ごとの影・角丸カード、見出しサイズ、セクション間隔を再現した。表の見出し列は黒背景を
使わず薄いクリーム色とし、小見出しと表の間に16pxの余白を設けた。PC、390px、320pxで
横スクロール0、画像読込成功、コンソールエラー0を確認した。見出しはPCでh1 24px・h2 20px・
h3 16px、スマートフォンでh1 20px・h2 16px・h3 14pxに固定し、ブラウザ既定値へ依存しない。
解説と一覧を含む最上位セクション間は30pxを維持した。

## 11. 公開導線の切替結果

P12-7bで、可視本文800字以上かつ解説50字以上のゲートを静的HTMLへ適用した。
各文字列は`/<[^>]+>/g`でタグを除去してから`String.length`を加算し、解説50字の条件も
将来の自動昇格を防ぐ歯止めとして維持した。3DBの内容は変更していない。

| 項目 | 切替結果 |
|---|---:|
| 生成カードページ | 91件 |
| index | 54件。robotsメタなし・sitemap掲載・広告あり |
| noindex | 37件。`noindex,follow`・sitemap非掲載・広告なし |
| sitemap | 手書き23 + モンスター生成58 + カード生成54 = 135URL |
| `assist.html`旧fragmentリンク | 0件 |
| `assist.html`静的カードリンク | 91件。全リンク先実在 |
| `cards/SSR-hori.html` | `cards/f9-SSR-hori.html`へcanonical・meta refresh・通常リンクで誘導 |

`node scripts/verify.js`はカード91件についてゲートとsitemap・robots・広告の一致を3DBから
再計算し、一覧リンクと転送元URLも継続検査する。`cards/SSR-hori.html`はnoindexを付けず、
sitemapから除外した。モンスター側の生成物と`monsters.html`は変更していない。
`index.html`はカードリンク4本のURLだけを同じ静的URL形式へ切り替えた。

## 12. 段階3: testCMSからの3DB反映

P12-11 段階3で、現行test CMSの`api_export()`が出力した3DBを手編集せず
`src/data/`へ配置した。配置前後のSHA-256は管理者提示値と一致しており、受領ファイルから
1文字も変更していない。`generatedFrom`は3ファイルとも
`["P12-8 test assist CMS"]`へ変わった。

| 入力 | 配置前・配置後のSHA-256 | 照合 |
|---|---|---:|
| `assist-cards.json` | `e9d56f1a93a4ae381ba08950bdf99a65175da755ff94e1a3733164ac013d0d6b` | 一致 |
| `assist-effects.json` | `3b4181a0a59fa277cfae03bb69e11cdd9a19b1f90dcd50c8f67d448dd2aab4fe` | 一致 |
| `assist-abilities.json` | `2b631de0748f651ed1a90578ffbe6712c8455a6eb847b8e90ea1205fb321584a` | 一致 |

| 完了条件 | 実測値 |
|---|---|
| 変更のあったカード | 1 / 91（`a24j-MR-vitoniru`） |
| 変更内容 | 効果12件すべてのテキスト |
| `ratings` | 値は同一。`a24j-MR-vitoniru`だけキー順が変化 |
| `assist-cards.json` | 前回mainとの差はキー順と`generatedFrom`のみ。カードの意味データ変更0件 |
| `assist-abilities.json` | 能力1,079件の変更0件。差は`generatedFrom`のみ |
| 生成物の差分 | `cards/a24j-MR-vitoniru.html`の1ファイルのみ |
| `sitemap.xml` | 135URLのまま変更なし |
| カード index / noindex | 54 / 37のまま変更なし |
| 総効果 | 888 / 91カード（件数変化なし） |
| `monsters/`配下 | 変更0バイト |
| `node scripts/verify.js` | FAIL 0 |
| `node build.js`を2回実行 | 2回目の生成差分0件。生成物はバイト単位で同一 |

ヴィトニルの効果テキストは、原画像照合済みの次の内容へ更新された。

| 区分 | 反映内容 |
|---|---|
| 追加された本文 e01 | 「…また主血統が一致したとき、オーラブリーダー/モン類ブリーダーの効果が発動する」 |
| 追加された本文 e06 | 「人気度、忠誠度に応じて大会勝利イベントの効果量アップ（最大50%）」 |
| 追加された本文 e10 | 「応援効果+15%」 |
| 修正された誤り | 「ブルーダートレ」→「ブリーダートレ」 |
| 見出しの表記 | `+`の前に半角スペース1つ: 10 / 10件 |
| 説明文の表記 | `+`の前後にスペースがあるもの: 0件 |

### 未解決事項

- ヴィトニルの`effectId`は`e13`・`e14`・`e15`を含み、`sortOrder`の並び順と一致しない。
  CMSが既存IDを引き継いだ結果であり、今回は直していない。採番規約の見直しを別タスクで扱う。
- ヴィトニルの`ratings`は値が同一だが、test CMS exportによってキー順が変わる。
  export成果物を手編集しない原則に従い、今回はそのまま保持した。
