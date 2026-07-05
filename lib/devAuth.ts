/// <reference types="vite/client" />
import { UserStats } from '../types';

export const DEV_USER_ID = 'dev-local-user';
const STATS_KEY = 'dreamerquest_dev_stats';
const SESSION_KEY = 'dreamerquest_dev_session';

export const devUser = {
  uid: DEV_USER_ID,
  email: 'dev@local.test',
  displayName: 'Dev User',
};

export function isDevAuthBypassEnabled(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
}

export function getDevSession(): boolean {
  return localStorage.getItem(SESSION_KEY) === 'true';
}

export function setDevSession(active: boolean): void {
  if (active) {
    localStorage.setItem(SESSION_KEY, 'true');
  } else {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(STATS_KEY);
  }
}

export function loadDevStats(): UserStats | null {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserStats;
  } catch {
    return null;
  }
}

export function saveDevStats(stats: UserStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}
