/* Original game interface, mounted and disposed by React. */
import E from './engine.js';
import Store from './storage.js';
export function mountGame(root, assetBase = '/') {
  'use strict';

  const $ = id => root.querySelector('#' + id);
  const subscriptions = new AbortController();
  // All listeners, including keyboard and image handlers, belong to this mount.
  const listen = (target, type, handler) =>
    target.addEventListener(type, handler, { signal: subscriptions.signal });

  let game = Store.load() || E.newGame();
  let visibleIds = new Set();
  let lastRenderedLogId = 0;
  let pendingMonsterId = null;
  let pendingAction = null;
  let pendingSeed = null;

  const dialogs = {
    rules: $('rulesDialog'),
    battle: $('battleDialog'),
    confirm: $('confirmDialog'),
    result: $('resultDialog')
  };

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function' && !dialog.open) {
      dialog.showModal();
    }
  }

  function closeDialog(dialog) {
    if (dialog && dialog.open) dialog.close();
  }

  function announce(message) {
    $('srStatus').textContent = '';
    $('srStatus').textContent = message;
  }

  function renderHud() {
    $('healthValue').textContent = game.health;
    $('healthFill').style.width =
      `${(game.health / E.MAX_HEALTH) * 100}%`;

    $('healthBar').setAttribute('aria-valuenow', game.health);
    $('healthBar').setAttribute(
      'aria-valuetext',
      `${game.health} of ${E.MAX_HEALTH} health points`
    );

    root.querySelector('.health-tile')
      .classList.toggle('is-critical', game.health <= 6);

    $('weaponValue').textContent = game.weapon
      ? E.cardLabel(game.weapon.card)
      : 'Unarmed';

    $('weaponSub').textContent = game.weapon
      ? `Damage reduction: ${game.weapon.card.value}`
      : 'Fight with your fists';

    $('lastDefeated').textContent =
      game.weapon && game.weapon.lastDefeated !== null
        ? game.weapon.lastDefeated
        : '—';

    $('stackCount').textContent =
      game.weapon ? game.weapon.stack.length : '0';

    $('turnValue').textContent = String(game.turn).padStart(2, '0');
    $('deckValue').textContent = String(game.deck.length);
    $('discardValue').textContent = String(game.discard.length);

    $('roomHeadingNumber').textContent =
      String(game.turn).padStart(2, '0');

    $('progressCount').textContent =
      `${E.CARD_COUNT - game.deck.length - game.room.length} of ${E.CARD_COUNT} cards resolved`;

    $('choiceCount').textContent =
      `${game.picksThisRoom} / ${game.roomGoal} chosen`;

    let instruction =
      `Choose ${game.roomGoal} cards in any order. The fourth travels with you.`;

    if (game.roomGoal < 3) {
      instruction =
        `Final room: resolve all ${game.roomGoal} remaining ${game.roomGoal === 1 ? 'card' : 'cards'}.`;
    }

    if (game.status !== 'playing') {
      instruction = game.status === 'won'
        ? 'Every card has been resolved. You survived!'
        : 'Your expedition has ended.';
    }

    $('roomInstruction').textContent = instruction;

    $('avoidBtn').disabled = !E.canAvoid(game);

    if (game.status !== 'playing') {
      $('avoidHint').textContent = 'The expedition is complete.';
    } else if (game.picksThisRoom > 0) {
      $('avoidHint').textContent =
        'You have entered this room — you must finish it.';
    } else if (game.lastRoomAvoided) {
      $('avoidHint').textContent =
        'You avoided the previous room. Face this one.';
    } else if (game.room.length < 4) {
      $('avoidHint').textContent =
        'Final rooms with fewer than 4 cards cannot be avoided.';
    } else {
      $('avoidHint').textContent =
        "Don't like this room? Skip all four cards.";
    }

    $('avoidBtn').title = $('avoidBtn').disabled
      ? $('avoidHint').textContent
      : 'Move this room to the bottom of the deck';
  }

  // ============================================================
  // CARD ARTWORK SYSTEM
  // ============================================================
  //
  // Images are selected according to suit and value.
  //
  // HEARTS:
  //   2-10       -> heart.jpg
  //
  // CLUBS:
  //   2-5        -> club-1
  //   6-10       -> club-2
  //   J,Q,K,A     -> club-3
  //
  // SPADES:
  //   2-5        -> spade-1
  //   6-10       -> spade-2
  //   J,Q,K,A     -> spade-3
  //
  // DIAMONDS:
  //   2-4        -> diamond-1
  //   5-7        -> diamond-2
  //   8-10       -> diamond-3
  //
  // Supported extensions:
  // jpg, jpeg, png, webp, avif
  // ============================================================

  function artworkNames(card) {
    const value = card.value;

    if (card.suit === 'hearts') {
      return ['heart', 'hearts'];
    }

    if (card.suit === 'diamonds') {
      const tier = value <= 4 ? 1 : value <= 7 ? 2 : 3;

      return [
        `diamond-${tier}`,
        `diamonds-${tier}`
      ];
    }

    if (card.suit === 'clubs' || card.suit === 'spades') {
      const tier = value <= 5 ? 1 : value <= 10 ? 2 : 3;

      const singular = card.suit === 'clubs'
        ? 'club'
        : 'spade';

      return [
        `${singular}-${tier}`,
        `${card.suit}-${tier}`
      ];
    }

    return [];
  }

  function appendArtwork(container, card) {
    const extensions = [
      'jpg',
      'jpeg',
      'png',
      'webp',
      'avif'
    ];

    const candidates = artworkNames(card).flatMap(name =>
      extensions.map(
        extension => `${assetBase}Assets/${name}.${extension}`
      )
    );

    if (!candidates.length) return;

    const img = document.createElement('img');

    img.className = 'card-artwork';
    img.alt = '';
    img.setAttribute('aria-hidden', 'true');
    img.decoding = 'async';

    let next = 0;

    listen(img, 'load', () => {
      container.classList.add('has-artwork');
    });

    listen(img, 'error', () => {
      if (next < candidates.length) {
        img.src = candidates[next++];
      } else {
        // If the image is missing, display suit symbol.
        img.remove();
      }
    });

    container.prepend(img);
    img.src = candidates[next++];
  }

  // ============================================================
  // CREATE CARD
  // ============================================================

  function createCardButton(card, index, newCard) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className =
      `playing-card card-${card.type}${newCard ? ' is-new' : ''}`;

    button.dataset.cardId = card.id;
    button.style.setProperty('--deal-delay', `${index * 70}ms`);
    button.disabled = game.status !== 'playing';

    const label = E.cardLabel(card);

    const typeDescription = card.type === 'monster'
      ? `monster, strength ${card.value}`
      : card.type === 'weapon'
        ? `weapon, damage reduction ${card.value}`
        : `healing potion, value ${card.value}`;

    button.setAttribute(
      'aria-label',
      `${label}, ${typeDescription}. ${
        card.type === 'monster'
          ? 'Choose combat method.'
          : 'Resolve this card.'
      }`
    );

    button.title = `${label} — ${typeDescription}`;

    const inner = document.createElement('span');
    inner.className = 'card-inner';

    const back = document.createElement('span');
    back.className = 'card-back';
    back.setAttribute('aria-hidden', 'true');
    back.textContent = '♠';

    const front = document.createElement('span');
    front.className = 'card-front';
    front.setAttribute('aria-hidden', 'true');

    const corner = (bottom = false) => {
      const span = document.createElement('span');

      span.className =
        `card-corner${bottom ? ' card-corner-bottom' : ''}`;

      const rank = document.createElement('span');
      rank.textContent = E.rankLabel(card.value);

      const suit = document.createElement('span');
      suit.className = 'corner-suit';
      suit.textContent = E.SUITS[card.suit];

      span.append(rank, suit);

      return span;
    };

    const center = document.createElement('span');
    center.className = 'card-center';

    // Illustration container
    const illustration = document.createElement('span');
    illustration.className = 'card-illustration';

    // Fallback suit symbol
    const symbol = document.createElement('span');
    symbol.className = 'card-center-symbol';
    symbol.textContent = E.SUITS[card.suit];

    illustration.append(symbol);

    // Add image based on suit and card value.
    appendArtwork(illustration, card);

    const type = document.createElement('span');
    type.className = 'card-type';

    type.textContent = card.type === 'monster'
      ? 'MONSTER'
      : card.type === 'weapon'
        ? 'WEAPON'
        : 'POTION';

    const value = document.createElement('span');
    value.className = 'card-power';

    value.textContent = card.type === 'monster'
      ? `STRENGTH ${card.value}`
      : card.type === 'weapon'
        ? `POWER ${card.value}`
        : `HEAL ${card.value} HP`;

    center.append(illustration, type, value);
    front.append(corner(), center, corner(true));
    inner.append(back, front);
    button.append(inner);

    listen(button, 'click', () => selectCard(card));

    return button;
  }

  function renderRoom() {
    const grid = $('roomGrid');

    const before = visibleIds;
    const nextIds = new Set(game.room.map(card => card.id));

    grid.replaceChildren();

    game.room.forEach((card, index) => {
      grid.appendChild(
        createCardButton(card, index, !before.has(card.id))
      );
    });

    for (let i = game.room.length; i < 4; i += 1) {
      const placeholder = document.createElement('div');

      placeholder.className = 'empty-card';
      placeholder.setAttribute('aria-hidden', 'true');
      placeholder.textContent = '✧';

      grid.appendChild(placeholder);
    }

    visibleIds = nextIds;
  }

  function renderLog() {
    const list = $('actionLog');

    const unseen = game.log.filter(
      entry => entry.id > lastRenderedLogId
    );

    for (const entry of unseen) {
      const item = document.createElement('li');

      item.className = 'log-entry';
      item.dataset.kind = entry.kind;

      const marker = document.createElement('span');
      marker.className = 'log-icon';
      marker.setAttribute('aria-hidden', 'true');

      marker.textContent = ({
        good: '✦',
        bad: '!',
        special: '◇',
        muted: '·'
      })[entry.kind] || '›';

      const text = document.createElement('span');
      text.textContent = entry.message;

      item.append(marker, text);
      list.appendChild(item);

      lastRenderedLogId = entry.id;
    }

    while (list.children.length > 150) {
      list.firstChild.remove();
    }

    if (unseen.length) {
      list.scrollTop = list.scrollHeight;
    }
  }

  function renderDebug() {
    $('seedInfo').textContent = game.seed === null
      ? 'random (not reproducible)'
      : game.seed;

    $('deckDebug').textContent =
      `Top → bottom (${game.deck.length}):\n` +
      `${game.deck.map(E.cardLabel).join('  →  ') || '(empty)'}\n\n` +
      `In room: ${game.room.map(E.cardLabel).join('  ') || '(empty)'}\n` +
      `Last room avoided: ${game.lastRoomAvoided ? 'yes' : 'no'}\n` +
      `Potion already used this room: ${game.potionUsed ? 'yes' : 'no'}\n` +
      `Card accounting: ${E.cardCount(game)} / 44`;
  }

  function render() {
    renderHud();
    renderRoom();
    renderLog();
    renderDebug();

    Store.save(game);

    if (game.status !== 'playing') {
      showResult();
    }
  }

  function resetView() {
    visibleIds = new Set();
    lastRenderedLogId = 0;

    $('actionLog').replaceChildren();

    for (const dialog of Object.values(dialogs)) {
      closeDialog(dialog);
    }
  }

  function playAction(action, focusNext = false) {
    const result = action();

    if (!result.ok) {
      announce(result.error);
      return;
    }

    render();

    const lastMessage =
      game.log[game.log.length - 1]?.message || '';

    announce(lastMessage);

    if (focusNext && game.status === 'playing') {
      const first = $('roomGrid')
        .querySelector('.playing-card:not(:disabled)');

      if (first) {
        first.focus({ preventScroll: true });
      }
    }
  }

  function selectCard(card) {
    if (game.status !== 'playing') return;

    if (card.type === 'monster') {
      pendingMonsterId = card.id;

      const preview = E.previewMonster(game, card);

      $('battleTitle').textContent =
        `Face ${E.cardLabel(card)}?`;

      $('battleBadge').textContent = E.SUITS[card.suit];

      $('bareFightDescription').textContent =
        `Take ${preview.bareDamage} damage${
          preview.bareDamage >= game.health ? ' · FATAL' : ''
        }`;

      $('useBareBtn').classList.toggle(
        'dangerous',
        preview.bareDamage >= game.health
      );

      $('useWeaponBtn').disabled = !preview.canUseWeapon;

      $('weaponFightDescription').textContent =
        preview.canUseWeapon
          ? `Use ${E.cardLabel(game.weapon.card)} · take ${preview.weaponDamage} damage${
              preview.weaponDamage >= game.health ? ' · FATAL' : ''
            }`
          : game.weapon
            ? `Not allowed: target exceeds last defeated (${game.weapon.lastDefeated})`
            : 'No weapon equipped';

      $('useWeaponBtn').classList.toggle(
        'dangerous',
        preview.canUseWeapon &&
          preview.weaponDamage >= game.health
      );

      $('battleHint').textContent =
        preview.canUseWeapon && preview.weaponDamage === 0
          ? `A clean weapon victory adds this monster to your weapon stack and sets the next allowed maximum to ${card.value}.`
          : 'Only a 0-damage weapon victory updates the weapon limit. Bare-handed combat never changes it.';

      openDialog(dialogs.battle);

      if (preview.canUseWeapon) {
        $('useWeaponBtn').focus();
      } else {
        $('useBareBtn').focus();
      }

      return;
    }

    playAction(() => E.resolveCard(game, card.id), true);
  }

  function fight(mode) {
    const id = pendingMonsterId;

    pendingMonsterId = null;
    closeDialog(dialogs.battle);

    if (id) {
      playAction(
        () => E.resolveCard(game, id, mode),
        true
      );
    }
  }

  function showResult() {
    const won = game.status === 'won';

    dialogs.result.classList.toggle('is-loss', !won);

    $('resultMark').textContent = won ? '✦' : '♠';

    $('resultEyebrow').textContent = won
      ? 'THE DUNGEON IS CLEARED'
      : 'YOUR JOURNEY ENDS HERE';

    $('resultTitle').textContent = won
      ? 'You survived.'
      : 'The dungeon won.';

    $('resultCopy').textContent = won
      ? `All 44 cards resolved. You escaped with ${game.health} of 20 health points.`
      : `Your health reached zero. ${E.monstersRemaining(game)} monster strength remains unresolved.`;

    $('resultScore').textContent =
      game.score > 0 ? `+${game.score}` : String(game.score);

    openDialog(dialogs.result);
  }

  function startNew(seed) {
    resetView();
    game = E.newGame(seed);
    render();

    announce(
      'New dungeon started. Choose three cards or avoid the room.'
    );
  }

  function startRestart() {
    resetView();
    game = E.restart(game);
    render();

    announce(
      'Dungeon restarted with the original card order.'
    );
  }

  function requestReset(action, seed = null) {
    const started =
      E.CARD_COUNT - game.deck.length - game.room.length > 0 ||
      game.turn > 1;

    if (game.status !== 'playing' || !started) {
      if (action === 'restart') {
        startRestart();
      } else {
        startNew(seed);
      }
      return;
    }

    pendingAction = action;
    pendingSeed = seed;

    $('confirmTitle').textContent = action === 'restart'
      ? 'Replay this dungeon?'
      : 'Leave this dungeon?';

    $('confirmText').textContent = action === 'restart'
      ? 'Your progress will reset, but the original shuffled deck will stay exactly the same.'
      : 'Your current progress will be replaced with a newly shuffled dungeon.';

    $('confirmActionBtn').textContent = action === 'restart'
      ? 'Restart dungeon'
      : 'Start new game';

    openDialog(dialogs.confirm);
    $('confirmActionBtn').focus();
  }

  // ============================================================
  // MAIN CONTROLS
  // ============================================================

  listen($('helpBtn'), 'click', () => {
    openDialog(dialogs.rules);
  });

  listen($('newGameBtn'), 'click', () => {
    requestReset('new');
  });

  listen($('restartBtn'), 'click', () => {
    requestReset('restart');
  });

  listen($('avoidBtn'), 'click', () => {
    playAction(() => E.avoidRoom(game));
  });

  listen($('useWeaponBtn'), 'click', () => {
    fight('weapon');
  });

  listen($('useBareBtn'), 'click', () => {
    fight('bare');
  });

  listen($('resultNewBtn'), 'click', () => {
    startNew(null);
  });

  listen($('resultRestartBtn'), 'click', startRestart);

  listen($('seedBtn'), 'click', () => {
    requestReset('new', $('seedInput').value);
  });

  listen($('seedInput'), 'keydown', event => {
    if (event.key === 'Enter') {
      event.preventDefault();
      requestReset('new', $('seedInput').value);
    }
  });

  listen($('confirmActionBtn'), 'click', () => {
    const action = pendingAction;
    const seed = pendingSeed;

    closeDialog(dialogs.confirm);

    pendingAction = null;
    pendingSeed = null;

    if (action === 'restart') {
      startRestart();
    } else if (action === 'new') {
      startNew(seed);
    }
  });

  root.querySelectorAll('[data-close]').forEach(button => {
    listen(button, 'click', () => {
      closeDialog($(button.dataset.close));
    });
  });

  listen(dialogs.battle, 'close', () => {
    pendingMonsterId = null;
  });

  listen(dialogs.confirm, 'close', () => {
    pendingAction = null;
    pendingSeed = null;
  });

  // ============================================================
  // KEYBOARD NAVIGATION
  // ============================================================

  listen($('roomGrid'), 'keydown', event => {
    if (![
      'ArrowRight',
      'ArrowLeft',
      'ArrowDown',
      'ArrowUp',
      'Home',
      'End'
    ].includes(event.key)) {
      return;
    }

    const cards = [
      ...$('roomGrid')
        .querySelectorAll('.playing-card:not(:disabled)')
    ];

    const current = cards.indexOf(document.activeElement);

    if (current < 0) return;

    event.preventDefault();

    let next = current;

    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = cards.length - 1;
    } else {
      const direction =
        ['ArrowRight', 'ArrowDown'].includes(event.key)
          ? 1
          : -1;

      next =
        (current + direction + cards.length) % cards.length;
    }

    cards[next].focus();
  });

  listen(document, 'keydown', event => {
    if (
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.repeat
    ) {
      return;
    }

    const tag = document.activeElement?.tagName;

    if ([
      'INPUT',
      'TEXTAREA',
      'SELECT',
      'BUTTON',
      'SUMMARY'
    ].includes(tag)) {
      return;
    }

    if (Object.values(dialogs).some(dialog => dialog.open)) {
      return;
    }

    if (
      event.key.toLowerCase() === 'h' ||
      event.key === '?'
    ) {
      event.preventDefault();
      openDialog(dialogs.rules);
    }

    if (
      event.key.toLowerCase() === 'a' &&
      E.canAvoid(game)
    ) {
      event.preventDefault();
      playAction(() => E.avoidRoom(game));
    }

    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      requestReset('new');
    }

    if (event.key.toLowerCase() === 'r') {
      event.preventDefault();
      requestReset('restart');
    }
  });

  // Initial rendering
  render();
  return () => {
    subscriptions.abort();
    for (const dialog of Object.values(dialogs)) closeDialog(dialog);
  };
}