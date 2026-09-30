'use strict';

// アシスト能力の照合キー（比較専用。保存値には使わない）。
// スクショ取り込み（scripts/check-assist-ability-payload.js）とlMfDB監査（scripts/sync-lmfdb-abilities.js）、
// GASの _cms/gas/26_ability_capture.gs が同じ規則で照合する。GAS側は同じ式を手で写しており、
// scripts/test-assist-ability-payload.js が両者の結果一致を既存DB全件で検査する。

// 能力名: NFKCで全角半角・ローマ数字（Ⅱ→II、Ｉ→I）をそろえ、空白を除く。
// 「光香む常闇の衣 I」「光香む常闇の衣Ⅰ」「[自身青]ちから＋３%」「［自身青］ちから+3％」はそれぞれ同じキーになる。
function abilityNameKey(name) {
  return String(name == null ? '' : name).normalize('NFKC').replace(/\s+/g, '');
}

// 本文: 名前と同じ正規化に加え、改行（<br>）の位置の違いは差分に数えない。
function abilityDescriptionKey(description) {
  return abilityNameKey(String(description == null ? '' : description).replace(/<br>/gi, ''));
}

// 能力のsourceName（元のカード名）とカード名の照合キー。末尾の補足括弧「(SSR)」「（ライバル）」を除く。
function sourceNameKey(sourceName) {
  let key = abilityNameKey(sourceName);
  while (/\([^()]*\)$/.test(key)) key = key.replace(/\([^()]*\)$/, '');
  return key;
}

module.exports = { abilityNameKey, abilityDescriptionKey, sourceNameKey };
