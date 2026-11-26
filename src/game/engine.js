/*
 * Scoundrel rules engine. No DOM, framework, or storage dependencies.
 * Imported from scoundrel-game; packaged as an ES module for Vite and Node.
 */
const Engine = (() => {
  'use strict';

  const MAX_HEALTH = 20;
  const CARD_COUNT = 44;
  const SUITS = Object.freeze({ clubs: '♣', spades: '♠', diamonds: '♦', hearts: '♥' });
  const BLACK = ['clubs', 'spades'];
  const RED = ['diamonds', 'hearts'];

  function rankLabel(value) {
    return ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[value] || String(value);
  }

  function cardLabel(card) {
    return `${SUITS[card.suit]}${rankLabel(card.value)}`;
  }

  function createDeck() {
    const deck = [];
    for (const suit of [...BLACK, ...RED]) {
      const maximum = BLACK.includes(suit) ? 14 : 10;
      for (let value = 2; value <= maximum; value += 1) {
        deck.push({
          id: `${suit}-${value}`,
          suit,
          value,
          type: BLACK.includes(suit) ? 'monster' : suit === 'diamonds' ? 'weapon' : 'potion'
        });
      }
    }
    return deck;
  }

  // FNV-1a hashes a text seed; Mulberry32 creates repeatable shuffle rolls.
  function seededRandom(seed) {
    let hash = 2166136261;
    for (const character of String(seed)) {
      hash ^= character.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return function () {
      hash += 0x6D2B79F5;
      let result = hash;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(cards, seed = null) {
    const result = cards.slice();
    const random = seed === null || seed === '' ? Math.random : seededRandom(seed);
    // Fisher–Yates: every position is sampled exactly once.
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function note(state, message, kind = 'info') {
    state.log.push({ id: state.nextLogId++, message, kind });
    if (state.log.length > 150) state.log.shift();
  }

  function drawRoom(state) {
    while (state.room.length < 4 && state.deck.length > 0) {
      state.room.push(state.deck.shift());
    }
    state.picksThisRoom = 0;
    state.potionUsed = false;
    // Final rooms can have 1–3 cards. All of those must be resolved.
    state.roomGoal = Math.min(3, state.room.length);
    if (state.room.length > 0) {
      note(state, `Room ${state.turn}: ${state.room.length} cards to explore. Choose ${state.roomGoal}.`);
    }
  }

  function createFromOrder(initialDeck, seed = null) {
    if (!Array.isArray(initialDeck) || initialDeck.length !== CARD_COUNT) {
      throw new Error('A new dungeon must contain exactly 44 cards.');
    }
    const validIds = new Set(createDeck().map(card => card.id));
    if (new Set(initialDeck.map(card => card.id)).size !== CARD_COUNT ||
        initialDeck.some(card => !validIds.has(card.id))) {
      throw new Error('Dungeon must contain each valid card once.');
    }
    // Canonicalize the deck to prevent altered card values in saved data.
    const canonical = new Map(createDeck().map(card => [card.id, card]));
    const order = initialDeck.map(card => canonical.get(card.id));
    const state = {
      version: 1,
      seed,
      initialDeck: order.slice(),
      deck: order.slice(),
      room: [],
      discard: [],
      weapon: null, // { card, stack: Card[], lastDefeated: number|null }
      health: MAX_HEALTH,
      turn: 1,
      picksThisRoom: 0,
      roomGoal: 3,
      potionUsed: false,
      lastRoomAvoided: false,
      status: 'playing',
      score: null,
      log: [],
      nextLogId: 1
    };
    note(state, seed === null ? 'A new dungeon awaits. Good luck.' : `Seeded dungeon: ${seed}.`);
    drawRoom(state);
    return state;
  }

  function newGame(seed = null) {
    const cleanSeed = seed === null || String(seed).trim() === '' ? null : String(seed).trim();
    return createFromOrder(shuffle(createDeck(), cleanSeed), cleanSeed);
  }

  function restart(state) {
    return createFromOrder(state.initialDeck, state.seed);
  }

  function canAvoid(state) {
    return state.status === 'playing' && state.room.length === 4 &&
      state.picksThisRoom === 0 && !state.lastRoomAvoided;
  }

  function canUseWeapon(state, monster) {
    return !!state.weapon && monster.type === 'monster' &&
      (state.weapon.lastDefeated === null || monster.value <= state.weapon.lastDefeated);
  }

  function previewMonster(state, monster) {
    return {
      bareDamage: monster.value,
      canUseWeapon: canUseWeapon(state, monster),
      weaponDamage: canUseWeapon(state, monster) ? Math.max(0, monster.value - state.weapon.card.value) : null
    };
  }

  function monstersRemaining(state) {
    return [...state.deck, ...state.room]
      .filter(card => card.type === 'monster')
      .reduce((sum, card) => sum + card.value, 0);
  }

  function finish(state, outcome) {
    state.status = outcome;
    state.score = outcome === 'won' ? state.health : -monstersRemaining(state);
    note(state,
      outcome === 'won'
        ? `Dungeon cleared! Final score: +${state.score}.`
        : `You fell in the dungeon. Final score: ${state.score}.`,
      outcome === 'won' ? 'good' : 'bad');
  }

  function avoidRoom(state) {
    if (!canAvoid(state)) return { ok: false, error: 'You cannot avoid this room.' };
    // Preserve the visible left-to-right order at the bottom of the draw pile.
    state.deck.push(...state.room);
    state.room = [];
    state.lastRoomAvoided = true;
    note(state, 'You slipped past the room. Its four cards moved to the bottom of the deck.', 'special');
    state.turn += 1;
    drawRoom(state);
    return { ok: true };
  }

  function resolveCard(state, cardId, combat = null) {
    if (state.status !== 'playing') return { ok: false, error: 'This game has ended.' };
    const index = state.room.findIndex(card => card.id === cardId);
    if (index === -1) return { ok: false, error: 'That card is not in your room.' };
    const card = state.room[index];
    if (card.type === 'monster') {
      if (combat !== 'weapon' && combat !== 'bare') {
        return { ok: false, error: 'Choose weapon or bare-handed combat.' };
      }
      if (combat === 'weapon' && !canUseWeapon(state, card)) {
        return { ok: false, error: 'Weapon cannot be used on this monster.' };
      }
    }

    state.room.splice(index, 1);
    state.picksThisRoom += 1;

    if (card.type === 'weapon') {
      if (state.weapon) {
        state.discard.push(state.weapon.card, ...state.weapon.stack);
        note(state, `Discarded ${cardLabel(state.weapon.card)} and its ${state.weapon.stack.length} stacked monsters.`);
      }
      state.weapon = { card, stack: [], lastDefeated: null };
      note(state, `Equipped ${cardLabel(card)}. Weapon history reset.`, 'good');
    } else if (card.type === 'potion') {
      state.discard.push(card);
      if (state.potionUsed) {
        // Example: ♥5 and then ♥8 in one room: ♥8 is discarded and heals 0.
        note(state, `${cardLabel(card)} discarded — only one potion works per room.`, 'muted');
      } else {
        const healed = Math.min(MAX_HEALTH - state.health, card.value);
        state.health += healed;
        state.potionUsed = true; // Even a 0-point heal uses the room's potion.
        note(state, `${cardLabel(card)} restored ${healed} HP${healed === 0 ? ' (already at full health)' : ''}.`, 'good');
      }
    } else {
      const bare = combat === 'bare';
      const damage = bare ? card.value : Math.max(0, card.value - state.weapon.card.value);
      state.health = Math.max(0, state.health - damage);
      if (!bare && damage === 0) {
        state.weapon.stack.push(card);
        // Example: ♦8 defeats ♠7 then ♣5 -> next weapon target must be <=5.
        // ♣9 is still fightable bare-handed but cannot be hit with that sword.
        state.weapon.lastDefeated = card.value;
        note(state, `${cardLabel(card)} defeated with ${cardLabel(state.weapon.card)}. Took 0 damage.`, 'good');
      } else {
        state.discard.push(card);
        // A stronger monster deals excess damage and does NOT update the
        // 'last defeated' limit, per this project's specified rules.
        note(state, `${cardLabel(card)} fought ${bare ? 'bare-handed' : `with ${cardLabel(state.weapon.card)}`}. Took ${damage} damage.`, 'bad');
      }
    }

    // Loss takes priority, even when this was the last card in the dungeon.
    if (state.health <= 0) {
      finish(state, 'lost');
      return { ok: true, finished: true };
    }

    if (state.picksThisRoom === state.roomGoal) {
      // For a 4-card room, exactly 1 untouched card is carried to the next.
      // For a short final room, all cards were resolved instead.
      state.lastRoomAvoided = false;
      if (state.room.length === 0 && state.deck.length === 0) {
        finish(state, 'won');
        return { ok: true, finished: true };
      }
      state.turn += 1;
      drawRoom(state);
      return { ok: true, nextRoom: true };
    }
    return { ok: true };
  }

  function cardCount(state) {
    return state.deck.length + state.room.length + state.discard.length +
      (state.weapon ? 1 + state.weapon.stack.length : 0);
  }

  return Object.freeze({
    MAX_HEALTH, CARD_COUNT, SUITS, createDeck, shuffle, newGame, restart, canAvoid,
    canUseWeapon, previewMonster, resolveCard, avoidRoom, monstersRemaining,
    cardCount, cardLabel, rankLabel
  });
})();

export default Engine;
