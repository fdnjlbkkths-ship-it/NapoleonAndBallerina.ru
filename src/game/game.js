import gsap from 'gsap';
import {
  GRID_SIZE,
  FREE_SPINS_START,
  createBonusState,
  fillEmptyCells,
  playFreeSpin,
  formatPoints,
} from './engine.js';
import { SYMBOL_BY_ID, SYMBOLS } from './symbols.js';
import './style.scss';

const tg = window.Telegram?.WebApp;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = {
  board: document.getElementById('board'),
  fx: document.getElementById('fx-layer'),
  spins: document.getElementById('stat-spins'),
  win: document.getElementById('stat-win'),
  total: document.getElementById('stat-total'),
  playBtn: document.getElementById('btn-play'),
  autoBtn: document.getElementById('btn-auto'),
  toast: document.getElementById('toast'),
  overlay: document.getElementById('overlay'),
  overlayPoints: document.getElementById('overlay-points'),
  overlayClose: document.getElementById('overlay-close'),
  legend: document.getElementById('legend'),
  status: document.getElementById('status'),
};

let state = createBonusState();
let cellNodes = [];
let autoPlaying = false;
let animating = false;

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#2a1814');
    tg.setBackgroundColor('#2a1814');
  } catch {
    /* older clients */
  }
  document.documentElement.style.setProperty(
    '--tg-safe-top',
    `${tg.safeAreaInset?.top ?? 0}px`,
  );
}

function buildLegend() {
  els.legend.innerHTML = SYMBOLS.map(
    (s) => `<span class="legend__item"><span>${s.glyph}</span>${s.label}</span>`,
  ).join('');
}

function buildBoard() {
  els.board.innerHTML = '';
  cellNodes = [];
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = String(i);
    cell.innerHTML = `
      <span class="cell__glyph" aria-hidden="true"></span>
      <span class="cell__mult" aria-hidden="true"></span>
    `;
    els.board.appendChild(cell);
    cellNodes.push({
      el: cell,
      glyph: cell.querySelector('.cell__glyph'),
      mult: cell.querySelector('.cell__mult'),
    });
  }
}

function paintBoard(symbols = state.symbols, multipliers = state.multipliers, winning = []) {
  const winSet = new Set(winning);
  for (let i = 0; i < cellNodes.length; i += 1) {
    const node = cellNodes[i];
    const symbol = SYMBOL_BY_ID[symbols[i]];
    node.glyph.textContent = symbol ? symbol.glyph : '';
    node.el.classList.toggle('is-win', winSet.has(i));
    const m = multipliers[i] || 0;
    if (m > 0) {
      node.mult.textContent = `×${m}`;
      node.mult.classList.add('is-on');
    } else {
      node.mult.textContent = '';
      node.mult.classList.remove('is-on');
    }
  }
}

function updateStats({ spinsLeft, lastSpinWin, sweetPoints } = {}) {
  els.spins.textContent = String(spinsLeft ?? state.spinsLeft);
  els.win.textContent = formatPoints(lastSpinWin ?? state.lastSpinWin);
  els.total.textContent = formatPoints(sweetPoints ?? state.sweetPoints);
}

function setBusy(busy) {
  animating = busy;
  state.busy = busy;
  els.playBtn.disabled = busy || state.finished || state.spinsLeft <= 0;
  els.autoBtn.disabled = busy && !autoPlaying;
  if (state.finished) {
    els.playBtn.textContent = 'Бонус завершён';
    els.autoBtn.disabled = true;
  }
}

function showToast(text) {
  els.toast.textContent = text;
  gsap.killTweensOf(els.toast);
  gsap.fromTo(
    els.toast,
    { y: 80, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: reduceMotion ? 0.01 : 0.35,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(els.toast, {
          delay: 1.1,
          y: 60,
          opacity: 0,
          duration: reduceMotion ? 0.01 : 0.3,
        });
      },
    },
  );
}

function floatWin(amount) {
  if (!amount) return;
  const node = document.createElement('div');
  node.className = 'float-num';
  node.textContent = `+${formatPoints(amount)}`;
  node.style.left = '50%';
  node.style.top = '42%';
  els.fx.appendChild(node);
  gsap.fromTo(
    node,
    { xPercent: -50, y: 20, opacity: 0, scale: 0.8 },
    {
      y: -40,
      opacity: 1,
      scale: 1.1,
      duration: reduceMotion ? 0.01 : 0.55,
      ease: 'power2.out',
      onComplete: () => {
        gsap.to(node, {
          opacity: 0,
          y: -70,
          duration: reduceMotion ? 0.01 : 0.35,
          onComplete: () => node.remove(),
        });
      },
    },
  );
}

function wait(ms) {
  if (reduceMotion) return Promise.resolve();
  return new Promise((resolve) => {
    gsap.delayedCall(ms / 1000, resolve);
  });
}

async function animateStep(step) {
  paintBoard(step.symbolsBefore, step.multipliersBefore, step.winningCells);

  const winEls = step.winningCells.map((i) => cellNodes[i].el);
  if (!reduceMotion) {
    await gsap.to(winEls, {
      scale: 1.08,
      duration: 0.18,
      yoyo: true,
      repeat: 1,
      ease: 'power1.inOut',
      stagger: 0.01,
    });
  }

  floatWin(step.stepWin);

  const glyphs = step.winningCells.map((i) => cellNodes[i].glyph);
  if (!reduceMotion) {
    await gsap.to(glyphs, {
      scale: 0,
      opacity: 0,
      duration: 0.22,
      stagger: 0.008,
      ease: 'back.in(1.4)',
    });
  }

  paintBoard(step.symbolsAfter, step.multipliersAfter, []);
  gsap.set(
    cellNodes.map((n) => n.glyph),
    { clearProps: 'transform,opacity' },
  );

  if (!reduceMotion) {
    await gsap.fromTo(
      cellNodes.map((n) => n.glyph),
      { y: -12, opacity: 0.35 },
      {
        y: 0,
        opacity: 1,
        duration: 0.28,
        stagger: { each: 0.004, from: 'random' },
        ease: 'power2.out',
      },
    );
  }

  await wait(180);
}

async function runOneSpin() {
  if (animating || state.finished || state.spinsLeft <= 0) return;

  setBusy(true);
  els.status.textContent = 'Каскад крутится…';

  const result = playFreeSpin(state);

  paintBoard(result.opening.symbols, result.opening.multipliers, []);
  if (!reduceMotion) {
    await gsap.fromTo(
      cellNodes.map((n) => n.glyph),
      { y: -18, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.3,
        stagger: { amount: 0.25, from: 'start' },
        ease: 'power2.out',
      },
    );
  }

  for (const step of result.steps) {
    await animateStep(step);
  }

  if (result.steps.length === 0) {
    els.status.textContent = 'Пустой спин — множители остаются';
  } else {
    els.status.textContent = `Спин: +${formatPoints(result.spinWin)}`;
  }

  if (result.retrigger > 0) {
    showToast(`+${result.retrigger} фриспинов!`);
  }

  updateStats({
    spinsLeft: result.spinsLeft,
    lastSpinWin: result.spinWin,
    sweetPoints: result.sweetPoints,
  });

  paintBoard(result.symbols, result.multipliers, []);

  if (result.done) {
    openFinish();
  }

  setBusy(false);
}

async function runAuto() {
  if (autoPlaying) {
    autoPlaying = false;
    els.autoBtn.textContent = 'Автобонус';
    return;
  }
  autoPlaying = true;
  els.autoBtn.textContent = 'Стоп';
  while (autoPlaying && !state.finished && state.spinsLeft > 0) {
    await runOneSpin();
    await wait(280);
  }
  autoPlaying = false;
  els.autoBtn.textContent = 'Автобонус';
}

function openFinish() {
  els.overlayPoints.textContent = formatPoints(state.sweetPoints);
  els.overlay.classList.add('is-open');
  if (!reduceMotion) {
    gsap.fromTo(
      els.overlay.querySelector('.overlay__card'),
      { y: 30, scale: 0.94, opacity: 0 },
      { y: 0, scale: 1, opacity: 1, duration: 0.4, ease: 'power3.out' },
    );
  }
  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.notificationOccurred('success');
    } catch {
      /* ignore */
    }
  }
}

function resetBonus() {
  state = createBonusState();
  fillEmptyCells(state);
  // Seed a few multipliers so the board already feels like bonus.
  for (let i = 0; i < state.multipliers.length; i += 1) {
    if (state.random() < 0.12) state.multipliers[i] = 2;
  }
  paintBoard();
  updateStats({ spinsLeft: FREE_SPINS_START, lastSpinWin: 0, sweetPoints: 0 });
  els.playBtn.textContent = 'Следующий спин';
  els.status.textContent = `Бонус: ${FREE_SPINS_START} фриспинов · липкие множители до ×1024`;
  els.overlay.classList.remove('is-open');
  setBusy(false);
}

function bind() {
  els.playBtn.addEventListener('click', () => {
    if (state.finished) {
      resetBonus();
      return;
    }
    runOneSpin();
  });
  els.autoBtn.addEventListener('click', () => runAuto());
  els.overlayClose.addEventListener('click', () => {
    els.overlay.classList.remove('is-open');
    els.playBtn.textContent = 'Ещё раз';
    els.playBtn.disabled = false;
    state.finished = true;
  });
}

function boot() {
  initTelegram();
  buildLegend();
  buildBoard();
  bind();
  resetBonus();
  // First click starts; button label for start.
  els.playBtn.textContent = 'Запустить бонус';
}

boot();
