/**
 * Sugar Rush 1000–style engine (demo, currency: Вардин 1:1 ₽).
 *
 * Multiplier spots (original rules):
 * 1) first explode on a cell → mark
 * 2) second explode → ×2
 * 3) each further explode → ×4, ×8, ×16 … ×1024
 * Cluster win uses sum of multipliers on its cells (min 1×).
 * Base game: marks reset after spin. Free spins: sticky.
 */

import { payForCluster, pickWeightedSymbol } from './symbols.js';

export const GRID_SIZE = 7;
export const MIN_CLUSTER = 5;
export const FREE_SPINS_START = 10;
export const FREE_SPINS_RETRIGGER = 5;
export const CURRENCY = 'Вардин';
export const START_BALANCE = 100_000;
export const BET_STEPS = [10, 20, 40, 50, 80, 100, 200, 400, 500, 1000];
export const BUY_BONUS_COST_MULT = 100;
export const BUY_SUPER_COST_MULT = 500;
export const MULT_LADDER = [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024];

const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

function idx(r, c) {
  return r * GRID_SIZE + c;
}

function inBounds(r, c) {
  return r >= 0 && r < GRID_SIZE && c >= 0 && c < GRID_SIZE;
}

function createEmptyGrid(fill = null) {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, () => fill);
}

export function nextMultiplier(current) {
  if (!current || current <= 0) return MULT_LADDER[0];
  const i = MULT_LADDER.indexOf(current);
  if (i === -1) return Math.min(current * 2, MULT_LADDER.at(-1));
  return MULT_LADDER[Math.min(i + 1, MULT_LADDER.length - 1)];
}

/** Concentric Super Free Spins preload (centre ×16 → edges ×2). */
export function buildSuperMultiplierGrid() {
  const center = (GRID_SIZE - 1) / 2;
  const grid = createEmptyGrid(0);
  for (let r = 0; r < GRID_SIZE; r += 1) {
    for (let c = 0; c < GRID_SIZE; c += 1) {
      const dist = Math.max(Math.abs(r - center), Math.abs(c - center));
      let m = 2;
      if (dist === 0) m = 16;
      else if (dist === 1) m = 8;
      else if (dist === 2) m = 4;
      grid[idx(r, c)] = m;
    }
  }
  return grid;
}

export function createGameState(seedRandom = Math.random) {
  return {
    symbols: createEmptyGrid(null),
    multipliers: createEmptyGrid(0),
    marks: createEmptyGrid(false),
    balance: START_BALANCE,
    bet: 100,
    betIndex: BET_STEPS.indexOf(100),
    lastWin: 0,
    totalBonusWin: 0,
    mode: 'base', // base | bonus | super
    spinsLeft: 0,
    busy: false,
    finishedBonus: false,
    random: seedRandom,
  };
}

export function fillEmptyCells(state) {
  for (let i = 0; i < state.symbols.length; i += 1) {
    if (!state.symbols[i]) state.symbols[i] = pickWeightedSymbol(state.random);
  }
}

export function findClusters(symbols) {
  const visited = new Array(symbols.length).fill(false);
  const clusters = [];

  for (let start = 0; start < symbols.length; start += 1) {
    const id = symbols[start];
    if (!id || visited[start]) continue;

    const queue = [start];
    const cells = [];
    visited[start] = true;

    while (queue.length) {
      const cur = queue.pop();
      cells.push(cur);
      const r = Math.floor(cur / GRID_SIZE);
      const c = cur % GRID_SIZE;

      for (const [dr, dc] of DIRS) {
        const nr = r + dr;
        const nc = c + dc;
        if (!inBounds(nr, nc)) continue;
        const ni = idx(nr, nc);
        if (visited[ni] || symbols[ni] !== id) continue;
        visited[ni] = true;
        queue.push(ni);
      }
    }

    if (cells.length >= MIN_CLUSTER) {
      clusters.push({ symbolId: id, cells });
    }
  }

  return clusters;
}

/**
 * Apply Sugar Rush mark → ×2 → ×4… on exploded cells.
 * Returns per-cell upgrade info for animation.
 */
export function applyExplodeMarks(state, winningCells) {
  const upgrades = [];
  const unique = [...new Set(winningCells)];

  for (const cell of unique) {
    const before = {
      marked: state.marks[cell],
      mult: state.multipliers[cell] || 0,
    };

    if (state.multipliers[cell] > 0) {
      state.multipliers[cell] = nextMultiplier(state.multipliers[cell]);
      state.marks[cell] = true;
    } else if (state.marks[cell]) {
      state.multipliers[cell] = MULT_LADDER[0]; // ×2
    } else {
      state.marks[cell] = true;
    }

    upgrades.push({
      cell,
      before,
      after: {
        marked: state.marks[cell],
        mult: state.multipliers[cell] || 0,
      },
    });
  }

  return upgrades;
}

function applyGravityWithFalls(symbols) {
  const fallDistance = createEmptyGrid(0);

  for (let c = 0; c < GRID_SIZE; c += 1) {
    const stack = [];
    for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
      const i = idx(r, c);
      if (symbols[i]) stack.push({ id: symbols[i], fromR: r });
    }
    let writeR = GRID_SIZE - 1;
    for (const item of stack) {
      const to = idx(writeR, c);
      symbols[to] = item.id;
      // row 0 = top; falling down increases row index
      fallDistance[to] = writeR - item.fromR;
      writeR -= 1;
    }
    while (writeR >= 0) {
      const to = idx(writeR, c);
      symbols[to] = null;
      fallDistance[to] = 0;
      writeR -= 1;
    }
  }

  return { fallDistance };
}

export function resolveTumbleStep(state) {
  const clusters = findClusters(state.symbols);
  if (!clusters.length) return null;

  const symbolsBefore = [...state.symbols];
  const multipliersBefore = [...state.multipliers];
  const marksBefore = [...state.marks];

  let stepWin = 0;
  const winningCells = [];
  const clusterDetails = [];

  for (const cluster of clusters) {
    const base = payForCluster(cluster.symbolId, cluster.cells.length);
    let multSum = 0;
    for (const cell of cluster.cells) {
      multSum += state.multipliers[cell] || 0;
      winningCells.push(cell);
    }
    const applied = Math.max(1, multSum);
    const win = +(base * state.bet * applied).toFixed(2);
    stepWin += win;
    clusterDetails.push({
      symbolId: cluster.symbolId,
      size: cluster.cells.length,
      cells: [...cluster.cells],
      base,
      multSum: applied,
      win,
    });
  }

  const uniqueWins = [...new Set(winningCells)];
  for (const cell of uniqueWins) state.symbols[cell] = null;

  // Marks/multipliers update on exploded positions (original rule).
  const upgrades = applyExplodeMarks(state, uniqueWins);

  const { fallDistance } = applyGravityWithFalls(state.symbols);

  // Fill empties from top; new pieces drop in from above the board.
  for (let c = 0; c < GRID_SIZE; c += 1) {
    let empties = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (!state.symbols[idx(r, c)]) empties += 1;
    }
    let spawn = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      const i = idx(r, c);
      if (!state.symbols[i]) {
        state.symbols[i] = pickWeightedSymbol(state.random);
        fallDistance[i] = r + 1 + (empties - spawn);
        spawn += 1;
      }
    }
  }

  return {
    clusters: clusterDetails,
    winningCells: uniqueWins,
    stepWin: +stepWin.toFixed(2),
    upgrades,
    fallDistance: [...fallDistance],
    symbolsBefore,
    multipliersBefore,
    marksBefore,
    symbolsAfter: [...state.symbols],
    multipliersAfter: [...state.multipliers],
    marksAfter: [...state.marks],
  };
}

function resetMarksIfBase(state) {
  if (state.mode === 'base') {
    state.marks = createEmptyGrid(false);
    state.multipliers = createEmptyGrid(0);
  }
}

function runCascades(state) {
  const steps = [];
  let spinWin = 0;
  let guard = 0;
  while (guard < 48) {
    const step = resolveTumbleStep(state);
    if (!step) break;
    steps.push(step);
    spinWin += step.stepWin;
    guard += 1;
  }
  return { steps, spinWin: +spinWin.toFixed(2) };
}

export function canAfford(state, amount) {
  return state.balance + 1e-9 >= amount;
}

export function changeBet(state, dir) {
  const next = Math.max(0, Math.min(BET_STEPS.length - 1, state.betIndex + dir));
  state.betIndex = next;
  state.bet = BET_STEPS[next];
  return state.bet;
}

export function playBaseSpin(state) {
  if (state.mode !== 'base' || state.busy) {
    return { ok: false, reason: 'busy' };
  }
  if (!canAfford(state, state.bet)) {
    return { ok: false, reason: 'funds' };
  }

  state.balance = +(state.balance - state.bet).toFixed(2);
  state.lastWin = 0;
  resetMarksIfBase(state);

  state.symbols = createEmptyGrid(null);
  fillEmptyCells(state);

  const opening = {
    symbols: [...state.symbols],
    multipliers: [...state.multipliers],
    marks: [...state.marks],
  };

  const { steps, spinWin } = runCascades(state);
  state.lastWin = spinWin;
  state.balance = +(state.balance + spinWin).toFixed(2);

  // Base: clear marks after spin sequence ends.
  resetMarksIfBase(state);

  return {
    ok: true,
    opening,
    steps,
    spinWin,
    balance: state.balance,
    multipliers: [...state.multipliers],
    marks: [...state.marks],
    symbols: [...state.symbols],
  };
}

function startBonus(state, { superBonus = false } = {}) {
  state.mode = superBonus ? 'super' : 'bonus';
  state.spinsLeft = FREE_SPINS_START;
  state.totalBonusWin = 0;
  state.finishedBonus = false;
  state.lastWin = 0;

  if (superBonus) {
    state.multipliers = buildSuperMultiplierGrid();
    state.marks = state.multipliers.map((m) => m > 0);
  } else {
    state.multipliers = createEmptyGrid(0);
    state.marks = createEmptyGrid(false);
  }

  state.symbols = createEmptyGrid(null);
  fillEmptyCells(state);
}

export function buyBonus(state, { superBonus = false } = {}) {
  if (state.mode !== 'base' || state.busy) {
    return { ok: false, reason: 'busy' };
  }
  const costMult = superBonus ? BUY_SUPER_COST_MULT : BUY_BONUS_COST_MULT;
  const cost = state.bet * costMult;
  if (!canAfford(state, cost)) {
    return { ok: false, reason: 'funds', cost };
  }

  state.balance = +(state.balance - cost).toFixed(2);
  startBonus(state, { superBonus });

  return {
    ok: true,
    cost,
    mode: state.mode,
    spinsLeft: state.spinsLeft,
    balance: state.balance,
    symbols: [...state.symbols],
    multipliers: [...state.multipliers],
    marks: [...state.marks],
  };
}

export function playFreeSpin(state) {
  if ((state.mode !== 'bonus' && state.mode !== 'super') || state.spinsLeft <= 0) {
    return { ok: false, done: true };
  }

  state.spinsLeft -= 1;
  state.symbols = createEmptyGrid(null);
  fillEmptyCells(state);

  const opening = {
    symbols: [...state.symbols],
    multipliers: [...state.multipliers],
    marks: [...state.marks],
  };

  const { steps, spinWin } = runCascades(state);
  state.lastWin = spinWin;
  state.totalBonusWin = +(state.totalBonusWin + spinWin).toFixed(2);
  state.balance = +(state.balance + spinWin).toFixed(2);

  let retrigger = 0;
  const hadBig = steps.some((s) => s.clusters.some((c) => c.size >= 10));
  if (hadBig || state.random() < 0.035) {
    retrigger = FREE_SPINS_RETRIGGER;
    state.spinsLeft += retrigger;
  }

  const done = state.spinsLeft <= 0;
  if (done) {
    state.finishedBonus = true;
    state.mode = 'base';
    state.marks = createEmptyGrid(false);
    state.multipliers = createEmptyGrid(0);
  }

  return {
    ok: true,
    opening,
    steps,
    spinWin,
    retrigger,
    spinsLeft: state.spinsLeft,
    totalBonusWin: state.totalBonusWin,
    balance: state.balance,
    multipliers: [...state.multipliers],
    marks: [...state.marks],
    symbols: [...state.symbols],
    done,
  };
}

export function formatVardin(n) {
  return `${n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ${CURRENCY}`;
}

export function formatVardinShort(n) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
