import gsap from 'gsap';
import {
  GRID_SIZE,
  BUY_BONUS_COST_MULT,
  BUY_SUPER_COST_MULT,
  createGameState,
  fillEmptyCells,
  playBaseSpin,
  playFreeSpin,
  buyBonus,
  changeBet,
  formatVardin,
  formatVardinShort,
  multTier,
} from './engine.js';
import { SYMBOL_BY_ID } from './symbols.js';
import './style.scss';

const tg = window.Telegram?.WebApp;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const els = {
  board: document.getElementById('board'),
  fx: document.getElementById('fx-layer'),
  spins: document.getElementById('stat-spins'),
  fsBadge: document.getElementById('fs-badge'),
  balance: document.getElementById('stat-balance'),
  win: document.getElementById('stat-win'),
  bet: document.getElementById('stat-bet'),
  spinBtn: document.getElementById('btn-spin'),
  spinLabel: document.getElementById('spin-label'),
  betMinus: document.getElementById('btn-bet-minus'),
  betPlus: document.getElementById('btn-bet-plus'),
  buyBtn: document.getElementById('btn-buy'),
  buySuperBtn: document.getElementById('btn-buy-super'),
  buyCost: document.getElementById('buy-cost'),
  superCost: document.getElementById('super-cost'),
  toast: document.getElementById('toast'),
  status: document.getElementById('status'),
  winBanner: document.getElementById('win-banner'),
  winBannerText: document.getElementById('win-banner-text'),
  overlay: document.getElementById('overlay'),
  overlayPoints: document.getElementById('overlay-points'),
  overlayClose: document.getElementById('overlay-close'),
  buyOverlay: document.getElementById('buy-overlay'),
  buyOverlayTitle: document.getElementById('buy-overlay-title'),
  buyOverlayText: document.getElementById('buy-overlay-text'),
  buyOverlayPrice: document.getElementById('buy-overlay-price'),
  buyCancel: document.getElementById('buy-cancel'),
  buyConfirm: document.getElementById('buy-confirm'),
};

let state = createGameState();
let cellNodes = [];
let animating = false;
let pendingBuy = null; // 'bonus' | 'super'

function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor('#1a0f2e');
    tg.setBackgroundColor('#140a24');
  } catch {
    /* older clients */
  }
}

function cellSize() {
  const first = cellNodes[0]?.el;
  return first ? first.getBoundingClientRect().height + 4 : 48;
}

function buildBoard() {
  els.board.innerHTML = '';
  cellNodes = [];
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.innerHTML = `
      <span class="cell__mark-dot" aria-hidden="true"></span>
      <span class="cell__glyph" aria-hidden="true"></span>
      <span class="cell__mult" aria-hidden="true"></span>
    `;
    els.board.appendChild(cell);
    cellNodes.push({
      el: cell,
      glyph: cell.querySelector('.cell__glyph'),
      mult: cell.querySelector('.cell__mult'),
      mark: cell.querySelector('.cell__mark-dot'),
    });
  }
}

function clearMultTier(el) {
  [...el.classList]
    .filter((cls) => cls.startsWith('mult-tier-'))
    .forEach((cls) => el.classList.remove(cls));
}

function paintBoard(symbols, multipliers, marks, winning = []) {
  const winSet = new Set(winning);
  for (let i = 0; i < cellNodes.length; i += 1) {
    const node = cellNodes[i];
    const symbol = SYMBOL_BY_ID[symbols[i]];
    node.glyph.textContent = symbol ? symbol.glyph : '';
    node.el.classList.toggle('is-win', winSet.has(i));
    const m = multipliers[i] || 2;
    node.el.classList.add('is-marked');
    node.mark.classList.remove('is-on');
    node.mult.textContent = `×${m}`;
    node.mult.classList.add('is-on');
    clearMultTier(node.mult);
    clearMultTier(node.el);
    const tier = multTier(m);
    node.mult.classList.add(`mult-tier-${tier}`);
    node.el.classList.add(`mult-tier-${tier}`);
  }
}

function updateHud() {
  els.balance.textContent = formatVardinShort(state.balance);
  els.win.textContent = formatVardinShort(state.lastWin);
  els.bet.textContent = formatVardinShort(state.bet);
  els.buyCost.textContent = `${BUY_BONUS_COST_MULT}× · ${formatVardin(state.bet * BUY_BONUS_COST_MULT)}`;
  els.superCost.textContent = `${BUY_SUPER_COST_MULT}× · ${formatVardin(state.bet * BUY_SUPER_COST_MULT)}`;

  const inBonus = state.mode === 'bonus' || state.mode === 'super';
  els.fsBadge.classList.toggle('is-hidden', !inBonus);
  els.spins.textContent = String(state.spinsLeft);
  els.spinLabel.textContent = inBonus ? 'FS' : 'SPIN';

  const locked = animating || inBonus;
  els.betMinus.disabled = locked;
  els.betPlus.disabled = locked;
  els.buyBtn.disabled = locked;
  els.buySuperBtn.disabled = locked;
  els.spinBtn.disabled = animating;
}

function setBusy(busy) {
  animating = busy;
  state.busy = busy;
  updateHud();
}

function wait(ms) {
  if (reduceMotion) return Promise.resolve();
  return new Promise((resolve) => gsap.delayedCall(ms / 1000, resolve));
}

function showToast(text) {
  els.toast.textContent = text;
  gsap.killTweensOf(els.toast);
  gsap.fromTo(
    els.toast,
    { y: 90, opacity: 0 },
    {
      y: 0,
      opacity: 1,
      duration: reduceMotion ? 0.01 : 0.32,
      ease: 'power3.out',
      onComplete: () => {
        gsap.to(els.toast, { delay: 1.15, y: 70, opacity: 0, duration: 0.28 });
      },
    },
  );
}

function burstSparks(cellIndex, count = 8) {
  if (reduceMotion) return;
  const rect = cellNodes[cellIndex].el.getBoundingClientRect();
  const boardRect = els.fx.getBoundingClientRect();
  const cx = rect.left - boardRect.left + rect.width / 2;
  const cy = rect.top - boardRect.top + rect.height / 2;

  for (let i = 0; i < count; i += 1) {
    const spark = document.createElement('div');
    spark.className = 'spark';
    spark.style.left = `${cx}px`;
    spark.style.top = `${cy}px`;
    els.fx.appendChild(spark);
    const angle = (Math.PI * 2 * i) / count;
    gsap.to(spark, {
      x: Math.cos(angle) * gsap.utils.random(18, 36),
      y: Math.sin(angle) * gsap.utils.random(18, 36),
      opacity: 0,
      scale: 0.2,
      duration: 0.45,
      ease: 'power2.out',
      onComplete: () => spark.remove(),
    });
  }
}

function floatWin(amount) {
  if (!amount) return;
  const node = document.createElement('div');
  node.className = 'float-num';
  node.textContent = `+${formatVardinShort(amount)}`;
  els.fx.appendChild(node);
  gsap.fromTo(
    node,
    { xPercent: -50, y: 24, opacity: 0, scale: 0.7 },
    {
      y: -52,
      opacity: 1,
      scale: 1.15,
      duration: reduceMotion ? 0.01 : 0.5,
      ease: 'power3.out',
      onComplete: () => {
        gsap.to(node, {
          opacity: 0,
          y: -80,
          duration: 0.3,
          onComplete: () => node.remove(),
        });
      },
    },
  );
}

async function showWinBanner(amount) {
  if (!amount) return;
  els.winBanner.classList.remove('is-hidden');
  els.winBannerText.textContent = formatVardinShort(amount);
  await gsap.fromTo(
    els.winBanner,
    { opacity: 0, scale: 0.7 },
    { opacity: 1, scale: 1, duration: reduceMotion ? 0.01 : 0.35, ease: 'back.out(1.6)' },
  );
  await wait(650);
  await gsap.to(els.winBanner, {
    opacity: 0,
    scale: 1.08,
    duration: reduceMotion ? 0.01 : 0.25,
  });
  els.winBanner.classList.add('is-hidden');
}

function animateDropIn(symbols, multipliers, marks) {
  paintBoard(symbols, multipliers, marks, []);
  if (reduceMotion) return Promise.resolve();

  const size = cellSize();
  const glyphs = cellNodes.map((n) => n.glyph);
  gsap.set(glyphs, { y: (i) => -size * (1 + (i % GRID_SIZE) * 0.15), opacity: 0 });

  return gsap.to(glyphs, {
    y: 0,
    opacity: 1,
    duration: 0.42,
    stagger: {
      each: 0.012,
      from: 'start',
      grid: [GRID_SIZE, GRID_SIZE],
      axis: 'y',
    },
    ease: 'bounce.out',
  });
}

async function animateUpgrades(upgrades) {
  const tl = gsap.timeline();
  for (const up of upgrades) {
    const node = cellNodes[up.cell];
    const m = up.after.mult;
    node.mult.textContent = `×${m}`;
    node.mult.classList.add('is-on');
    clearMultTier(node.mult);
    clearMultTier(node.el);
    const tier = multTier(m);
    node.mult.classList.add(`mult-tier-${tier}`);
    node.el.classList.add(`mult-tier-${tier}`);
    if (!reduceMotion) {
      tl.fromTo(
        node.mult,
        { scale: 0.55, opacity: 0.5 },
        { scale: 1.2, opacity: 1, duration: 0.22, ease: 'back.out(2.2)', yoyo: true, repeat: 1 },
        '<0.02',
      );
    }
  }
  if (!reduceMotion) await tl;
}

async function animateStep(step) {
  paintBoard(step.symbolsBefore, step.multipliersBefore, step.marksBefore, step.winningCells);

  const winEls = step.winningCells.map((i) => cellNodes[i].el);
  const winGlyphs = step.winningCells.map((i) => cellNodes[i].glyph);

  if (!reduceMotion) {
    await gsap
      .timeline()
      .to(winEls, {
        scale: 1.1,
        duration: 0.14,
        ease: 'power1.out',
        stagger: 0.012,
      })
      .to(winEls, {
        scale: 1,
        duration: 0.12,
        ease: 'power1.in',
      });
  }

  floatWin(step.stepWin);
  step.winningCells.forEach((i) => burstSparks(i, 7));

  if (!reduceMotion) {
    await gsap.to(winGlyphs, {
      scale: 1.35,
      opacity: 0,
      duration: 0.2,
      stagger: 0.01,
      ease: 'power2.in',
    });
  }

  // After explode: show marks/mult upgrades on emptied cells, then tumble.
  for (const i of step.winningCells) {
    cellNodes[i].glyph.textContent = '';
    gsap.set(cellNodes[i].glyph, { clearProps: 'transform,opacity' });
  }

  await animateUpgrades(step.upgrades);

  // Paint final board and animate falls.
  paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
  if (!reduceMotion) {
    const size = cellSize();
    const glyphs = cellNodes.map((n) => n.glyph);
    gsap.set(glyphs, {
      y: (i) => -Math.max(0, step.fallDistance[i]) * size,
      opacity: 1,
    });
    await gsap.to(glyphs, {
      y: 0,
      duration: 0.38,
      stagger: {
        each: 0.01,
        from: 'end',
        grid: [GRID_SIZE, GRID_SIZE],
        axis: 'y',
      },
      ease: 'bounce.out',
    });
    gsap.set(glyphs, { clearProps: 'transform' });
  }

  await wait(90);
}

async function runResult(result) {
  await animateDropIn(result.opening.symbols, result.opening.multipliers, result.opening.marks);

  for (const step of result.steps) {
    await animateStep(step);
  }

  if (result.spinWin > 0) {
    await showWinBanner(result.spinWin);
  }

  paintBoard(result.symbols, result.multipliers, result.marks, []);
  state.lastWin = result.spinWin;
  updateHud();
}

async function onSpin() {
  if (animating) return;

  if (state.mode === 'bonus' || state.mode === 'super') {
    setBusy(true);
    els.status.textContent = 'Free Spins — липкие множители';
    const result = playFreeSpin(state);
    if (!result.ok) {
      setBusy(false);
      return;
    }
    await runResult(result);
    if (result.retrigger) showToast(`+${result.retrigger} FREE SPINS`);
    if (result.done) {
      els.overlayPoints.textContent = formatVardin(result.totalBonusWin);
      els.overlay.classList.add('is-open');
      fillEmptyCells(state);
      paintBoard(state.symbols, state.multipliers, state.marks, []);
      els.status.textContent = 'Бонус окончен · 1 Вардин = 1 ₽';
    }
    setBusy(false);
    return;
  }

  setBusy(true);
  const result = playBaseSpin(state);
  if (!result.ok) {
    showToast(result.reason === 'funds' ? 'Недостаточно Вардин' : 'Подождите…');
    setBusy(false);
    return;
  }
  els.status.textContent = 'Каскад…';
  await runResult(result);
  els.status.textContent =
    result.spinWin > 0
      ? `Выигрыш ${formatVardin(result.spinWin)}`
      : 'Все клетки ×2 · взрыв кластера удваивает множитель на этих полях';
  setBusy(false);
}

function openBuy(kind) {
  if (animating || state.mode !== 'base') return;
  pendingBuy = kind;
  const mult = kind === 'super' ? BUY_SUPER_COST_MULT : BUY_BONUS_COST_MULT;
  const cost = state.bet * mult;
  els.buyOverlayTitle.textContent = kind === 'super' ? 'SUPER FREE SPINS' : 'BUY FREE SPINS';
  els.buyOverlayText.textContent =
    kind === 'super'
      ? '10 фриспинов · поле с усиленными множителями (центр ×16)'
      : '10 фриспинов · все клетки ×2, при взрыве удваиваются и липнут';
  els.buyOverlayPrice.textContent = formatVardin(cost);
  els.buyOverlay.classList.add('is-open');
}

function confirmBuy() {
  if (!pendingBuy) return;
  const result = buyBonus(state, { superBonus: pendingBuy === 'super' });
  els.buyOverlay.classList.remove('is-open');
  pendingBuy = null;
  if (!result.ok) {
    showToast(result.reason === 'funds' ? 'Недостаточно Вардин' : 'Сейчас нельзя');
    return;
  }
  paintBoard(result.symbols, result.multipliers, result.marks, []);
  updateHud();
  showToast(result.mode === 'super' ? 'SUPER BONUS!' : 'FREE SPINS!');
  els.status.textContent = 'Нажмите SPIN / FS для фриспина';
}

function bind() {
  els.spinBtn.addEventListener('click', onSpin);
  els.betMinus.addEventListener('click', () => {
    if (animating || state.mode !== 'base') return;
    changeBet(state, -1);
    updateHud();
  });
  els.betPlus.addEventListener('click', () => {
    if (animating || state.mode !== 'base') return;
    changeBet(state, 1);
    updateHud();
  });
  els.buyBtn.addEventListener('click', () => openBuy('bonus'));
  els.buySuperBtn.addEventListener('click', () => openBuy('super'));
  els.buyCancel.addEventListener('click', () => {
    pendingBuy = null;
    els.buyOverlay.classList.remove('is-open');
  });
  els.buyConfirm.addEventListener('click', confirmBuy);
  els.overlayClose.addEventListener('click', () => {
    els.overlay.classList.remove('is-open');
    updateHud();
  });
}

function boot() {
  initTelegram();
  buildBoard();
  fillEmptyCells(state);
  paintBoard(state.symbols, state.multipliers, state.marks, []);
  bind();
  updateHud();
  els.status.textContent = 'Все клетки ×2 · кластер 5+ удваивает множитель и меняет цвет · 1 Вардин = 1 ₽';
}

boot();
