const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../game-core');
const specs = require('../levels');
const results = [];
assert.equal(specs.length, 10);

for (let index = 0; index < specs.length; index++) {
  const spec = specs[index], level = C.compile(spec);
  const answer = C.solve(level);
  assert.ok(answer.route, `${level.name} must be solvable`);
  let state = C.initial(level), ice = false, echo = false, countdowns = new Set();
  for (const direction of answer.route) {
    const before = C.clone(state), restored = JSON.parse(JSON.stringify(before));
    state = C.step(level, state, direction);
    assert.notEqual(state.status, 'failed');
    assert.deepEqual(before, restored, 'a saved undo snapshot must not mutate');
    assert.equal(state.rotation[3] ** 2 + state.rotation[4] ** 2 + state.rotation[5] ** 2, 1);
    assert.equal(state.rotation[4] === 0, state.pose !== 'V', 'the body axis and footprint must agree');
    ice ||= C.cells(state).some(cell => level.tiles[cell.r][cell.c] === 'I');
    echo ||= Boolean(state.echo);
    if (state.echo) countdowns.add(state.echo.remaining);
    assert.equal(C.support(level, state), null);
  }
  assert.equal(state.status, 'won');
  assert.equal(state.activated & level.requiredMask, level.requiredMask);
  if (spec.map.some(row => row.includes('I'))) {
    assert.ok(ice, level.name + ' must use ice in its reference solution');
    const noIce = C.clone(spec); noIce.map = noIce.map.map(row => row.replaceAll('I', '.'));
    assert.equal(C.solve(C.compile(noIce)).route, null, level.name + ' must not bypass ice');
  }
  if (spec.mechanisms?.some(m => m.kind === 'echo')) {
    assert.ok(echo); assert.ok(countdowns.has(3)); assert.ok(countdowns.has(2)); assert.ok(countdowns.has(1));
  }
  results.push({ number: index + 1, name: level.name, chapter: level.chapter, shortest: answer.route.length, route: answer.route, visited: answer.visited });
}

// A temporary bridge closes on the third subsequent action, including the action landing on it.
const echoLevel = C.compile({ name: 'echo boundary', map: ['S#######', '########', '####Tttt', '########', '#######E'], mechanisms: [{ symbol: 'T', kind: 'echo', bridge: 't' }] });
let e = C.initial(echoLevel); e.r = 2; e.c = 4;
e = C.step(echoLevel, e, 'RIGHT'); assert.equal(e.echo.remaining, 3);
e = C.step(echoLevel, e, 'RIGHT'); assert.equal(e.echo.remaining, 2);
e = C.step(echoLevel, e, 'LEFT'); assert.equal(e.echo.remaining, 1);
const failed = C.step(echoLevel, e, 'RIGHT'); assert.equal(failed.reason, 'echo'); assert.equal(failed.status, 'failed');
assert.equal(e.echo.remaining, 1, 'failure must leave the undo snapshot untouched');
const refreshed = C.clone(e); refreshed.r = 0; refreshed.c = 0; refreshed.pose = 'V'; refreshed.rotation = C.initial(echoLevel).rotation;
assert.equal(C.step(echoLevel, refreshed, 'RIGHT').echo, null);

// A failed standing landing breaks thin ice; undo restores the entire preceding snapshot.
const iceLevel = C.compile({ name: 'ice', map: ['S##IE'] });
const iceBefore = C.step(iceLevel, C.initial(iceLevel), 'RIGHT');
const iceAfter = C.step(iceLevel, iceBefore, 'RIGHT');
assert.equal(iceAfter.reason, 'ice'); assert.equal(iceAfter.broken.length, 1); assert.equal(iceBefore.broken.length, 0);

// Standing alone is insufficient for a rune: the correct body endpoint is required.
const runeLevel = C.compile({ name: 'rune', map: ['S##D##E'], mechanisms: [{ symbol: 'D', kind: 'head' }], required: ['D'] });
const correct = C.step(runeLevel, C.step(runeLevel, C.initial(runeLevel), 'RIGHT'), 'RIGHT');
assert.equal(correct.pose, 'V'); assert.equal(C.downEnd(correct), 'head'); assert.equal(correct.activated, 1);
const inverted = C.initial(runeLevel); inverted.rotation = [1, 0, 0, 0, -1, 0, 0, 0, -1];
const wrong = C.step(runeLevel, C.step(runeLevel, inverted, 'RIGHT'), 'RIGHT');
assert.equal(wrong.pose, 'V'); assert.equal(C.downEnd(wrong), 'feet'); assert.equal(wrong.activated, 0); assert.equal(wrong.status, 'playing');

fs.writeFileSync(path.join(__dirname, '../level-solutions.json'), JSON.stringify(results, null, 2) + '\n');
console.table(results.map(({ number, name, shortest, visited }) => ({ number, name, shortest, visited })));
console.log('10 levels solved; ice, body endpoint, bridge countdown, support and snapshot boundaries verified.');
