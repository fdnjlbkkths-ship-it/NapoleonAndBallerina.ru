import assert from 'node:assert/strict';
import {
  PROMO_TIERS,
  MIN_BONUS_ROUND_POINTS,
  applyBonusPity,
  redeemPromo,
  canRedeem,
} from './promo.js';

{
  assert.equal(MIN_BONUS_ROUND_POINTS, 500);
  assert.equal(PROMO_TIERS[0].discount, 5);
  assert.equal(PROMO_TIERS[0].cost, MIN_BONUS_ROUND_POINTS);
}

{
  const low = applyBonusPity(120);
  assert.equal(low.credited, 500);
  assert.equal(low.pity, 380);

  const ok = applyBonusPity(800);
  assert.equal(ok.credited, 800);
  assert.equal(ok.pity, 0);
}

{
  assert.equal(canRedeem(500, 'p5'), true);
  assert.equal(canRedeem(499, 'p5'), false);
  const out = redeemPromo(500, 'p5');
  assert.equal(out.ok, true);
  assert.equal(out.bankAfter, 0);
  assert.match(out.code, /^SWEET5-/);
}

console.log('promo.test.mjs: all passed');
