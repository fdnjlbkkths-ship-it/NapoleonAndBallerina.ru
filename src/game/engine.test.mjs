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

// Mark → ×2 → ×4 → ×8
{
  const state = createGameState(seeded(1));
  const cell = 10;
  applyExplodeMarks(state, [cell]);
  assert.equal(state.marks[cell], true);
  assert.equal(state.multipliers[cell], 0);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 2);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 4);

  applyExplodeMarks(state, [cell]);
  assert.equal(state.multipliers[cell], 8);
}

{
  assert.equal(nextMultiplier(512), 1024);
  assert.equal(nextMultiplier(1024), 1024);
  assert.equal(MULT_LADDER.at(-1), 1024);
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
  state.multipliers[5] = 2;
  state.marks[5] = true;
  const step = resolveTumbleStep(state);
  assert.ok(step);
  assert.ok(step.stepWin > 0);
  assert.ok(step.upgrades.length > 0);
  // Cell 5 had ×2 and exploded → should become ×4
  const up = step.upgrades.find((u) => u.cell === 5);
  assert.ok(up);
  assert.equal(up.after.mult, 4);
}

{
  const state = createGameState(seeded(3));
  fillEmptyCells(state);
  const spin = playBaseSpin(state);
  assert.equal(spin.ok, true);
  // Base resets marks after spin
  assert.ok(state.marks.every((m) => m === false));
  assert.ok(state.multipliers.every((m) => m === 0));
}

{
  const state = createGameState(seeded(11));
  state.bet = 100;
  const bought = buyBonus(state, { superBonus: false });
  assert.equal(bought.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.equal(state.spinsLeft, 10);

  // Sticky: plant a multiplier and ensure it survives a free spin
  state.multipliers[0] = 8;
  state.marks[0] = true;
  const fs = playFreeSpin(state);
  assert.equal(fs.ok, true);
  assert.equal(state.mode, 'bonus');
  assert.ok(state.multipliers[0] >= 8);
}

console.log('engine.test.mjs: all passed');
