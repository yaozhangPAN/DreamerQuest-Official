import { UserStats, SpellingSession } from '../types';

/** Fields written only by the server (Stripe webhook). */
const SERVER_OWNED_KEYS = ['isSubscribed'] as const;

function stripSpellingImages(sessions: SpellingSession[]): SpellingSession[] {
  return sessions.map((session) => ({
    ...session,
    listImages: [],
  }));
}

/** Payload safe for client Firestore writes — excludes server-owned fields and heavy image blobs. */
export function toClientFirestorePayload(stats: UserStats): Record<string, unknown> {
  return {
    profile: stats.profile,
    totalXp: stats.totalXp,
    level: stats.level,
    prizesWon: stats.prizesWon,
    submissionHistory: stats.submissionHistory,
    submissions: stats.submissions ?? [],
    lastScore: stats.lastScore,
    bonusCharges: stats.bonusCharges,
    activeSpellingSessions: stripSpellingImages(stats.activeSpellingSessions ?? []),
  };
}

export function mergeUserStatsFromFirestore(
  data: Record<string, unknown>,
  defaults: UserStats
): UserStats {
  const legacySession = data.activeSpellingSession as SpellingSession | null | undefined;
  const activeSpellingSessions =
    (data.activeSpellingSessions as SpellingSession[] | undefined) ??
    (legacySession ? [legacySession] : defaults.activeSpellingSessions);

  return {
    ...defaults,
    ...data,
    submissions: (data.submissions as UserStats['submissions']) ?? [],
    activeSpellingSessions,
    isSubscribed: Boolean(data.isSubscribed),
  } as UserStats;
}

export function isServerOwnedField(key: string): boolean {
  return (SERVER_OWNED_KEYS as readonly string[]).includes(key);
}
