import gsap from 'gsap';
import {
  GRID_SIZE,
  BUY_BONUS_COST_MULT,
  BUY_SUPER_COST_MULT,
  BET_STEPS,
  START_BALANCE,
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
import { SYMBOL_BY_ID, isScatter } from './symbols.js';
import {
  PROMO_TIERS,
  MIN_BONUS_ROUND_POINTS,
  applyBonusPity,
  redeemPromo,
} from './promo.js';
import {
  loadUserCache,
  persistProgress,
  getTelegramUserName,
} from './storage.js';
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
  bank: document.getElementById('stat-bank'),
  walletBtn: document.getElementById('btn-wallet'),
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
  fsAward: document.getElementById('fs-award'),
  fsAwardCard: document.getElementById('fs-award-card'),
  fsAwardValue: document.getElementById('fs-award-value'),
  overlay: document.getElementById('overlay'),
  overlayPoints: document.getElementById('overlay-points'),
  overlayClose: document.getElementById('overlay-close'),
  rewardSub: document.getElementById('reward-sub'),
  rewardPity: document.getElementById('reward-pity'),
  rewardBankTotal: document.getElementById('reward-bank-total'),
  promoList: document.getElementById('promo-list'),
  promoCodeBox: document.getElementById('promo-code-box'),
  promoCodeValue: document.getElementById('promo-code-value'),
  promoCopy: document.getElementById('promo-copy'),
  buyOverlay: document.getElementById('buy-overlay'),
  buyOverlayTitle: document.getElementById('buy-overlay-title'),
  buyOverlayText: document.getElementById('buy-overlay-text'),
  buyOverlayPrice: document.getElementById('buy-overlay-price'),
  buyCancel: document.getElementById('buy-cancel'),
  buyConfirm: document.getElementById('buy-confirm'),
};

let state = createGameState();
let rewardBank = 0;
let promoCodes = [];
let cellNodes = [];
let animating = false;
let pendingBuy = null; // 'bonus' | 'super'
let lastIssuedCode = '';

function saveCache() {
  persistProgress({
    rewardBank,
    balance: state.balance,
    betIndex: state.betIndex,
    codes: promoCodes,
  });
}

function restoreFromCache() {
  const cache = loadUserCache();
  rewardBank = Number(cache.rewardBank) || 0;
  promoCodes = Array.isArray(cache.codes) ? cache.codes : [];
  if (cache.balance != null && Number.isFinite(Number(cache.balance))) {
    state.balance = Number(cache.balance);
  } else {
    state.balance = START_BALANCE;
  }
  if (cache.betIndex != null && BET_STEPS[cache.betIndex] != null) {
    state.betIndex = cache.betIndex;
    state.bet = BET_STEPS[cache.betIndex];
  }
}

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
    node.el.classList.toggle('is-scatter', isScatter(symbols[i]));
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
    gsap.set(node.mult, { scale: 1, clearProps: 'transform,filter,fontSize' });
  }
}

function updateHud() {
  els.balance.textContent = formatVardinShort(state.balance);
  els.win.textContent = formatVardinShort(state.lastWin);
  els.bet.textContent = formatVardinShort(state.bet);
  if (els.bank) els.bank.textContent = formatVardinShort(rewardBank);
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

function renderPromoList() {
  if (!els.promoList) return;
  els.promoList.innerHTML = PROMO_TIERS.map((tier) => {
    const affordable = rewardBank + 1e-9 >= tier.cost;
    return `
      <article class="promo-card" data-tier="${tier.id}">
        <div>
          <div class="promo-card__title">${tier.title}</div>
          <span class="promo-card__meta">${tier.hint} · ${formatVardinShort(tier.cost)} баллов</span>
        </div>
        <button type="button" class="promo-card__btn" data-redeem="${tier.id}" ${affordable ? '' : 'disabled'}>
          Обменять
        </button>
      </article>
    `;
  }).join('');

  els.promoList.querySelectorAll('[data-redeem]').forEach((btn) => {
    btn.addEventListener('click', () => onRedeem(btn.getAttribute('data-redeem')));
  });
}

function showIssuedCode(code) {
  lastIssuedCode = code;
  if (!els.promoCodeBox) return;
  els.promoCodeBox.classList.remove('is-hidden');
  els.promoCodeValue.textContent = code;
}

function openRewardOverlay({ roundWin, pity = 0, title = 'Бонус завершён' } = {}) {
  document.getElementById('reward-title').textContent = title;
  if (els.rewardSub) {
    els.rewardSub.textContent = `${getTelegramUserName()}, обменяйте баллы на скидку в домашней кондитерской`;
  }
  els.overlayPoints.textContent = `${formatVardinShort(roundWin)} баллов`;
  if (els.rewardPity) {
    if (pity > 0) {
      els.rewardPity.textContent = `Гарантия раунда: +${formatVardinShort(pity)} до промокода 5%`;
      els.rewardPity.classList.remove('is-hidden');
    } else {
      els.rewardPity.classList.add('is-hidden');
    }
  }
  if (els.rewardBankTotal) {
    els.rewardBankTotal.textContent = formatVardinShort(rewardBank);
  }
  if (els.promoCodeBox) els.promoCodeBox.classList.add('is-hidden');
  renderPromoList();
  els.overlay.classList.add('is-open');
}

function onRedeem(tierId) {
  const result = redeemPromo(rewardBank, tierId);
  if (!result.ok) {
    showToast('Недостаточно баллов');
    return;
  }
  rewardBank = result.bankAfter;
  promoCodes = [
    {
      code: result.code,
      discount: result.tier.discount,
      tierId: result.tier.id,
      issuedAt: result.issuedAt,
    },
    ...promoCodes,
  ].slice(0, 30);
  saveCache();
  updateHud();
  renderPromoList();
  showIssuedCode(result.code);
  showToast(`Промокод −${result.tier.discount}% готов`);
  if (els.rewardBankTotal) {
    els.rewardBankTotal.textContent = formatVardinShort(rewardBank);
  }
}

function settleBonusRound(rawRoundWin) {
  const { credited, pity } = applyBonusPity(rawRoundWin);
  rewardBank = +(rewardBank + credited).toFixed(2);
  saveCache();
  updateHud();
  openRewardOverlay({ roundWin: credited, pity });
  els.status.textContent = `Бонус в баллы · от ${MIN_BONUS_ROUND_POINTS} на промокод 5%`;
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

  const winGlyphs = winningCells.map((i) => cellNodes[i].glyph);

  // 1) Anticipation on glyphs only — cell boxes stay fixed size
  await gsap
    .timeline()
    .to(winGlyphs, {
      scale: 1.22,
      filter: 'brightness(1.4) saturate(1.25)',
      duration: 0.26,
      ease: 'power2.out',
      stagger: { each: 0.02, from: 'center' },
    })
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
      node.el.classList.remove('is-exploding');
    }, start + 0.18);
  });

  await flyTl;
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

/** Big center celebration when Free Spins are awarded (+5 etc.). */
async function showFreeSpinsAward(amount = 5) {
  if (!els.fsAward || !amount) return;

  els.fsAward.classList.remove('is-hidden');
  els.fsAwardValue.textContent = `+${amount}`;
  gsap.set(els.fsAward, { opacity: 1 });
  gsap.set(els.fsAwardCard, { scale: 0.55, rotation: -8, opacity: 0 });

  if (tg?.HapticFeedback) {
    try {
      tg.HapticFeedback.notificationOccurred('success');
    } catch {
      /* ignore */
    }
  }

  // Confetti sparks around the card
  if (!reduceMotion) {
    const rect = els.fsAwardCard.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (let i = 0; i < 18; i += 1) {
      const spark = document.createElement('div');
      spark.className = 'fs-award__spark';
      spark.style.left = `${cx}px`;
      spark.style.top = `${cy}px`;
      spark.style.position = 'fixed';
      spark.style.zIndex = '51';
      document.body.appendChild(spark);
      const angle = (Math.PI * 2 * i) / 18;
      const dist = gsap.utils.random(60, 130);
      gsap.to(spark, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        opacity: 0,
        scale: 0,
        duration: 0.85,
        ease: 'power2.out',
        onComplete: () => spark.remove(),
      });
    }
  }

  await gsap
    .timeline()
    .to(els.fsAwardCard, {
      scale: 1.08,
      rotation: 0,
      opacity: 1,
      duration: reduceMotion ? 0.01 : 0.45,
      ease: 'back.out(1.8)',
    })
    .to(els.fsAwardCard, {
      scale: 1,
      duration: reduceMotion ? 0.01 : 0.18,
      ease: 'power2.out',
    })
    .to(els.fsAwardValue, {
      scale: 1.15,
      duration: reduceMotion ? 0.01 : 0.22,
      yoyo: true,
      repeat: 1,
      ease: 'power1.inOut',
    });

  await wait(1100);

  await gsap.to(els.fsAward, {
    opacity: 0,
    duration: reduceMotion ? 0.01 : 0.35,
    ease: 'power2.in',
  });
  els.fsAward.classList.add('is-hidden');
  gsap.set(els.fsAwardCard, { clearProps: 'transform,opacity' });
}

/** Initial fill: pieces fall from above the board into each cell. */
function animateDropIn(symbols, multipliers, marks) {
  paintBoard(symbols, multipliers, marks, []);
  if (reduceMotion) return Promise.resolve();

  const size = cellSize();
  // Hide glyphs — fly clones fall into place.
  cellNodes.forEach((n) => {
    gsap.set(n.glyph, { opacity: 0 });
  });

  const tl = gsap.timeline({
    onComplete: () => {
      cellNodes.forEach((n) => gsap.set(n.glyph, { clearProps: 'opacity,transform' }));
    },
  });

  let t = 0;
  for (let c = 0; c < GRID_SIZE; c += 1) {
    for (let r = 0; r < GRID_SIZE; r += 1) {
      const i = r * GRID_SIZE + c;
      const id = symbols[i];
      if (!id) continue;
      const { x, y } = cellCenterInFx(i);
      const fly = spawnFxNode('fly-glyph', x, y);
      fly.textContent = SYMBOL_BY_ID[id]?.glyph || '';
      fly.style.fontSize = getComputedStyle(cellNodes[i].glyph).fontSize;
      const startY = -(r + 2.2) * size;

      tl.fromTo(
        fly,
        { x: 0, y: startY, xPercent: -50, yPercent: -50, opacity: 1 },
        {
          x: 0,
          y: 0,
          duration: 0.52 + r * 0.02,
          ease: 'bounce.out',
          onComplete: () => {
            cellNodes[i].glyph.style.opacity = '1';
            fly.remove();
          },
        },
        t,
      );
      t += 0.045;
    }
  }
  return tl;
}

async function animateUpgrades(upgrades) {
  const tl = gsap.timeline();
  const multEls = [];
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
    // Always lock final size to ×2 badge (no leftover GSAP scale).
    gsap.set(node.mult, { scale: 1, clearProps: 'fontSize,lineHeight,width,height' });
    multEls.push(node.mult);
    if (!reduceMotion) {
      // Pulse via brightness only — size stays identical to ×2.
      tl.fromTo(
        node.mult,
        { autoAlpha: 0.55, filter: 'brightness(1.6)' },
        {
          autoAlpha: 1,
          filter: 'brightness(1)',
          duration: 0.32,
          ease: 'power2.out',
        },
        '<0.03',
      );
    }
  }
  if (!reduceMotion) await tl;
  gsap.set(multEls, { scale: 1, clearProps: 'transform,filter' });
}

/**
 * True cascade:
 * 1) board with holes after explode
 * 2) pieces above fall down into empty slots
 * 3) new pieces fall from above the board into remaining holes
 */
async function animateCascadeFalls(step) {
  const size = cellSize();
  const afterExplode = step.symbolsAfterExplode || step.symbolsBefore.map((s, i) =>
    step.winningCells.includes(i) ? null : s,
  );

  // Show holes where clusters exploded; survivors still in old seats.
  paintBoard(afterExplode, step.multipliersAfter, step.marksAfter, []);

  if (reduceMotion) {
    paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
    return;
  }

  const moves = step.moves || [];
  if (moves.length) {
    // Hide moving sources — clones travel to destination cells.
    for (const move of moves) {
      cellNodes[move.from].glyph.textContent = '';
    }

    const slideTl = gsap.timeline();
    moves.forEach((move, order) => {
      const from = cellCenterInFx(move.from);
      const to = cellCenterInFx(move.to);
      const fly = spawnFxNode('fly-glyph', from.x, from.y);
      fly.textContent = SYMBOL_BY_ID[move.id]?.glyph || '';
      fly.style.fontSize = getComputedStyle(cellNodes[move.to].glyph).fontSize;
      gsap.set(fly, { xPercent: -50, yPercent: -50, x: 0, y: 0 });

      // Slight stagger by column so it reads as gravity, not a teleport.
      const col = move.to % GRID_SIZE;
      const start = col * 0.02 + order * 0.008;

      slideTl.to(
        fly,
        {
          x: to.x - from.x,
          y: to.y - from.y,
          duration: 0.28 + move.rows * 0.07,
          ease: 'power2.in',
          onComplete: () => fly.remove(),
        },
        start,
      );
    });
    await slideTl;
  }

  // Board after gravity: survivors seated, top holes empty.
  paintBoard(step.symbolsAfterGravity, step.multipliersAfter, step.marksAfter, []);

  const drops = step.newDropCells || [];
  if (!drops.length) {
    paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
    return;
  }

  // Hide destinations, drop new pieces from above the board one-by-one.
  for (const i of drops) {
    cellNodes[i].glyph.textContent = '';
  }

  // Pre-paint final symbols into DOM but keep glyphs invisible until each lands.
  paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
  for (const i of drops) {
    gsap.set(cellNodes[i].glyph, { opacity: 0 });
  }

  const dropTl = gsap.timeline();
  let t = 0;
  // Drop column by column, top row first (as they enter the board).
  for (let c = 0; c < GRID_SIZE; c += 1) {
    const colDrops = drops
      .filter((i) => i % GRID_SIZE === c)
      .sort((a, b) => a - b);
    colDrops.forEach((i, orderInCol) => {
      const id = step.symbolsAfter[i];
      const { x, y } = cellCenterInFx(i);
      const fly = spawnFxNode('fly-glyph', x, y);
      fly.textContent = SYMBOL_BY_ID[id]?.glyph || '';
      fly.style.fontSize = getComputedStyle(cellNodes[i].glyph).fontSize;
      const rowsFall = Math.max(2, step.fallDistance[i] || 2);
      const startY = -(rowsFall + 1.2) * size;

      dropTl.fromTo(
        fly,
        { x: 0, y: startY, xPercent: -50, yPercent: -50, opacity: 1 },
        {
          x: 0,
          y: 0,
          duration: 0.48 + orderInCol * 0.04,
          ease: 'bounce.out',
          onComplete: () => {
            gsap.set(cellNodes[i].glyph, { opacity: 1, clearProps: 'opacity' });
            fly.remove();
          },
        },
        t,
      );
      t += 0.075;
    });
  }

  await dropTl;
  gsap.set(
    cellNodes.map((n) => n.glyph),
    { clearProps: 'transform,opacity' },
  );
  paintBoard(step.symbolsAfter, step.multipliersAfter, step.marksAfter, []);
}

async function animateStep(step) {
  paintBoard(step.symbolsBefore, step.multipliersBefore, step.marksBefore, step.winningCells);

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
    if (result.retrigger) {
      await showFreeSpinsAward(result.retrigger);
      showToast(`🍭 ×${result.scatterCount} → +${result.retrigger} FREE SPINS`);
    }
    if (result.done) {
      fillEmptyCells(state);
      paintBoard(state.symbols, state.multipliers, state.marks, []);
      settleBonusRound(result.totalBonusWin);
    } else {
      saveCache();
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
  saveCache();
  if (result.triggeredBonus) {
    await showFreeSpinsAward(10);
    showToast('🍭 ×3+ бонус открыт!');
    els.status.textContent = 'Бонус открыт · 3 Free Spin за спин дают +5';
    updateHud();
    paintBoard(state.symbols, state.multipliers, state.marks, []);
  } else {
    els.status.textContent =
      result.spinWin > 0
        ? `Выигрыш ${formatVardin(result.spinWin)}`
        : 'Баллы с бонуса → промокод на скидку · 🍭×3 = +5 FS';
  }
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
      ? '10 фриспинов · все клетки ×2, при взрыве удваиваются и липнут'
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
  saveCache();
  showToast(result.mode === 'super' ? 'SUPER BONUS!' : 'FREE SPINS!');
  els.status.textContent = 'Нажмите SPIN / FS для фриспина';
}

function bind() {
  els.spinBtn.addEventListener('click', onSpin);
  els.betMinus.addEventListener('click', () => {
    if (animating || state.mode !== 'base') return;
    changeBet(state, -1);
    updateHud();
    saveCache();
  });
  els.betPlus.addEventListener('click', () => {
    if (animating || state.mode !== 'base') return;
    changeBet(state, 1);
    updateHud();
    saveCache();
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
    saveCache();
  });
  els.walletBtn?.addEventListener('click', () => {
    openRewardOverlay({
      roundWin: rewardBank,
      pity: 0,
      title: 'Баллы и промокоды',
    });
    if (els.overlayPoints) {
      els.overlayPoints.textContent = `${formatVardinShort(rewardBank)} баллов`;
    }
    if (promoCodes[0]) showIssuedCode(promoCodes[0].code);
  });
  els.promoCopy?.addEventListener('click', async () => {
    const code = lastIssuedCode || promoCodes[0]?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      showToast('Промокод скопирован');
    } catch {
      showToast(code);
    }
  });
}

function setSplashProgress(pct) {
  const bar = document.getElementById('splash-bar');
  const label = document.getElementById('splash-pct');
  const value = Math.max(0, Math.min(100, Math.round(pct)));
  if (bar) bar.style.width = `${value}%`;
  if (label) label.textContent = `${value}%`;
}

async function hideSplash() {
  const splash = document.getElementById('splash');
  if (!splash) return;
  splash.classList.add('is-done');
  if (reduceMotion) {
    splash.remove();
    return;
  }
  await gsap.to(splash, {
    autoAlpha: 0,
    scale: 1.04,
    duration: 0.55,
    ease: 'power2.inOut',
  });
  splash.remove();
}

async function boot() {
  setSplashProgress(8);
  initTelegram();
  setSplashProgress(18);
  await wait(120);

  restoreFromCache();
  setSplashProgress(34);
  await wait(120);

  buildBoard();
  setSplashProgress(55);
  await wait(140);

  fillEmptyCells(state);
  paintBoard(state.symbols, state.multipliers, state.marks, []);
  setSplashProgress(74);
  await wait(140);

  bind();
  updateHud();
  saveCache();
  els.status.textContent =
    `С возвращением, ${getTelegramUserName()} · баллы копите на промокод от 5%`;
  setSplashProgress(92);
  await wait(180);

  setSplashProgress(100);
  await wait(160);
  await hideSplash();

  if (!reduceMotion) {
    gsap.from('.slot', { opacity: 0, y: 16, duration: 0.45, ease: 'power2.out' });
  }
}

boot();
