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

function cellCenterInFx(cellIndex) {
  const rect = cellNodes[cellIndex].el.getBoundingClientRect();
  const boardRect = els.fx.getBoundingClientRect();
  return {
    x: rect.left - boardRect.left + rect.width / 2,
    y: rect.top - boardRect.top + rect.height / 2,
    w: rect.width,
    h: rect.height,
  };
}

function spawnFxNode(className, x, y) {
  const node = document.createElement('div');
  node.className = className;
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  els.fx.appendChild(node);
  return node;
}

function burstShockwave(cellIndex) {
  if (reduceMotion) return;
  const { x, y } = cellCenterInFx(cellIndex);
  const wave = spawnFxNode('shockwave', x, y);
  gsap.fromTo(
    wave,
    { scale: 0.35, opacity: 0.95 },
    {
      scale: 3.2,
      opacity: 0,
      duration: 0.55,
      ease: 'power2.out',
      onComplete: () => wave.remove(),
    },
  );
}

function burstSparks(cellIndex, count = 12) {
  if (reduceMotion) return;
  const { x, y } = cellCenterInFx(cellIndex);

  for (let i = 0; i < count; i += 1) {
    const isGlow = i % 3 === 0;
    const spark = spawnFxNode(isGlow ? 'spark spark--glow' : 'spark spark--crumb', x, y);
    const angle = (Math.PI * 2 * i) / count + gsap.utils.random(-0.2, 0.2);
    const dist = gsap.utils.random(isGlow ? 22 : 16, isGlow ? 48 : 40);
    gsap.fromTo(
      spark,
      { scale: isGlow ? 0.6 : 1, opacity: 1, rotation: 0 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist + gsap.utils.random(4, 18),
        opacity: 0,
        scale: 0,
        rotation: gsap.utils.random(-180, 180),
        duration: gsap.utils.random(0.45, 0.7),
        ease: 'power3.out',
        onComplete: () => spark.remove(),
      },
    );
  }
}

function boardFlash() {
  if (reduceMotion) return;
  let flash = els.fx.querySelector('.fx-flash');
  if (!flash) {
    flash = document.createElement('div');
    flash.className = 'fx-flash';
    els.fx.appendChild(flash);
  }
  gsap.fromTo(
    flash,
    { opacity: 0.55 },
    { opacity: 0, duration: 0.45, ease: 'power2.out' },
  );
}

/** Clone winning glyphs into FX layer and explode them outward. */
async function explodeCells(winningCells) {
  if (reduceMotion) {
    winningCells.forEach((i) => {
      cellNodes[i].glyph.textContent = '';
    });
    return;
  }

  const winEls = winningCells.map((i) => cellNodes[i].el);
  const winGlyphs = winningCells.map((i) => cellNodes[i].glyph);

  // 1) Anticipation pulse + glow
  await gsap
    .timeline()
    .to(winEls, {
      scale: 1.1,
      duration: 0.26,
      ease: 'power2.out',
      stagger: { each: 0.02, from: 'center' },
    })
    .to(
      winGlyphs,
      {
        scale: 1.22,
        filter: 'brightness(1.4) saturate(1.25)',
        duration: 0.26,
        ease: 'power2.out',
        stagger: { each: 0.02, from: 'center' },
      },
      '<',
    )
    .to(winGlyphs, {
      scaleX: 1.28,
      scaleY: 0.82,
      duration: 0.14,
      ease: 'power2.in',
    });

  boardFlash();

  // 2) Launch clones + shockwaves + particles
  const flyTl = gsap.timeline();
  winningCells.forEach((i, order) => {
    const node = cellNodes[i];
    const glyphText = node.glyph.textContent;
    const { x, y } = cellCenterInFx(i);
    node.el.classList.add('is-exploding');

    const fly = spawnFxNode('fly-glyph', x, y);
    fly.textContent = glyphText;
    fly.style.fontSize = getComputedStyle(node.glyph).fontSize;
    gsap.set(fly, { x: 0, y: 0, xPercent: -50, yPercent: -50 });

    node.glyph.textContent = '';
    gsap.set(node.glyph, { clearProps: 'transform,filter,opacity' });

    const angle = gsap.utils.random(-Math.PI, Math.PI);
    const dist = gsap.utils.random(30, 58);
    const spin = gsap.utils.random(-180, 180);
    const start = order * 0.022;

    flyTl.fromTo(
      fly,
      { scale: 1.2, opacity: 1, rotation: 0, x: 0, y: 0 },
      {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist - 12,
        scale: 0.12,
        rotation: spin,
        opacity: 0,
        duration: 0.58,
        ease: 'power3.in',
        onComplete: () => fly.remove(),
      },
      start,
    );

    flyTl.add(() => {
      burstShockwave(i);
      burstSparks(i, 14);
    }, start);

    flyTl.to(
      node.el,
      {
        scale: 1,
        duration: 0.4,
        ease: 'power2.out',
        onComplete: () => node.el.classList.remove('is-exploding'),
      },
      start + 0.18,
    );
  });

  await flyTl;
  gsap.set(winEls, { clearProps: 'transform' });
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
      duration: reduceMotion ? 0.01 : 0.7,
      ease: 'power3.out',
      onComplete: () => {
        gsap.to(node, {
          opacity: 0,
          y: -80,
          duration: 0.4,
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
    { opacity: 1, scale: 1, duration: reduceMotion ? 0.01 : 0.5, ease: 'back.out(1.6)' },
  );
  await wait(900);
  await gsap.to(els.winBanner, {
    opacity: 0,
    scale: 1.08,
    duration: reduceMotion ? 0.01 : 0.35,
  });
  els.winBanner.classList.add('is-hidden');
}

/** Drop every cell from top, column by column, one after another. */
function animateDropIn(symbols, multipliers, marks) {
  paintBoard(symbols, multipliers, marks, []);
  if (reduceMotion) return Promise.resolve();

  const size = cellSize();
  const tl = gsap.timeline();
  let t = 0;
  for (let c = 0; c < GRID_SIZE; c += 1) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      const i = r * GRID_SIZE + c;
      const glyph = cellNodes[i].glyph;
      gsap.set(glyph, { y: -size * (r + 2), opacity: 0 });
      tl.to(
        glyph,
        {
          y: 0,
          opacity: 1,
          duration: 0.55,
          ease: 'bounce.out',
        },
        t,
      );
      t += 0.055;
    }
  }
  return tl;
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
        { scale: 1.25, opacity: 1, duration: 0.35, ease: 'back.out(2.2)', yoyo: true, repeat: 1 },
        '<0.04',
      );
    }
  }
  if (!reduceMotion) await tl;
}

/** Existing pieces slide down, then new ones drop from top one-by-one. */
async function animateCascadeFalls(step) {
  const size = cellSize();

  // 1) Show board after gravity (holes on top), slide survivors down.
  paintBoard(step.symbolsAfterGravity, step.multipliersAfter, step.marksAfter, []);
  for (const i of step.newDropCells || []) {
    cellNodes[i].glyph.textContent = '';
  }

  if (!reduceMotion && step.slideCells?.length) {
    const tl = gsap.timeline();
    for (const i of step.slideCells) {
      const dist = step.fallDistance[i] || 0;
      if (dist <= 0) continue;
      gsap.set(cellNodes[i].glyph, { y: -dist * size });
      tl.to(
        cellNodes[i].glyph,
        { y: 0, duration: 0.5, ease: 'power2.out' },
        0,
      );
    }
    await tl;
  }

  // 2) New blocks fall from above one after another (column → row).
  paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
  if (reduceMotion) return;

  const drops = step.newDropCells || [];
  // Hide new drops first, keep others in place.
  for (const i of drops) {
    gsap.set(cellNodes[i].glyph, { y: -size * (step.fallDistance[i] || 2), opacity: 0 });
  }

  const tl = gsap.timeline();
  let t = 0;
  for (const i of drops) {
    const dist = Math.max(2, step.fallDistance[i] || 2);
    tl.fromTo(
      cellNodes[i].glyph,
      { y: -dist * size, opacity: 0 },
      {
        y: 0,
        opacity: 1,
        duration: 0.58,
        ease: 'bounce.out',
      },
      t,
    );
    t += 0.09; // друг за другом
  }
  await tl;
  gsap.set(
    cellNodes.map((n) => n.glyph),
    { clearProps: 'transform,opacity' },
  );
}

async function animateStep(step) {
  paintBoard(step.symbolsBefore, step.multipliersBefore, step.marksBefore, step.winningCells);

  // Subtle pre-highlight before the pop
  if (!reduceMotion) {
    const winEls = step.winningCells.map((i) => cellNodes[i].el);
    await gsap.fromTo(
      winEls,
      { boxShadow: 'inset 0 0 0 0 rgba(255,255,255,0)' },
      {
        boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.7)',
        duration: 0.2,
        stagger: { each: 0.015, from: 'center' },
        ease: 'sine.out',
      },
    );
  }

  floatWin(step.stepWin);
  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.impactOccurred('medium');
    } catch {
      /* ignore */
    }
  }
  await explodeCells(step.winningCells);

  for (const i of step.winningCells) {
    cellNodes[i].el.classList.remove('is-win', 'is-exploding');
    gsap.set(cellNodes[i].glyph, { clearProps: 'transform,filter,opacity' });
  }

  await animateUpgrades(step.upgrades);
  await wait(160);
  await animateCascadeFalls(step);
  await wait(200);
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
