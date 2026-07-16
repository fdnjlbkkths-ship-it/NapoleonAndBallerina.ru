import assert from 'node:assert/strict';
import {
  GRID_SIZE,
  MIN_CLUSTER,
  MULT_LADDER,
  createGameState,
  fillEmptyCells,
  findClusters,
  applyExplodeMarks,
  resolveTumbleStep,
  playBaseSpin,
  buyBonus,
  playFreeSpin,
  buildSuperMultiplierGrid,
  nextMultiplier,
  multTier,
} from './engine.js';

function seeded(seed = 1) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill('cake');
  assert.equal(findClusters(symbols).length, 1);
}

{
  const symbols = Array(GRID_SIZE * GRID_SIZE).fill(null);
  for (let i = 0; i < MIN_CLUSTER - 1; i += 1) symbols[i] = 'eclair';
  assert.equal(findClusters(symbols).length, 0);
}

// All cells start at ×2; each explode doubles
{
  const state = createGameState(seeded(1));
  assert.ok(state.multipliers.every((m) => m === 2));

  const cell = 10;
  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 4);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 8);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 16);
}

{
  assert.equal(nextMultiplier(512), 1024);
  assert.equal(nextMultiplier(1024), 1024);
  assert.equal(MULT_LADDER.at(-1), 1024);
  assert.equal(multTier(2), 2);
  assert.equal(multTier(32), 32);
  assert.equal(multTier(1024), 1024);
}

{
  const grid = buildSuperMultiplierGrid();
  const center = Math.floor((GRID_SIZE * GRID_SIZE) / 2);
  assert.equal(grid[center], 16);
  assert.ok(grid.every((m) => m >= 2));
}

{
  const state = createGameState(seeded(99));
  state.symbols = Array(GRID_SIZE * GRID_SIZE).fill('berry');
  const step = resolveTumbleStep(state);
  assert.ok(step);
  assert.ok(step.stepWin > 0);
  // Every exploded cell went ×2 → ×4
  for (const cell of step.winningCells) {
    assert.equal(step.multipliersAfter[cell], 4);
  }
}

{
  const state = createGameState(seeded(3));
  fillEmptyCells(state);
  const spin = playBaseSpin(state);
  assert.equal(spin.ok, true);
  // Base resets to all ×2 after spin
  assert.ok(state.multipliers.every((m) => m === 2));
}

{
  const state = createGameState(seeded(11));
  state.bet = 100;
  const bought = buyBonus(state, { superBonus: false });
  assert.equal(bought.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.ok(state.multipliers.every((m) => m === 2));

  state.multipliers[0] = 8;
  const fs = playFreeSpin(state);
  assert.equal(fs.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.ok(state.multipliers[0] >= 8);
}

console.log('engine.test.mjs: all passed');
