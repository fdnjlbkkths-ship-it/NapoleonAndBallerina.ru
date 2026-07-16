/**
 * Per-Telegram-user cache (localStorage) for win bank and promo codes.
 */

const STORAGE_PREFIX = 'sweet-rush-v1';

export function getTelegramUserId() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (user?.id) return String(user.id);
  return 'guest';
}

export function getTelegramUserName() {
  const user = window.Telegram?.WebApp?.initDataUnsafe?.user;
  if (!user) return 'Гость';
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.username || 'Игрок';
}

function storageKey(userId = getTelegramUserId()) {
  return `${STORAGE_PREFIX}:${userId}`;
}

export function loadUserCache() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (!raw) return defaultCache();
    const data = JSON.parse(raw);
    return {
      ...defaultCache(),
      ...data,
      codes: Array.isArray(data.codes) ? data.codes : [],
    };
  } catch {
    return defaultCache();
  }
}

export function defaultCache() {
  return {
    userId: getTelegramUserId(),
    rewardBank: 0,
    balance: null, // null → use engine START_BALANCE on first run
    betIndex: null,
    codes: [],
    updatedAt: 0,
  };
}

export function saveUserCache(partial) {
  const prev = loadUserCache();
  const next = {
    ...prev,
    ...partial,
    userId: getTelegramUserId(),
    updatedAt: Date.now(),
  };
  try {
    localStorage.setItem(storageKey(), JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
  return next;
}

export function persistProgress({ rewardBank, balance, betIndex, codes }) {
  return saveUserCache({
    rewardBank,
    balance,
    betIndex,
    codes: codes || loadUserCache().codes,
  });
}
