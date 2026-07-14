import { UserStats } from '../types';

/** Hardcoded QA admin credentials (client-side test account only). */
export const ADMIN_USERNAME = 'ADM!N_ACC0UNT';
export const ADMIN_PASSWORD = 'ABCD!@#$';

export const ADMIN_USER_ID = 'admin-test-user';
const SESSION_KEY = 'dreamerquest_admin_session';
const STATS_KEY = 'dreamerquest_admin_stats';

export const adminUser = {
  uid: ADMIN_USER_ID,
  email: 'admin@local.test',
  displayName: 'Admin Tester',
};

export function validateAdminCredentials(username: string, password: string): boolean {
  return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
}

export function getAdminSession(): boolean {
  return localStorage.getItem(SESSION_KEY) === 'true';
}

export function setAdminSession(active: boolean): void {
  if (active) {
    localStorage.setItem(SESSION_KEY, 'true');
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
}

export function loadAdminStats(): UserStats | null {
  const raw = localStorage.getItem(STATS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserStats;
  } catch {
    return null;
  }
}

export function saveAdminStats(stats: UserStats): void {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
}

export function clearAdminStats(): void {
  localStorage.removeItem(STATS_KEY);
}
