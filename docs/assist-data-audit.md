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
