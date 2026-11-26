import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import E from '../src/game/engine.js';
import { mountGame } from '../src/game/controller.js';

const markup = await readFile(new URL('../src/game/markup.html', import.meta.url), 'utf8');
const key = 'scoundrel-dungeon-v1';

function fixture(t, saved) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://scoundrel.test/' });
  const descriptors = new Map();
  for (const name of ['window', 'document', 'localStorage', 'AbortController']) {
    descriptors.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: dom.window[name] });
  }
  // jsdom does not implement native dialog display/focus management.
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
    this.dispatchEvent(new dom.window.Event('close'));
  };
  const root = document.getElementById('root');
  if (saved !== undefined) localStorage.setItem(key, typeof saved === 'string' ? saved : JSON.stringify(saved));
  const disposers = [];
  function mount() {
    root.innerHTML = markup;
    const stop = mountGame(root, '/');
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      stop();
      root.replaceChildren();
    };
    disposers.push(dispose);
    return dispose;
  }
  const dispose = mount();
  t.after(() => {
    for (const stop of disposers) stop();
    dom.window.close();
    for (const [name, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  return {
    root, mount, dispose,
    el: id => root.querySelector('#' + id),
    state: () => JSON.parse(localStorage.getItem(key)),
    card: id => root.querySelector('[data-card-id="' + id + '"]'),
    shortcut: letter => document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: letter, bubbles: true }))
  };
}

test('Strict Mode setup/cleanup/setup preserves saves and removes document listeners', t => {
  const f = fixture(t);
  const initial = f.state();
  f.dispose();
  const disposeAgain = f.mount();
  assert.deepEqual(f.state(), initial);
  assert.equal(f.root.querySelectorAll('.playing-card').length, 4);
  f.shortcut('a');
  assert.equal(f.state().turn, 2);
  assert.equal(f.state().lastRoomAvoided, true);
  assert.equal(f.el('avoidBtn').disabled, true);
  disposeAgain();
  const saved = localStorage.getItem(key);
  f.shortcut('n');
  assert.equal(localStorage.getItem(key), saved);
});

test('seeded controls, weapon selection, combat and HUD follow the original engine', t => {
  const f = fixture(t);
  let expected;
  let seed;
  for (let i = 0; i < 200; i += 1) {
    seed = 'interface-' + i;
    expected = E.newGame(seed);
    if (expected.room.some(c => c.type === 'weapon') && expected.room.some(c => c.type === 'monster')) break;
  }
  assert.ok(expected.room.some(c => c.type === 'weapon'));
  f.el('seedInput').value = seed;
  f.el('seedBtn').click();
  assert.deepEqual(f.state(), expected);
  const weapon = expected.room.find(c => c.type === 'weapon');
  f.card(weapon.id).click();
  E.resolveCard(expected, weapon.id);
  assert.deepEqual(f.state(), expected);
  const monster = expected.room.find(c => c.type === 'monster');
  f.card(monster.id).click();
  assert.equal(f.el('battleDialog').open, true);
  assert.equal(f.el('useWeaponBtn').disabled, false);
  f.el('useWeaponBtn').click();
  E.resolveCard(expected, monster.id, 'weapon');
  assert.deepEqual(f.state(), expected);
  assert.equal(f.el('healthValue').textContent, String(expected.health));
  assert.equal(f.el('battleDialog').open, false);
  assert.equal(E.cardCount(f.state()), 44);
});

test('restart confirmation replays the initial deck', t => {
  const game = E.newGame('replay-interface');
  E.avoidRoom(game);
  const f = fixture(t, game);
  f.el('restartBtn').click();
  assert.equal(f.el('confirmDialog').open, true);
  f.el('confirmActionBtn').click();
  assert.deepEqual(f.state(), E.restart(game));
  assert.equal(f.el('confirmDialog').open, false);
});

test('a saved run resumes and an invalid save starts a fresh dungeon', t => {
  const game = E.newGame('resume-interface');
  E.avoidRoom(game);
  const f = fixture(t, game);
  assert.deepEqual(f.state(), game);
  f.dispose();
  localStorage.setItem(key, '{broken json');
  f.mount();
  assert.equal(f.state().status, 'playing');
  assert.equal(f.state().health, 20);
  assert.equal(E.cardCount(f.state()), 44);
});

test('the final card opens a result and replay works', t => {
  const game = E.newGame('finish-interface');
  const cards = E.createDeck();
  game.room = [cards.find(c => c.id === 'hearts-10')];
  game.deck = [];
  game.discard = cards.filter(c => c.id !== 'hearts-10');
  game.roomGoal = 1;
  game.picksThisRoom = 0;
  game.health = 14;
  const f = fixture(t, game);
  f.card('hearts-10').click();
  assert.equal(f.state().status, 'won');
  assert.equal(f.el('resultDialog').open, true);
  assert.equal(f.el('resultScore').textContent, '+20');
  f.el('resultRestartBtn').click();
  assert.equal(f.state().status, 'playing');
  assert.equal(f.state().health, 20);
  assert.equal(f.root.querySelectorAll('.playing-card').length, 4);
});
