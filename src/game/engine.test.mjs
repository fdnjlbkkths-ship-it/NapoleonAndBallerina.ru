import assert from 'node:assert/strict';
import {
  GRID_SIZE,
  MIN_CLUSTER,
  MULT_LADDER,
  createBonusState,
  fillEmptyCells,
  findClusters,
  playFreeSpin,
  resolveTumbleStep,
} from './engine.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// Cluster detection
{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill('cake');
  const clusters = findClusters(symbols);
  assert.equal(clusters.length, 1);
  assert.equal(clusters[0].cells.length, GRID_SIZE * GRID_SIZE);
}

// No cluster below threshold
{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill(null);
  for (let i = 0; i < MIN_CLUSTER - 1; i += 1) symbols[i] = 'eclair';
  assert.equal(findClusters(symbols).length, 0);
}

// Sticky multipliers persist across free spins
{
  const state = createBonusState(seeded(42));
  state.multipliers[0] = 2;
  state.multipliers[3] = 4;
  fillEmptyCells(state);
  const before = [...state.multipliers];
  playFreeSpin(state);
  // Cells that had multipliers should still be >= previous (sticky / upgrade)
  assert.ok(state.multipliers[0] >= before[0]);
  assert.ok(state.multipliers[3] >= before[3]);
}

// Ladder caps at 1024
{
  assert.equal(MULT_LADDER[MULT_LADDER.length - 1], 1024);
}

// Full bonus run finishes
{
  const state = createBonusState(seeded(7));
  fillEmptyCells(state);
  let guard = 0;
  while (!state.finished && guard < 200) {
    playFreeSpin(state);
    guard += 1;
  }
  assert.equal(state.finished, true);
  assert.ok(state.sweetPoints >= 0);
}

// Tumble step snapshot shape
{
  const state = createBonusState(seeded(99));
  state.symbols = Array(GRID_SIZE * GRID_SIZE).fill('berry');
  state.multipliers = Array(GRID_SIZE * GRID_SIZE).fill(0);
  state.multipliers[10] = 2;
  const step = resolveTumbleStep(state);
  assert.ok(step);
  assert.ok(step.symbolsBefore);
  assert.ok(step.symbolsAfter);
  assert.ok(step.stepWin > 0);
}

console.log('engine.test.mjs: all passed');
