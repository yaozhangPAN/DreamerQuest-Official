/// <reference types="vite/client" />
import { UserProfile, UserStats } from '../types';

/** Legacy fixed id — only used as fallback for old sessions. */
export const DEV_USER_ID = 'dev-local-user';

const SESSION_KEY = 'dreamerquest_dev_session';
const UID_KEY = 'dreamerquest_dev_uid';
const STATS_PREFIX = 'dreamerquest_dev_stats_';
/** Legacy single-slot stats key (migrate once if present). */
const LEGACY_STATS_KEY = 'dreamerquest_dev_stats';

export function isDevAuthBypassEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
}

export function getDevAccountUid(): string | null {
  return localStorage.getItem(UID_KEY);
}

export function getDevUser(uid?: string | null): { uid: string; email: string; displayName: string } {
  const id = uid || getDevAccountUid() || DEV_USER_ID;
  return {
    uid: id,
    email: `${id}@local.test`,
    displayName: 'Dev User',
  };
}

/** @deprecated Prefer getDevUser(getDevAccountUid()) */
export const devUser = getDevUser(DEV_USER_ID);

export function getDevSession(): boolean {
  return localStorage.getItem(SESSION_KEY) === 'true' && !!getDevAccountUid();
}

export function setDevSession(active: boolean): void {
  if (active) {
    localStorage.setItem(SESSION_KEY, 'true');
  } else {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(UID_KEY);
  }
}

function statsKeyForUid(uid: string): string {
  return `${STATS_PREFIX}${uid}`;
}

export function loadDevStats(uid?: string | null): UserStats | null {
  const id = uid || getDevAccountUid();
  if (!id) return null;

  const raw = localStorage.getItem(statsKeyForUid(id));
  if (raw) {
    try {
      return JSON.parse(raw) as UserStats;
    } catch {
      return null;
    }
  }

  // Migrate legacy single-account stats onto this uid once.
  if (id === DEV_USER_ID) {
    const legacy = localStorage.getItem(LEGACY_STATS_KEY);
    if (legacy) {
      try {
        const parsed = JSON.parse(legacy) as UserStats;
        saveDevStats(parsed, id);
        return parsed;
      } catch {
        return null;
      }
    }
  }

  return null;
}

export function saveDevStats(stats: UserStats, uid?: string | null): void {
  const id = uid || getDevAccountUid();
  if (!id) return;
  localStorage.setItem(statsKeyForUid(id), JSON.stringify(stats));
}

/**
 * Creates a brand-new local account with a unique uid so quiz attempts
 * and progress are isolated per account (not shared across "new" profiles).
 */
export function createNewDevAccount(profile: UserProfile): {
  uid: string;
  stats: UserStats;
} {
  const uid = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const stats: UserStats = {
    profile,
    totalXp: 0,
    level: 1,
    prizesWon: [],
    submissionHistory: [],
    submissions: [],
    lastScore: 0,
    bonusCharges: 0,
    activeSpellingSessions: [],
    isSubscribed: false,
  };

  localStorage.setItem(UID_KEY, uid);
  localStorage.setItem(SESSION_KEY, 'true');
  saveDevStats(stats, uid);

  return { uid, stats };
}

/** Resume an existing local session uid after refresh. */
export function ensureDevSessionUid(): string {
  let uid = getDevAccountUid();
  if (!uid) {
    uid = DEV_USER_ID;
    localStorage.setItem(UID_KEY, uid);
  }
  localStorage.setItem(SESSION_KEY, 'true');
  return uid;
}
