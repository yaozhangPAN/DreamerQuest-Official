import { readFileSync, existsSync } from 'fs';
import path from 'path';
import type { Firestore } from 'firebase-admin/firestore';
import {
  AdminNotification,
  ArticleMcqQuestion,
  ArticleQuiz,
  ArticleQuizClassStats,
  ArticleQuizGroup,
  ArticleQuizGroupMembership,
  ArticleQuizRoster,
  ArticleQuizSubmission,
} from '../types';

export { normalizeGeneratedQuestions } from './articleQuizUtils';

const COL = {
  quizzes: 'dq_article_quizzes',
  submissions: 'dq_article_quiz_submissions',
  stats: 'dq_article_quiz_stats',
  reads: 'dq_article_quiz_reads',
  groups: 'dq_article_quiz_groups',
  memberships: 'dq_article_quiz_memberships',
  notifications: 'dq_admin_notifications',
} as const;

type ArticleReadRecord = {
  id: string;
  quizId: string;
  uid: string;
  readAt: number;
  readXpAwarded: boolean;
};

let db: Firestore | null = null;
let migrated = false;

export function initArticleQuizStore(firestore: Firestore) {
  db = firestore;
}

function requireDb(): Firestore {
  if (!db) {
    throw new Error('Article quiz store not initialized. Call initArticleQuizStore(db) first.');
  }
  return db;
}

/** Firestore rejects `undefined` field values. */
function stripUndefined<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeMembership(raw: ArticleQuizGroupMembership): ArticleQuizGroupMembership {
  return {
    ...raw,
    status: raw.status === 'pending' ? 'pending' : 'approved',
    requestedAt: raw.requestedAt || raw.joinedAt,
  };
}

function isApproved(m: ArticleQuizGroupMembership): boolean {
  return m.status !== 'pending';
}

function normalizeGroupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateGroupCodeCandidate(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

async function pushJoinNotification(input: {
  groupId: string;
  groupName: string;
  uid: string;
  studentName: string;
}) {
  const firestore = requireDb();
  const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const notification: AdminNotification = {
    id,
    type: 'group_join_request',
    groupId: input.groupId,
    groupName: input.groupName,
    uid: input.uid,
    studentName: input.studentName || 'Student',
    createdAt: Date.now(),
    read: false,
  };
  await firestore.collection(COL.notifications).doc(id).set(stripUndefined(notification));
}

/**
 * One-time: if Firestore has no groups yet but local data/*.json exists, import it.
 * Safe for Cloud Run (no local files) and local recovery.
 */
export async function migrateLocalArticleQuizDataIfNeeded(): Promise<void> {
  if (migrated) return;
  migrated = true;
  const firestore = requireDb();

  try {
    const existing = await firestore.collection(COL.groups).limit(1).get();
    if (!existing.empty) return;

    const dataDir = path.join(process.cwd(), 'data');
    const groupsPath = path.join(dataDir, 'article-quiz-groups.json');
    if (!existsSync(groupsPath)) return;

    const readJson = <T>(file: string, fallback: T): T => {
      const p = path.join(dataDir, file);
      if (!existsSync(p)) return fallback;
      return JSON.parse(readFileSync(p, 'utf-8')) as T;
    };

    const groups = readJson<ArticleQuizGroup[]>('article-quiz-groups.json', []);
    const quizzes = readJson<ArticleQuiz[]>('article-quizzes.json', []);
    const submissions = readJson<ArticleQuizSubmission[]>('article-quiz-submissions.json', []);
    const stats = readJson<Record<string, ArticleQuizClassStats>>('article-quiz-stats.json', {});
    const reads = readJson<ArticleReadRecord[]>('article-quiz-reads.json', []);
    const memberships = readJson<ArticleQuizGroupMembership[]>('article-quiz-memberships.json', []);
    const notifications = readJson<AdminNotification[]>('admin-notifications.json', []);

    if (groups.length === 0 && quizzes.length === 0) return;

    const batchWrite = async (ops: Array<() => Promise<unknown>>) => {
      const CHUNK = 400;
      for (let i = 0; i < ops.length; i += CHUNK) {
        const chunk = ops.slice(i, i + CHUNK);
        await Promise.all(chunk.map((fn) => fn()));
      }
    };

    await batchWrite([
      ...groups.map(
        (g) => () => firestore.collection(COL.groups).doc(g.id).set(stripUndefined(g)),
      ),
      ...quizzes.map(
        (q) => () => firestore.collection(COL.quizzes).doc(q.id).set(stripUndefined(q)),
      ),
      ...submissions.map(
        (s) => () => firestore.collection(COL.submissions).doc(s.id).set(stripUndefined(s)),
      ),
      ...Object.values(stats).map(
        (s) => () => firestore.collection(COL.stats).doc(s.quizId).set(stripUndefined(s)),
      ),
      ...reads.map(
        (r) => () => firestore.collection(COL.reads).doc(r.id).set(stripUndefined(r)),
      ),
      ...memberships.map(
        (m) => () =>
          firestore
            .collection(COL.memberships)
            .doc(m.uid)
            .set(stripUndefined(normalizeMembership(m))),
      ),
      ...notifications.map(
        (n) => () => firestore.collection(COL.notifications).doc(n.id).set(stripUndefined(n)),
      ),
    ]);

    console.log(
      `[articleQuizStore] Migrated local JSON → Firestore (${groups.length} groups, ${quizzes.length} quizzes).`,
    );
  } catch (err) {
    console.warn('[articleQuizStore] Local JSON migration skipped/failed:', err);
  }
}

export async function listGroups(): Promise<ArticleQuizGroup[]> {
  const snap = await requireDb().collection(COL.groups).get();
  return snap.docs
    .map((d) => d.data() as ArticleQuizGroup)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function getGroup(id: string): Promise<ArticleQuizGroup | undefined> {
  const doc = await requireDb().collection(COL.groups).doc(id).get();
  return doc.exists ? (doc.data() as ArticleQuizGroup) : undefined;
}

export async function getGroupByCode(code: string): Promise<ArticleQuizGroup | undefined> {
  const normalized = normalizeGroupCode(code);
  if (!normalized) return undefined;
  const snap = await requireDb()
    .collection(COL.groups)
    .where('code', '==', normalized)
    .limit(1)
    .get();
  if (snap.empty) return undefined;
  return snap.docs[0].data() as ArticleQuizGroup;
}

export async function createGroup(name: string, code?: string): Promise<ArticleQuizGroup> {
  const firestore = requireDb();
  const trimmedName = name.trim() || 'Untitled Group';
  let normalized = code ? normalizeGroupCode(code) : '';

  if (!normalized) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const candidate = generateGroupCodeCandidate();
      const existing = await getGroupByCode(candidate);
      if (!existing) {
        normalized = candidate;
        break;
      }
    }
    if (!normalized) {
      normalized = `G${Date.now().toString(36).toUpperCase().slice(-5)}`;
    }
  }

  if (normalized.length < 4) {
    throw new Error('Group code must be at least 4 letters/numbers');
  }
  if (await getGroupByCode(normalized)) {
    throw new Error('That group code is already in use');
  }

  const group: ArticleQuizGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    code: normalized,
    createdAt: Date.now(),
  };
  await firestore.collection(COL.groups).doc(group.id).set(stripUndefined(group));
  return group;
}

export async function deleteGroup(id: string): Promise<boolean> {
  const firestore = requireDb();
  const groupRef = firestore.collection(COL.groups).doc(id);
  const groupDoc = await groupRef.get();
  if (!groupDoc.exists) return false;

  await groupRef.delete();

  const [membershipsSnap, quizzesSnap] = await Promise.all([
    firestore.collection(COL.memberships).where('groupId', '==', id).get(),
    firestore.collection(COL.quizzes).where('groupId', '==', id).get(),
  ]);

  const batch = firestore.batch();
  membershipsSnap.docs.forEach((d) => batch.delete(d.ref));
  quizzesSnap.docs.forEach((d) => {
    batch.update(d.ref, { groupId: null, updatedAt: Date.now() });
  });
  await batch.commit();
  return true;
}

export async function getMembershipForUser(
  uid: string,
): Promise<ArticleQuizGroupMembership | null> {
  const doc = await requireDb().collection(COL.memberships).doc(uid).get();
  if (!doc.exists) return null;
  return normalizeMembership(doc.data() as ArticleQuizGroupMembership);
}

export async function getGroupForUser(uid: string): Promise<ArticleQuizGroup | null> {
  const membership = await getMembershipForUser(uid);
  if (!membership || !isApproved(membership)) return null;
  return (await getGroup(membership.groupId)) || null;
}

export async function getPendingGroupForUser(uid: string): Promise<ArticleQuizGroup | null> {
  const membership = await getMembershipForUser(uid);
  if (!membership || membership.status !== 'pending') return null;
  return (await getGroup(membership.groupId)) || null;
}

export async function requestJoinGroupByCode(
  uid: string,
  code: string,
  studentName?: string,
): Promise<{ group: ArticleQuizGroup; status: 'pending' | 'approved'; alreadyMember: boolean }> {
  const group = await getGroupByCode(code);
  if (!group) throw new Error('Invalid group code');

  const existing = await getMembershipForUser(uid);
  const name = (studentName || existing?.studentName || '').trim() || 'Student';

  if (existing && existing.groupId === group.id) {
    if (isApproved(existing)) {
      return { group, status: 'approved', alreadyMember: true };
    }
    return { group, status: 'pending', alreadyMember: false };
  }

  const now = Date.now();
  const membership: ArticleQuizGroupMembership = {
    uid,
    groupId: group.id,
    joinedAt: now,
    status: 'pending',
    studentName: name,
    requestedAt: now,
  };
  await requireDb().collection(COL.memberships).doc(uid).set(stripUndefined(membership));
  await pushJoinNotification({
    groupId: group.id,
    groupName: group.name,
    uid,
    studentName: name,
  });
  return { group, status: 'pending', alreadyMember: false };
}

export async function approveGroupMembership(uid: string): Promise<ArticleQuizGroup> {
  const membership = await getMembershipForUser(uid);
  if (!membership) throw new Error('No join request found for this student');

  const group = await getGroup(membership.groupId);
  if (!group) throw new Error('Group not found');

  if (membership.status !== 'pending') return group;

  await requireDb()
    .collection(COL.memberships)
    .doc(uid)
    .set(
      stripUndefined({
        ...membership,
        status: 'approved',
        joinedAt: Date.now(),
        reviewedAt: Date.now(),
      }),
    );
  return group;
}

export async function rejectGroupMembership(uid: string): Promise<boolean> {
  const membership = await getMembershipForUser(uid);
  if (!membership || membership.status !== 'pending') return false;
  await requireDb().collection(COL.memberships).doc(uid).delete();
  return true;
}

export async function listPendingMemberships(groupId?: string): Promise<
  Array<ArticleQuizGroupMembership & { groupName: string; groupCode: string }>
> {
  const firestore = requireDb();
  let snap;
  if (groupId) {
    snap = await firestore
      .collection(COL.memberships)
      .where('groupId', '==', groupId)
      .get();
  } else {
    snap = await firestore.collection(COL.memberships).get();
  }

  const groups = await listGroups();
  const groupMap = new Map(groups.map((g) => [g.id, g]));

  return snap.docs
    .map((d) => normalizeMembership(d.data() as ArticleQuizGroupMembership))
    .filter((m) => m.status === 'pending' && (!groupId || m.groupId === groupId))
    .map((m) => {
      const group = groupMap.get(m.groupId);
      return {
        ...m,
        groupName: group?.name || 'Unknown group',
        groupCode: group?.code || '',
      };
    })
    .sort((a, b) => (b.requestedAt || b.joinedAt) - (a.requestedAt || a.joinedAt));
}

export async function listApprovedMembers(
  groupId: string,
): Promise<ArticleQuizGroupMembership[]> {
  const snap = await requireDb()
    .collection(COL.memberships)
    .where('groupId', '==', groupId)
    .get();
  return snap.docs
    .map((d) => normalizeMembership(d.data() as ArticleQuizGroupMembership))
    .filter((m) => isApproved(m));
}

export async function listAdminNotifications(): Promise<AdminNotification[]> {
  const snap = await requireDb().collection(COL.notifications).get();
  return snap.docs
    .map((d) => d.data() as AdminNotification)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function markAdminNotificationsRead(ids?: string[]): Promise<number> {
  const firestore = requireDb();
  const snap = await firestore.collection(COL.notifications).get();
  let count = 0;
  const updates: Promise<unknown>[] = [];
  for (const doc of snap.docs) {
    const n = doc.data() as AdminNotification;
    if (n.read) continue;
    if (ids && ids.length > 0 && !ids.includes(n.id)) continue;
    count += 1;
    updates.push(doc.ref.update({ read: true }));
  }
  await Promise.all(updates);
  return count;
}

export async function leaveGroup(uid: string): Promise<boolean> {
  const ref = requireDb().collection(COL.memberships).doc(uid);
  const doc = await ref.get();
  if (!doc.exists) return false;
  await ref.delete();
  return true;
}

export async function getSubmissionForUser(
  quizId: string,
  uid: string,
): Promise<ArticleQuizSubmission | undefined> {
  const doc = await requireDb()
    .collection(COL.submissions)
    .doc(`${quizId}_${uid}`)
    .get();
  return doc.exists ? (doc.data() as ArticleQuizSubmission) : undefined;
}

export async function listCompletedQuizIdsForUser(uid: string): Promise<string[]> {
  const snap = await requireDb()
    .collection(COL.submissions)
    .where('uid', '==', uid)
    .get();
  return snap.docs.map((d) => (d.data() as ArticleQuizSubmission).quizId);
}

export async function startArticleQuizRead(
  quizId: string,
  uid: string,
): Promise<{ alreadyRead: boolean; readXpAwarded: boolean; submission?: ArticleQuizSubmission }> {
  const quiz = await getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (!quiz.published) throw new Error('Quiz is not published');

  const existingSubmission = await getSubmissionForUser(quizId, uid);
  if (existingSubmission) {
    return {
      alreadyRead: true,
      readXpAwarded: false,
      submission: existingSubmission,
    };
  }

  const firestore = requireDb();
  const readId = `${quizId}_${uid}`;
  const existingRead = await firestore.collection(COL.reads).doc(readId).get();
  if (existingRead.exists) {
    return { alreadyRead: true, readXpAwarded: false };
  }

  const record: ArticleReadRecord = {
    id: readId,
    quizId,
    uid,
    readAt: Date.now(),
    readXpAwarded: true,
  };
  await firestore.collection(COL.reads).doc(readId).set(stripUndefined(record));
  return { alreadyRead: false, readXpAwarded: true };
}

export async function listQuizzes(
  publishedOnly = false,
  options?: { groupId?: string | null },
): Promise<ArticleQuiz[]> {
  if (options?.groupId === null) return [];

  const firestore = requireDb();
  let snap;
  if (options?.groupId) {
    snap = await firestore
      .collection(COL.quizzes)
      .where('groupId', '==', options.groupId)
      .get();
  } else {
    snap = await firestore.collection(COL.quizzes).get();
  }

  let list = snap.docs.map((d) => {
    const data = d.data() as ArticleQuiz;
    // Firestore may store null for cleared groupId
    if ((data as { groupId?: string | null }).groupId === null) {
      const { groupId: _removed, ...rest } = data as ArticleQuiz & { groupId?: string | null };
      return rest as ArticleQuiz;
    }
    return data;
  });

  if (publishedOnly) list = list.filter((q) => q.published);
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getQuiz(id: string): Promise<ArticleQuiz | undefined> {
  const doc = await requireDb().collection(COL.quizzes).doc(id).get();
  if (!doc.exists) return undefined;
  const data = doc.data() as ArticleQuiz & { groupId?: string | null };
  if (data.groupId === null) {
    const { groupId: _removed, ...rest } = data;
    return rest as ArticleQuiz;
  }
  return data;
}

export async function upsertQuiz(quiz: ArticleQuiz): Promise<ArticleQuiz> {
  const cleaned = stripUndefined(quiz);
  await requireDb().collection(COL.quizzes).doc(quiz.id).set(cleaned);
  return quiz;
}

export async function deleteQuiz(id: string): Promise<boolean> {
  const firestore = requireDb();
  const quizRef = firestore.collection(COL.quizzes).doc(id);
  const quizDoc = await quizRef.get();
  if (!quizDoc.exists) return false;

  await quizRef.delete();

  const [subs, stats, reads] = await Promise.all([
    firestore.collection(COL.submissions).where('quizId', '==', id).get(),
    firestore.collection(COL.stats).doc(id).get(),
    firestore.collection(COL.reads).where('quizId', '==', id).get(),
  ]);

  const batch = firestore.batch();
  subs.docs.forEach((d) => batch.delete(d.ref));
  reads.docs.forEach((d) => batch.delete(d.ref));
  if (stats.exists) batch.delete(stats.ref);
  await batch.commit();
  return true;
}

export async function updateQuizQuestions(
  id: string,
  questions: ArticleMcqQuestion[],
  extras?: Partial<Pick<ArticleQuiz, 'title' | 'article' | 'published' | 'sourceUrl' | 'groupId'>>,
): Promise<ArticleQuiz | null> {
  const quiz = await getQuiz(id);
  if (!quiz) return null;

  const updated: ArticleQuiz = {
    ...quiz,
    ...extras,
    questions,
    updatedAt: Date.now(),
  };

  // Persist cleared group as null so Firestore field is removed/cleared consistently
  const toSave = stripUndefined({
    ...updated,
    groupId: extras && 'groupId' in extras && extras.groupId == null ? null : updated.groupId,
  });
  await requireDb().collection(COL.quizzes).doc(id).set(toSave);
  return updated;
}

export async function submitQuizAnswers(input: {
  quizId: string;
  uid: string;
  studentName: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  overallFeedback?: string;
  questionResults?: ArticleQuizSubmission['questionResults'];
}): Promise<ArticleQuizSubmission> {
  const quiz = await getQuiz(input.quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (!quiz.published) throw new Error('Quiz is not published');

  if (await getSubmissionForUser(input.quizId, input.uid)) {
    throw new Error('This account already completed this quiz. Only one attempt per account.');
  }

  const submission: ArticleQuizSubmission = {
    id: `${input.quizId}_${input.uid}`,
    quizId: input.quizId,
    uid: input.uid,
    studentName: input.studentName,
    answers: input.answers,
    score: input.score,
    maxScore: input.maxScore,
    submittedAt: Date.now(),
    overallFeedback: input.overallFeedback,
    questionResults: input.questionResults,
  };

  await requireDb()
    .collection(COL.submissions)
    .doc(submission.id)
    .set(stripUndefined(submission));
  return submission;
}

export async function listSubmissionsForQuiz(
  quizId: string,
): Promise<ArticleQuizSubmission[]> {
  const snap = await requireDb()
    .collection(COL.submissions)
    .where('quizId', '==', quizId)
    .get();
  return snap.docs.map((d) => d.data() as ArticleQuizSubmission);
}

export async function saveQuizClassStats(
  stats: ArticleQuizClassStats,
): Promise<ArticleQuizClassStats> {
  await requireDb().collection(COL.stats).doc(stats.quizId).set(stripUndefined(stats));
  return stats;
}

export async function getQuizClassStats(
  quizId: string,
): Promise<ArticleQuizClassStats | null> {
  const doc = await requireDb().collection(COL.stats).doc(quizId).get();
  return doc.exists ? (doc.data() as ArticleQuizClassStats) : null;
}

/** Deterministic per-question accuracy + most common wrong answer from submissions. */
export function computeQuestionAccuracyFromSubmissions(
  quiz: ArticleQuiz,
  submissions: ArticleQuizSubmission[],
): ArticleQuizClassStats['questionAccuracy'] {
  return quiz.questions.map((q) => {
    const results = submissions.flatMap((s) =>
      (s.questionResults || []).filter((r) => r.questionId === q.id),
    );
    const answered = results.length;
    const correct = results.filter((r) => r.isCorrect).length;
    const wrongTexts = results
      .filter((r) => !r.isCorrect)
      .map((r) => String(r.studentAnswerText || '').trim())
      .filter(Boolean);

    const counts = new Map<string, { display: string; count: number }>();
    for (const text of wrongTexts) {
      const key = text.toLowerCase();
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { display: text, count: 1 });
    }

    let commonWrongAnswer: string | undefined;
    let commonWrongCount = 0;
    for (const { display, count } of counts.values()) {
      if (count > commonWrongCount) {
        commonWrongCount = count;
        commonWrongAnswer = display;
      }
    }

    return {
      questionId: q.id,
      prompt: q.prompt,
      correctRate: answered ? Math.round((correct / answered) * 100) : 0,
      commonWrongAnswer,
      commonWrongCount: commonWrongCount > 0 ? commonWrongCount : undefined,
    };
  });
}

export async function getRoster(
  quizId: string,
  students: Array<{ uid: string; studentName: string }>,
): Promise<ArticleQuizRoster> {
  const [quizSubs, classStats] = await Promise.all([
    listSubmissionsForQuiz(quizId),
    getQuizClassStats(quizId),
  ]);
  const submittedUids = new Set(quizSubs.map((s) => s.uid));

  const submitted = quizSubs
    .map((s) => ({
      uid: s.uid,
      studentName: s.studentName,
      score: s.score,
      maxScore: s.maxScore,
      submittedAt: s.submittedAt,
      overallFeedback: s.overallFeedback,
    }))
    .sort((a, b) => b.submittedAt - a.submittedAt);

  const rosterMap = new Map(students.map((s) => [s.uid, s.studentName]));
  for (const s of quizSubs) {
    if (!rosterMap.has(s.uid)) rosterMap.set(s.uid, s.studentName);
  }

  const unsubmitted = [...rosterMap.entries()]
    .filter(([uid]) => !submittedUids.has(uid))
    .map(([uid, studentName]) => ({ uid, studentName }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));

  return {
    quizId,
    submitted,
    unsubmitted,
    classStats,
  };
}
