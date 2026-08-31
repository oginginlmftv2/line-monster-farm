'use strict';

// src/data/lmfdb-card-map.json はカードDBの射影であり、手作業で維持しない。
// 生成規則: assist-cards.json の並び順のまま name / rarity / cardId を写す。
const LMFDB_CARD_MAP_FILE = 'src/data/lmfdb-card-map.json';
const LMFDB_CARD_MAP_SCHEMA_VERSION = 1;

function buildLmfdbCardMap(cards) {
  if (!Array.isArray(cards)) throw new Error('assist-cards.jsonのcardsが配列ではありません');
  const seen = new Set();
  const mappings = cards.map(card => {
    const mapping = { sourceName: card.name, rarity: card.rarity, cardId: card.cardId };
    if (typeof mapping.sourceName !== 'string' || !mapping.sourceName
      || typeof mapping.rarity !== 'string' || !mapping.rarity
      || typeof mapping.cardId !== 'string' || !mapping.cardId) {
      throw new Error(`カードDBのname / rarity / cardIdが不正です: ${card && card.cardId}`);
    }
    const key = JSON.stringify([mapping.sourceName, mapping.rarity]);
    if (seen.has(key)) {
      throw new Error(`カードDBのname + rarityが一意ではありません: ${mapping.sourceName} / ${mapping.rarity}`);
    }
    seen.add(key);
    return mapping;
  });
  return { schemaVersion: LMFDB_CARD_MAP_SCHEMA_VERSION, mappings };
}

function renderLmfdbCardMap(cards) {
  return JSON.stringify(buildLmfdbCardMap(cards), null, 2) + '\n';
}

module.exports = {
  LMFDB_CARD_MAP_FILE,
  LMFDB_CARD_MAP_SCHEMA_VERSION,
  buildLmfdbCardMap,
  renderLmfdbCardMap,
};
