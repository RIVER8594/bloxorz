(function (root) {
  'use strict';
  const DIRECTIONS = ['UP', 'RIGHT', 'DOWN', 'LEFT'];
  const clone = value => JSON.parse(JSON.stringify(value));
  const identity = [1, 0, 0, 0, 1, 0, 0, 0, 1];

  function compile(spec) {
    const width = Math.max(...spec.map.map(row => row.length));
    const tiles = spec.map.map(row => row.padEnd(width, '.').split(''));
    const mechanisms = spec.mechanisms || [];
    const bySymbol = Object.fromEntries(mechanisms.map((m, index) => [m.symbol, { ...m, index }]));
    let start, exit;
    tiles.forEach((row, r) => row.forEach((symbol, c) => {
      if (symbol === 'S') start = { r, c };
      if (symbol === 'E') exit = { r, c };
    }));
    if (!start || !exit) throw new Error('地图缺少起点或出口：' + spec.name);
    const required = (spec.required || []).reduce((mask, symbol) => mask | (1 << bySymbol[symbol].index), 0);
    return { ...spec, tiles, width, height: tiles.length, mechanisms, bySymbol, start, exit, requiredMask: required };
  }

  function initial(level) {
    return { ...level.start, pose: 'V', rotation: identity.slice(), activated: 0, echo: null, broken: [], moves: 0, status: 'playing', reason: '' };
  }

  function cells(state) {
    if (state.pose === 'V') return [{ r: state.r, c: state.c }];
    if (state.pose === 'ROW') return [{ r: state.r, c: state.c }, { r: state.r + 1, c: state.c }];
    return [{ r: state.r, c: state.c }, { r: state.r, c: state.c + 1 }];
  }

  function downEnd(state) {
    if (state.pose !== 'V') return 'side';
    return state.rotation[4] > 0 ? 'feet' : 'head';
  }

  function rotate(rotation, dir) {
    const output = [];
    for (let i = 0; i < 9; i += 3) {
      const [x, y, z] = rotation.slice(i, i + 3);
      const v = dir === 'DOWN' ? [x, -z, y] : dir === 'UP' ? [x, z, -y] : dir === 'RIGHT' ? [y, -x, z] : [-y, x, z];
      output.push(...v.map(n => n || 0));
    }
    return output;
  }

  function rolled(state, dir) {
    const next = clone(state);
    if (state.pose === 'V') {
      if (dir === 'UP') { next.r -= 2; next.pose = 'ROW'; }
      if (dir === 'DOWN') { next.r += 1; next.pose = 'ROW'; }
      if (dir === 'LEFT') { next.c -= 2; next.pose = 'COL'; }
      if (dir === 'RIGHT') { next.c += 1; next.pose = 'COL'; }
    } else if (state.pose === 'ROW') {
      if (dir === 'UP') { next.r -= 1; next.pose = 'V'; }
      if (dir === 'DOWN') { next.r += 2; next.pose = 'V'; }
      if (dir === 'LEFT') next.c -= 1;
      if (dir === 'RIGHT') next.c += 1;
    } else {
      if (dir === 'LEFT') { next.c -= 1; next.pose = 'V'; }
      if (dir === 'RIGHT') { next.c += 2; next.pose = 'V'; }
      if (dir === 'UP') next.r -= 1;
      if (dir === 'DOWN') next.r += 1;
    }
    next.rotation = rotate(state.rotation, dir);
    next.moves += 1;
    return next;
  }

  function pressed(level, state) {
    if (state.pose !== 'V' || state.status === 'failed') return null;
    const m = level.bySymbol[level.tiles[state.r]?.[state.c]];
    return m?.kind === 'echo' ? m : null;
  }

  function bridgeOpen(level, state, symbol) {
    const m = level.mechanisms.find(item => item.bridge === symbol);
    if (!m) return false;
    const index = level.bySymbol[m.symbol].index;
    if (m.kind !== 'echo') return Boolean(state.activated & (1 << index));
    const p = pressed(level, state);
    return p?.index === index || (state.echo?.index === index && state.echo.remaining > 0);
  }

  function support(level, state, control = state) {
    for (const cell of cells(state)) {
      const symbol = level.tiles[cell.r]?.[cell.c];
      if (!symbol || symbol === '.' || state.broken.includes(cell.r + ',' + cell.c)) return 'void';
      if (/^[a-z]$/.test(symbol) && !bridgeOpen(level, control, symbol)) return 'bridge';
      if (symbol === 'I' && state.pose === 'V') return 'ice';
    }
    return null;
  }

  function step(level, previous, dir) {
    if (previous.status !== 'playing' || !DIRECTIONS.includes(dir)) return clone(previous);
    const next = rolled(previous, dir);
    const beforeError = support(level, next, previous);
    if (beforeError) {
      next.status = 'failed'; next.reason = beforeError;
      if (beforeError === 'ice') next.broken.push(next.r + ',' + next.c);
      return next;
    }
    let trigger = null;
    if (next.pose === 'V') {
      trigger = level.bySymbol[level.tiles[next.r]?.[next.c]];
      if (trigger && (trigger.kind === 'pressure' || trigger.kind === downEnd(next))) {
        next.activated |= 1 << trigger.index;
      }
    }
    const wasPressed = pressed(level, previous);
    const nowPressed = pressed(level, next);
    if (nowPressed) {
      next.echo = null;
    } else if (wasPressed) {
      next.echo = { index: wasPressed.index, r: previous.r, c: previous.c, rotation: previous.rotation.slice(), remaining: 3 };
    } else if (next.echo) {
      next.echo.remaining -= 1;
      if (next.echo.remaining <= 0) next.echo = null;
    }
    const afterError = support(level, next);
    if (afterError) {
      next.status = 'failed'; next.reason = 'echo';
    } else if (next.pose === 'V' && next.r === level.exit.r && next.c === level.exit.c && (next.activated & level.requiredMask) === level.requiredMask) {
      next.status = 'won';
    }
    return next;
  }

  // Gameplay depends on the head axis, not the direction of the face.
  // Keep all 24 body rotations in saved states, and merge equivalent rotations only during search.
  function key(state) {
    return [state.r, state.c, state.pose, ...state.rotation.slice(3, 6), state.activated,
      state.echo ? state.echo.index + ':' + state.echo.remaining : '-', state.broken.join(';')].join('|');
  }

  function solve(level, start = initial(level), limit = 200000) {
    if (start.status === 'failed') return { route: null, visited: 0, exhausted: true };
    if (start.status === 'won') return { route: [], visited: 1, exhausted: true };
    const queue = [{ state: start, parent: -1, dir: null }];
    const seen = new Set([key(start)]);
    for (let cursor = 0; cursor < queue.length; cursor++) {
      if (queue.length > limit) return { route: null, visited: queue.length, exhausted: false };
      for (const dir of DIRECTIONS) {
        const state = step(level, queue[cursor].state, dir);
        if (state.status === 'failed') continue;
        const stateKey = key(state);
        if (seen.has(stateKey)) continue;
        seen.add(stateKey);
        const node = { state, parent: cursor, dir };
        queue.push(node);
        if (state.status === 'won') {
          const route = [];
          let index = queue.length - 1;
          while (queue[index].parent !== -1) { route.push(queue[index].dir); index = queue[index].parent; }
          return { route: route.reverse(), visited: queue.length, exhausted: true };
        }
      }
    }
    return { route: null, visited: queue.length, exhausted: true };
  }

  const api = { DIRECTIONS, clone, compile, initial, cells, downEnd, rolled, rotate, pressed, bridgeOpen, support, step, key, solve };
  root.RollCore = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
