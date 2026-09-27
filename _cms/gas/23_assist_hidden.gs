/** アシストカードの準備中（cardsシートのhidden列）。ガチャ事前登録用で、準備中のカードは詳細ページ・一覧に出ず、
 *  ガチャのピックアップにだけリンク無しで出る（docs/gacha-design.md 12章）。20_assist.gsの100KB上限のため別ファイルに置く。 */

function asstCardHidden_(row) {
  return row.hidden === true || String(row.hidden).toUpperCase() === 'TRUE';
}

// 公開データへは準備中のときだけ hidden: true を書く（build.js は true 以外を拒否する）
function asstWithHidden_(card, row) {
  if (asstCardHidden_(row)) card.hidden = true;
  return card;
}

// シートには準備中だけ true を書き、それ以外は空欄にする
function asstHiddenCell_(hidden) {
  return hidden === true ? true : '';
}

function asstRequireCardHiddenColumn_() {
  var sheet = asstSheet_(ASST_SHEET_CARDS);
  var column = ASST_HEADERS[ASST_SHEET_CARDS].indexOf('hidden') + 1;
  if (sheet.getMaxColumns() < column || asstText_(sheet.getRange(1, column).getValue()).trim() !== 'hidden') {
    throw new Error('cards シートに hidden 列がありません。GASエディタで setup5_upgradeAssistCardHiddenColumn を実行してください。');
  }
}

// mainに詳細ページ cards/<cardId>.html があれば公開済み。確認できないときも安全側で止める
function asstAssertCardHideable_(cardId) {
  var response = UrlFetchApp.fetch(ASST_RAW_REPO_BASE + 'cards/' + encodeURIComponent(cardId) + '.html', {
    muteHttpExceptions: true, headers: { Range: 'bytes=0-0' }
  });
  var code = response.getResponseCode();
  if (code === 404) return;
  if (code === 200 || code === 206) throw new Error('公開済みのカードは準備中に戻せません: ' + cardId);
  throw new Error('公開状況を確認できないため、準備中にできません（HTTP ' + code + '）。少し待ってからやり直してください。');
}

// 保存時の準備中。古い画面は hidden を送らないので、未指定なら今の値を保つ
function asstResolveCardHidden_(card, row) {
  var current = asstCardHidden_(row);
  var hidden = card.hidden === undefined ? current : card.hidden === true;
  if (hidden !== current) asstRequireCardHiddenColumn_();
  if (hidden && !current) asstAssertCardHideable_(asstText_(row.cardId));
  return hidden;
}
