importScripts('game-core.js');
self.onmessage = function (event) {
  const { level, state, id } = event.data;
  try { self.postMessage({ id, ...RollCore.solve(level, state, 250000) }); }
  catch (error) { self.postMessage({ id, error: error.message, route: null, exhausted: false }); }
};
