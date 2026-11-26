/* Versioned browser save; failures (private browsing/disabled storage) are nonfatal. */
import Engine from './engine.js';

const Storage = (() => {
  'use strict';
  const KEY = 'scoundrel-dungeon-v1';

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const game = JSON.parse(raw);
      const E = Engine;
      if (game.version !== 1 || !Array.isArray(game.initialDeck) ||
          !Array.isArray(game.deck) || !Array.isArray(game.room) ||
          !Array.isArray(game.discard) || !Array.isArray(game.log) ||
          !['playing', 'won', 'lost'].includes(game.status) ||
          typeof game.health !== 'number' || !Number.isInteger(game.turn) ||
          game.initialDeck.length !== E.CARD_COUNT ||
          E.cardCount(game) !== E.CARD_COUNT) return null;
      // Reject missing/duplicate cards and unexpected card IDs.
      const actual = [...game.deck, ...game.room, ...game.discard,
        ...(game.weapon ? [game.weapon.card, ...game.weapon.stack] : [])];
      const expected = new Set(E.createDeck().map(card => card.id));
      if (new Set(actual.map(card => card.id)).size !== E.CARD_COUNT ||
          actual.some(card => !expected.has(card.id))) return null;
      return game;
    } catch (_) {
      return null;
    }
  }

  function save(game) {
    try {
      localStorage.setItem(KEY, JSON.stringify(game));
      return true;
    } catch (_) {
      return false;
    }
  }

  return Object.freeze({ load, save });
})();

export default Storage;
