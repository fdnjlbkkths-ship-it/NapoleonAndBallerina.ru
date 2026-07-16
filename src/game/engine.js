/**
 * Sugar Rush 1000–style bonus engine (cosmetics only).
 *
 * - 7×7 grid, cluster pays (5+ orthogonal)
 * - Cascading tumbles
 * - Sticky multipliers that upgrade: 2 → 4 → … → 1024 (1000x family)
 * - Free spins with persistent multipliers between spins
 */

import { payForCluster, pickWeightedSymbol } from './symbols.js';

export const GRID_SIZE = 7;
export const MIN_CLUSTER = 5;
export const FREE_SPINS_START = 10;
export const FREE_SPINS_RETRIGGER = 5;
export const SCATTER_CHANCE = 0.04;

/** Sugar Rush 1000 multiplier ladder (caps at 1024 ≈ «1000»). */
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

function nextMultiplier(current) {
  if (!current || current <= 0) return MULT_LADDER[0];
  const i = MULT_LADDER.indexOf(current);
  if (i === -1) return Math.min(current * 2, MULT_LADDER[MULT_LADDER.length - 1]);
  return MULT_LADDER[Math.min(i + 1, MULT_LADDER.length - 1)];
}

function createEmptyGrid(fill = null) {
  return Array.from({ length: GRID_SIZE * GRID_SIZE }, () => fill);
}

export function createBonusState(seedRandom = Math.random) {
  return {
    symbols: createEmptyGrid(null),
    multipliers: createEmptyGrid(0),
    spinsLeft: FREE_SPINS_START,
    totalSpins: FREE_SPINS_START,
    sweetPoints: 0,
    lastSpinWin: 0,
    busy: false,
    finished: false,
    random: seedRandom,
  };
}

export function fillEmptyCells(state) {
  for (let i = 0; i < state.symbols.length; i += 1) {
    if (!state.symbols[i]) {
      state.symbols[i] = pickWeightedSymbol(state.random);
    }
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

function applyGravity(symbols) {
  for (let c = 0; c < GRID_SIZE; c += 1) {
    const stack = [];
    for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
      const i = idx(r, c);
      if (symbols[i]) stack.push(symbols[i]);
    }
    for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
      const i = idx(r, c);
      symbols[i] = stack.length ? stack.shift() : null;
    }
  }
}

function spawnMultipliers(state, emptyCells) {
  for (const cell of emptyCells) {
    if (state.multipliers[cell] > 0) continue;
    // Chance to plant a fresh x2 spot after a tumble (bonus feel).
    if (state.random() < 0.18) {
      state.multipliers[cell] = MULT_LADDER[0];
    }
  }
}

function upgradeMultipliersOnWin(state, winningCells) {
  const set = new Set(winningCells);
  for (const cell of set) {
    if (state.multipliers[cell] > 0) {
      state.multipliers[cell] = nextMultiplier(state.multipliers[cell]);
    } else if (state.random() < 0.35) {
      // Fresh multiplier can appear on a cleared winning cell.
      state.multipliers[cell] = MULT_LADDER[0];
    }
  }
}

/**
 * Resolve one tumble step. Returns null if no more wins.
 * Snapshots include board before and after the tumble for animation.
 */
export function resolveTumbleStep(state) {
  const clusters = findClusters(state.symbols);
  if (!clusters.length) return null;

  const symbolsBefore = [...state.symbols];
  const multipliersBefore = [...state.multipliers];

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
    const win = +(base * applied).toFixed(2);
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

  // Remove winning symbols (multipliers stay sticky).
  for (const cell of winningCells) {
    state.symbols[cell] = null;
  }

  upgradeMultipliersOnWin(state, winningCells);

  const emptied = winningCells.filter((c) => !state.symbols[c]);
  applyGravity(state.symbols);
  spawnMultipliers(state, emptied);
  fillEmptyCells(state);

  return {
    clusters: clusterDetails,
    winningCells: [...new Set(winningCells)],
    stepWin: +stepWin.toFixed(2),
    symbolsBefore,
    multipliersBefore,
    symbolsAfter: [...state.symbols],
    multipliersAfter: [...state.multipliers],
  };
}

/**
 * Play one free spin: fill board (keep sticky multipliers), cascade until done.
 * Returns a list of tumble steps for animation.
 */
export function playFreeSpin(state) {
  if (state.spinsLeft <= 0 || state.finished) {
    return { steps: [], spinWin: 0, retrigger: 0, done: true };
  }

  state.spinsLeft -= 1;

  // New spin: reshuffle symbols, keep sticky multipliers.
  state.symbols = createEmptyGrid(null);
  fillEmptyCells(state);

  // Occasional opening multipliers on empty-looking spots.
  for (let i = 0; i < state.multipliers.length; i += 1) {
    if (state.multipliers[i] === 0 && state.random() < 0.08) {
      state.multipliers[i] = MULT_LADDER[0];
    }
  }

  const opening = {
    symbols: [...state.symbols],
    multipliers: [...state.multipliers],
  };

  const steps = [];
  let spinWin = 0;
  let guard = 0;

  while (guard < 40) {
    const step = resolveTumbleStep(state);
    if (!step) break;
    steps.push(step);
    spinWin += step.stepWin;
    guard += 1;
  }

  // Cosmetic retrigger: big cluster or lucky roll (stand-in for scatters).
  let retrigger = 0;
  const hadBigCluster = steps.some((s) => s.clusters.some((c) => c.size >= 10));
  if (hadBigCluster || state.random() < SCATTER_CHANCE) {
    retrigger = FREE_SPINS_RETRIGGER;
    state.spinsLeft += retrigger;
    state.totalSpins += retrigger;
  }

  spinWin = +spinWin.toFixed(2);
  state.lastSpinWin = spinWin;
  state.sweetPoints = +(state.sweetPoints + spinWin).toFixed(2);

  if (state.spinsLeft <= 0) {
    state.finished = true;
  }

  return {
    opening,
    steps,
    spinWin,
    retrigger,
    spinsLeft: state.spinsLeft,
    sweetPoints: state.sweetPoints,
    multipliers: [...state.multipliers],
    symbols: [...state.symbols],
    done: state.finished,
  };
}

export function formatPoints(n) {
  return n.toLocaleString('ru-RU', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
