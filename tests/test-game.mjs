/* Rules regression tests retained from scoundrel-game. Run: npm test */
import assert from 'node:assert/strict';
import E from '../src/game/engine.js';
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function makeRoom(ids) {
  const game = E.newGame('unit-tests');
  const cards = E.createDeck();
  const byId = new Map(cards.map(card => [card.id, card]));
  game.room = ids.map(id => {
    assert.ok(byId.has(id), `Invalid card: ${id}`);
    return byId.get(id);
  });
  game.deck = cards.filter(card => !ids.includes(card.id));
  game.discard = [];
  game.health = 20;
  game.weapon = null;
  game.turn = 1;
  game.picksThisRoom = 0;
  game.roomGoal = Math.min(3, ids.length);
  game.potionUsed = false;
  game.lastRoomAvoided = false;
  game.status = 'playing';
  game.score = null;
  return game;
}

test('44 unique cards: 26 black monsters, 9 diamond weapons, 9 heart potions', () => {
  const deck = E.createDeck();
  assert.equal(deck.length, 44);
  assert.equal(new Set(deck.map(card => card.id)).size, 44);
  for (const [type, count] of [['monster', 26], ['weapon', 9], ['potion', 9]]) {
    assert.equal(deck.filter(card => card.type === type).length, count);
  }
  assert.ok(deck.some(card => card.id === 'clubs-14'));
  assert.equal(deck.some(card => card.id === 'diamonds-11'), false);
});

test('Fisher–Yates gives reproducible shuffled decks when seeded', () => {
  const ids = seed => E.newGame(seed).initialDeck.map(card => card.id);
  assert.deepEqual(ids('same seed'), ids('same seed'));
  assert.notDeepEqual(ids('different seed'), ids('same seed'));
});

test('restart replays the same original shuffle and restores 20 HP', () => {
  const game = E.newGame('restart-me');
  game.health = 4;
  const restarted = E.restart(game);
  assert.equal(restarted.health, 20);
  assert.deepEqual(restarted.initialDeck, game.initialDeck);
  assert.deepEqual(restarted.room, game.initialDeck.slice(0, 4));
});

test('avoided room goes to bottom in order, and immediate second avoid fails', () => {
  const game = makeRoom(['diamonds-2', 'hearts-3', 'clubs-4', 'spades-5']);
  const originals = game.room.map(card => card.id);
  assert.equal(E.avoidRoom(game).ok, true);
  assert.deepEqual(game.deck.slice(-4).map(card => card.id), originals);
  assert.equal(game.lastRoomAvoided, true);
  const before = JSON.stringify(game);
  assert.equal(E.avoidRoom(game).ok, false);
  assert.equal(JSON.stringify(game), before);
  assert.equal(E.cardCount(game), 44);
});

test('after three choices the fourth carries forward into the next room', () => {
  const game = makeRoom(['hearts-2', 'hearts-3', 'diamonds-8', 'clubs-2']);
  assert.equal(E.resolveCard(game, 'hearts-2').ok, true);
  assert.equal(E.resolveCard(game, 'hearts-3').ok, true);
  assert.equal(game.turn, 1);
  assert.equal(E.resolveCard(game, 'diamonds-8').ok, true);
  assert.equal(game.turn, 2);
  assert.equal(game.room.length, 4);
  assert.equal(game.room[0].id, 'clubs-2');
  assert.equal(game.picksThisRoom, 0);
  assert.equal(E.cardCount(game), 44);
});

test('only first potion in room heals, even if unused at max health', () => {
  const game = makeRoom(['hearts-2', 'hearts-10', 'diamonds-2', 'clubs-2']);
  game.health = 10;
  E.resolveCard(game, 'hearts-2');
  assert.equal(game.health, 12);
  E.resolveCard(game, 'hearts-10');
  assert.equal(game.health, 12);
  assert.equal(game.potionUsed, true);
  assert.ok(game.discard.some(card => card.id === 'hearts-10'));

  const full = makeRoom(['hearts-2', 'hearts-3', 'diamonds-2', 'clubs-2']);
  E.resolveCard(full, 'hearts-2');
  full.health = 10;
  E.resolveCard(full, 'hearts-3');
  assert.equal(full.health, 10);
});

test('weapon victories update a non-increasing limit; bare hands remain possible', () => {
  const game = makeRoom(['diamonds-8', 'clubs-7', 'spades-5', 'clubs-9']);
  E.resolveCard(game, 'diamonds-8');
  E.resolveCard(game, 'clubs-7', 'weapon');
  assert.equal(game.weapon.lastDefeated, 7);
  E.resolveCard(game, 'spades-5', 'weapon');
  assert.equal(game.weapon.lastDefeated, 5);
  assert.equal(game.weapon.stack.length, 2);
  assert.equal(game.room[0].id, 'clubs-9');
  assert.equal(E.canUseWeapon(game, game.room[0]), false);
  const unchanged = JSON.stringify(game);
  assert.equal(E.resolveCard(game, 'clubs-9', 'weapon').ok, false);
  assert.equal(JSON.stringify(game), unchanged);
  E.resolveCard(game, 'clubs-9', 'bare');
  assert.equal(game.health, 11);
});

test('weapon fight with positive damage does not change last-defeated limit', () => {
  const game = makeRoom(['diamonds-5', 'clubs-9', 'hearts-2', 'clubs-2']);
  E.resolveCard(game, 'diamonds-5');
  E.resolveCard(game, 'clubs-9', 'weapon');
  assert.equal(game.health, 16);
  assert.equal(game.weapon.lastDefeated, null);
  assert.equal(game.weapon.stack.length, 0);
  assert.ok(game.discard.some(card => card.id === 'clubs-9'));
});

test('equipping a replacement discards the old weapon and its defeated stack', () => {
  const game = makeRoom(['diamonds-8', 'clubs-7', 'diamonds-3', 'hearts-2']);
  E.resolveCard(game, 'diamonds-8');
  E.resolveCard(game, 'clubs-7', 'weapon');
  E.resolveCard(game, 'diamonds-3');
  assert.equal(game.weapon.card.id, 'diamonds-3');
  assert.equal(game.weapon.lastDefeated, null);
  assert.equal(game.weapon.stack.length, 0);
  assert.ok(game.discard.some(card => card.id === 'diamonds-8'));
  assert.ok(game.discard.some(card => card.id === 'clubs-7'));
  assert.equal(E.cardCount(game), 44);
});

test('lethal attack ends game immediately and scores unresolved monster strength', () => {
  const game = makeRoom(['spades-14', 'hearts-2', 'diamonds-3', 'clubs-2']);
  game.health = 7;
  const result = E.resolveCard(game, 'spades-14', 'bare');
  assert.equal(result.finished, true);
  assert.equal(game.status, 'lost');
  assert.equal(game.health, 0);
  assert.equal(game.score, -E.monstersRemaining(game));
  assert.equal(game.score, -194);
});

test('empty draw pile is not victory until carried fourth card is resolved', () => {
  const game = makeRoom(['hearts-2', 'hearts-3', 'diamonds-2', 'clubs-2']);
  game.discard = game.deck.slice();
  game.deck = [];
  E.resolveCard(game, 'hearts-2');
  E.resolveCard(game, 'hearts-3');
  E.resolveCard(game, 'diamonds-2');
  assert.equal(game.status, 'playing');
  assert.equal(game.room.length, 1);
  assert.equal(game.roomGoal, 1);
  assert.equal(game.room[0].id, 'clubs-2');
  assert.equal(E.canAvoid(game), false);
  E.resolveCard(game, 'clubs-2', 'weapon');
  assert.equal(game.status, 'won');
  assert.equal(game.score, 20);
});

test('a short final room with one potion resolves and wins', () => {
  const game = makeRoom(['hearts-10']);
  game.discard = game.deck.slice();
  game.deck = [];
  game.health = 14;
  const result = E.resolveCard(game, 'hearts-10');
  assert.equal(result.finished, true);
  assert.equal(game.status, 'won');
  assert.equal(game.health, 20);
  assert.equal(game.score, 20);
  assert.equal(E.cardCount(game), 44);
});

test('200 complete runs maintain card accounting and always terminate', () => {
  for (let run = 0; run < 200; run += 1) {
    const game = E.newGame(`sim-${run}`);
    let steps = 0;
    while (game.status === 'playing' && steps < 250) {
      // Occasionally avoid; consecutive avoidance is prevented by the engine.
      if (steps % 11 === 0 && E.canAvoid(game)) {
        assert.equal(E.avoidRoom(game).ok, true);
      } else {
        const card = game.room[steps % game.room.length];
        const combat = card.type !== 'monster' ? null :
          E.canUseWeapon(game, card) ? 'weapon' : 'bare';
        const response = E.resolveCard(game, card.id, combat);
        assert.equal(response.ok, true);
      }
      assert.equal(E.cardCount(game), 44, `Card loss on run ${run}, step ${steps}`);
      steps += 1;
    }
    assert.notEqual(game.status, 'playing', `Stuck game on run ${run}`);
    assert.ok(steps < 250);
    assert.equal(game.status === 'won' ? game.score : -game.score, game.status === 'won' ? game.health : E.monstersRemaining(game));
  }
});

let failures = 0;
for (const { name, fn } of tests) {
  try { fn(); console.log(`✓ ${name}`); }
  catch (error) { failures += 1; console.error(`✗ ${name}\n  ${error.stack}`); }
}
console.log(`\n${tests.length - failures}/${tests.length} tests passed.`);
if (failures) process.exitCode = 1;
