'use strict';
// Which plans unlock Diary Pro features.
//
// Diary can be bought on its own, and it is also included with the paid Forge
// plans. Other products' plans (Sweep, Excel, Documents) do NOT include it.
// Plan names are matched exactly. They used to be matched by "contains 'pro'",
// which let a Sweep Pro subscriber into Diary Pro for free.

const DIARY_PLANS = ['diary-pro'];
const FORGE_PLANS_WITH_DIARY = ['creator', 'professional', 'work-like-a-pro', 'pro', 'team', 'enterprise'];

// 'diary-pro-yearly' and 'creator-yearly' are the same plan as their monthly form.
function normalise(tier) {
  return String(tier || '').trim().toLowerCase().replace(/-(monthly|yearly)$/, '');
}
function isDiaryPlan(tier) { return DIARY_PLANS.includes(normalise(tier)); }
function isForgePlanWithDiary(tier) {
  const t = normalise(tier);
  return FORGE_PLANS_WITH_DIARY.includes(t) || t === 'forge' || t.startsWith('forge-');
}

// subRows: the user's rows from the per-product subscriptions table
//          ({ product, tier, status }), in any order.
// userTier: users.tier. It holds only the most recent purchase, so it is used only
//           for accounts that have no Diary or Forge record in the table at all.
// Returns { entitled, tier, via }. `tier` is the plan name the limit tables use.
function diaryEntitlement(subRows, userTier) {
  const rows = Array.isArray(subRows) ? subRows : [];
  const active = rows.filter(r => r && r.status === 'active');

  for (const r of active) {
    if (r.product === 'diary' && isDiaryPlan(r.tier)) return { entitled: true, tier: normalise(r.tier), via: 'diary' };
  }
  for (const r of active) {
    if (r.product === 'forge' && isForgePlanWithDiary(r.tier)) return { entitled: true, tier: normalise(r.tier), via: 'forge' };
  }

  // Accounts that predate the table: fall back to users.tier, but only when the
  // table has nothing about Diary or Forge for them. A cancelled Diary row must not
  // be overruled by a stale users.tier.
  const hasProductRecord = rows.some(r => r && (r.product === 'diary' || r.product === 'forge'));
  if (!hasProductRecord) {
    if (isDiaryPlan(userTier) || isForgePlanWithDiary(userTier)) {
      return { entitled: true, tier: normalise(userTier), via: 'legacy' };
    }
  }
  return { entitled: false, tier: 'starter', via: null };
}

module.exports = { diaryEntitlement, normalise, DIARY_PLANS, FORGE_PLANS_WITH_DIARY };
