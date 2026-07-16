/**
 * Sugar Rush 1000–style engine (demo, currency: Вардин 1:1 ₽).
 *
 * Multiplier spots are sticky on the grid:
 * they do not move with falling symbols and do not grow on explode.
 * Base: marks/mults reset after each spin. Free spins: sticky.
 * Super Free Spins: every cell starts at ×2 and stays there.
 */

import {
  payForCluster,
  pickBiasedSymbol,
  createDropMood,
  isScatter,
  countScatters,
} from './symbols.js';

/** Baseline neighbour match bias (moods jitter around this). */
export const MATCH_BIAS = 3.25;

function shuffleInPlace(list, random) {
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const tmp = list[i];
    list[i] = list[j];
    list[j] = tmp;
  }
  return list;
}

export const GRID_SIZE = 7;
export const MIN_CLUSTER = 5;
export const FREE_SPINS_START = 10;
export const FREE_SPINS_RETRIGGER = 5;
export const SCATTER_RETRIGGER_NEED = 3;
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

export function fillAllMultipliers(value = 2) {
  return createEmptyGrid(value);
}

export function freeSpinsForScatters(count) {
  if (count >= 7) return 30;
  if (count >= 6) return 20;
  if (count >= 5) return 15;
  if (count >= 4) return 12;
  if (count >= 3) return 10;
  return 0;
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

/** CSS tier key for multiplier colour (×2 … ×1024). */
export function multTier(value) {
  const v = value || 2;
  if (v >= 1024) return 1024;
  if (v >= 512) return 512;
  if (v >= 256) return 256;
  if (v >= 128) return 128;
  if (v >= 64) return 64;
  if (v >= 32) return 32;
  if (v >= 16) return 16;
  if (v >= 8) return 8;
  if (v >= 4) return 4;
  return 2;
}

export function fillEmptyCells(state) {
  const mood = createDropMood(state.random);
  // Shuffle column order so openings aren't left-to-right scripted.
  const cols = shuffleInPlace(
    Array.from({ length: GRID_SIZE }, (_, c) => c),
    state.random,
  );
  // Fill bottom→top so lower neighbours already exist for bias.
  for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
    for (const c of cols) {
      const i = idx(r, c);
      if (!state.symbols[i]) {
        state.symbols[i] = pickBiasedSymbol(
          state.symbols,
          i,
          GRID_SIZE,
          state.random,
          mood,
        );
      }
    }
  }
  return mood;
}

export function findClusters(symbols) {
  const visited = new Array(symbols.length).fill(false);
  const clusters = [];

  for (let start = 0; start < symbols.length; start += 1) {
    const id = symbols[start];
    if (!id || visited[start] || isScatter(id)) continue;

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
 * Sticky spots: leave marks/multipliers unchanged on explode.
 * Values stay on their cells while symbols clear and cascade around them.
 */
export function applyExplodeMarks(state, winningCells) {
  const upgrades = [];
  const unique = [...new Set(winningCells)];

  for (const cell of unique) {
    const snap = {
      marked: Boolean(state.marks[cell]),
      mult: state.multipliers[cell] || 0,
    };
    upgrades.push({
      cell,
      before: snap,
      after: { ...snap },
    });
  }

  return upgrades;
}

function applyGravityWithFalls(symbols) {
  const fallDistance = createEmptyGrid(0);
  const moves = []; // { from, to, id, rows }

  for (let c = 0; c < GRID_SIZE; c += 1) {
    const stack = [];
    for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
      const i = idx(r, c);
      if (symbols[i]) stack.push({ id: symbols[i], fromR: r });
    }
    let writeR = GRID_SIZE - 1;
    for (const item of stack) {
      const to = idx(writeR, c);
      const from = idx(item.fromR, c);
      symbols[to] = item.id;
      const rows = writeR - item.fromR;
      fallDistance[to] = rows;
      if (rows > 0) {
        moves.push({ from, to, id: item.id, rows });
      }
      writeR -= 1;
    }
    while (writeR >= 0) {
      const to = idx(writeR, c);
      symbols[to] = null;
      fallDistance[to] = 0;
      writeR -= 1;
    }
  }

  return { fallDistance, moves };
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

  // Keep sticky multipliers on the same cells (no grow, no move).
  const upgrades = applyExplodeMarks(state, uniqueWins);
  const symbolsAfterExplode = [...state.symbols];

  const { fallDistance, moves } = applyGravityWithFalls(state.symbols);
  const symbolsAfterGravity = [...state.symbols];
  const slideCells = moves.map((m) => m.to);

  // New pieces drop from the top — listed top→bottom for sequential anim.
  // Fresh mood each cascade wave so tumbles don't feel copy-pasted.
  const dropMood = createDropMood(state.random);
  const newDropCells = [];
  const cols = shuffleInPlace(
    Array.from({ length: GRID_SIZE }, (_, c) => c),
    state.random,
  );
  for (const c of cols) {
    let empties = 0;
    for (let r = 0; r < GRID_SIZE; r += 1) {
      if (!state.symbols[idx(r, c)]) empties += 1;
    }
    // Spawn from lowest empty upward so each new piece can match the one under it.
    const emptyRows = [];
    for (let r = GRID_SIZE - 1; r >= 0; r -= 1) {
      if (!state.symbols[idx(r, c)]) emptyRows.push(r);
    }
    emptyRows.forEach((r, spawnOrder) => {
      const i = idx(r, c);
      state.symbols[i] = pickBiasedSymbol(
        state.symbols,
        i,
        GRID_SIZE,
        state.random,
        dropMood,
      );
      fallDistance[i] = r + 1 + (empties - spawnOrder);
    });
  }
  // Animation order stays left→right, top→bottom (visual cascade path).
  for (let c = 0; c < GRID_SIZE; c += 1) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      const i = idx(r, c);
      if (!symbolsAfterGravity[i] && state.symbols[i]) newDropCells.push(i);
    }
  }

  return {
    clusters: clusterDetails,
    winningCells: uniqueWins,
    stepWin: +stepWin.toFixed(2),
    upgrades,
    fallDistance: [...fallDistance],
    moves,
    slideCells,
    newDropCells,
    symbolsAfterExplode,
    symbolsAfterGravity,
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
  let maxScatters = countScatters(state.symbols);
  while (guard < 48) {
    const step = resolveTumbleStep(state);
    if (!step) break;
    steps.push(step);
    spinWin += step.stepWin;
    maxScatters = Math.max(maxScatters, countScatters(step.symbolsAfter));
    guard += 1;
  }
  maxScatters = Math.max(maxScatters, countScatters(state.symbols));
  return { steps, spinWin: +spinWin.toFixed(2), scatterCount: maxScatters };
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

  const { steps, spinWin, scatterCount } = runCascades(state);
  state.lastWin = spinWin;
  state.balance = +(state.balance + spinWin).toFixed(2);

  // 3+ scatters in base → Free Spins (10–30 like Sugar Rush 1000).
  let triggeredBonus = false;
  let awardedSpins = 0;
  if (scatterCount >= SCATTER_RETRIGGER_NEED) {
    awardedSpins = freeSpinsForScatters(scatterCount);
    startBonus(state, { superBonus: false, spins: awardedSpins });
    triggeredBonus = true;
  } else {
    resetMarksIfBase(state);
  }

  return {
    ok: true,
    opening,
    steps,
    spinWin,
    scatterCount,
    triggeredBonus,
    awardedSpins,
    balance: state.balance,
    multipliers: [...state.multipliers],
    marks: [...state.marks],
    symbols: [...state.symbols],
  };
}

function startBonus(state, { superBonus = false, spins = FREE_SPINS_START } = {}) {
  state.mode = superBonus ? 'super' : 'bonus';
  state.spinsLeft = spins;
  state.totalBonusWin = 0;
  state.finishedBonus = false;
  state.lastWin = 0;

  if (superBonus) {
    // Super Free Spins: every cell preloaded with ×2 (sticky).
    state.multipliers = fillAllMultipliers(2);
    state.marks = createEmptyGrid(true);
  } else {
    // Regular Free Spins: clean sticky spots (build during the round).
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

  const { steps, spinWin, scatterCount } = runCascades(state);
  state.lastWin = spinWin;
  state.totalBonusWin = +(state.totalBonusWin + spinWin).toFixed(2);
  state.balance = +(state.balance + spinWin).toFixed(2);

  // 3 Free Spin symbols in one spin → +5 spins
  let retrigger = 0;
  if (scatterCount >= SCATTER_RETRIGGER_NEED) {
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
    scatterCount,
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
