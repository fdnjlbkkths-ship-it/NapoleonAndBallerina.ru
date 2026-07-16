/**
 * Promo rewards for the home confectionery.
 * Winnings (Вардин) can be exchanged for discount codes.
 */

export const PROMO_CURRENCY_LABEL = 'баллов';

/** Minimum points a finished bonus round should grant toward a 5% code. */
export const MIN_BONUS_ROUND_POINTS = 500;

export const PROMO_TIERS = [
  {
    id: 'p5',
    discount: 5,
    cost: 500,
    title: 'Скидка 5%',
    hint: 'На любой десерт',
    prefix: 'SWEET5',
  },
  {
    id: 'p7',
    discount: 7,
    cost: 900,
    title: 'Скидка 7%',
    hint: 'На пирожные и эклеры',
    prefix: 'SWEET7',
  },
  {
    id: 'p10',
    discount: 10,
    cost: 1500,
    title: 'Скидка 10%',
    hint: 'На торты от 1500 ₽',
    prefix: 'SWEET10',
  },
  {
    id: 'p15',
    discount: 15,
    cost: 2500,
    title: 'Скидка 15%',
    hint: 'На набор «Анна Павлова»',
    prefix: 'SWEET15',
  },
  {
    id: 'p20',
    discount: 20,
    cost: 4000,
    title: 'Скидка 20%',
    hint: 'На праздничный торт',
    prefix: 'SWEET20',
  },
];

export function getTier(id) {
  return PROMO_TIERS.find((t) => t.id === id) || null;
}

function randomChunk(len = 4) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += alphabet[(Math.random() * alphabet.length) | 0];
  }
  return out;
}

export function generatePromoCode(tier) {
  return `${tier.prefix}-${randomChunk(4)}-${randomChunk(4)}`;
}

/**
 * Apply pity floor so one full bonus round always covers at least a 5% code.
 */
export function applyBonusPity(rawRoundWin) {
  const win = Math.max(0, Number(rawRoundWin) || 0);
  if (win >= MIN_BONUS_ROUND_POINTS) {
    return { credited: win, pity: 0 };
  }
  const pity = +(MIN_BONUS_ROUND_POINTS - win).toFixed(2);
  return { credited: MIN_BONUS_ROUND_POINTS, pity };
}

export function canRedeem(bank, tierId) {
  const tier = getTier(tierId);
  if (!tier) return false;
  return bank + 1e-9 >= tier.cost;
}

export function redeemPromo(bank, tierId) {
  const tier = getTier(tierId);
  if (!tier || bank + 1e-9 < tier.cost) {
    return { ok: false, reason: 'funds' };
  }
  const code = generatePromoCode(tier);
  return {
    ok: true,
    tier,
    code,
    bankAfter: +(bank - tier.cost).toFixed(2),
    issuedAt: Date.now(),
  };
}
