import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const QUIZ_FILE = path.join(DATA_DIR, 'article-quizzes.json');
const SUB_FILE = path.join(DATA_DIR, 'article-quiz-submissions.json');
const STATS_FILE = path.join(DATA_DIR, 'article-quiz-stats.json');
const READS_FILE = path.join(DATA_DIR, 'article-quiz-reads.json');
const GROUPS_FILE = path.join(DATA_DIR, 'article-quiz-groups.json');
const MEMBERSHIPS_FILE = path.join(DATA_DIR, 'article-quiz-memberships.json');
const NOTIFS_FILE = path.join(DATA_DIR, 'admin-notifications.json');

type ArticleReadRecord = {
  id: string; // quizId_uid
  quizId: string;
  uid: string;
  readAt: number;
  readXpAwarded: boolean;
};

type Store = {
  quizzes: ArticleQuiz[];
  submissions: ArticleQuizSubmission[];
  classStats: Record<string, ArticleQuizClassStats>;
  reads: ArticleReadRecord[];
  groups: ArticleQuizGroup[];
  memberships: ArticleQuizGroupMembership[];
  notifications: AdminNotification[];
};

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

function ensureStore(): Store {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  const quizzes: ArticleQuiz[] = existsSync(QUIZ_FILE)
    ? JSON.parse(readFileSync(QUIZ_FILE, 'utf-8'))
    : [];
  const submissions: ArticleQuizSubmission[] = existsSync(SUB_FILE)
    ? JSON.parse(readFileSync(SUB_FILE, 'utf-8'))
    : [];
  const classStats: Record<string, ArticleQuizClassStats> = existsSync(STATS_FILE)
    ? JSON.parse(readFileSync(STATS_FILE, 'utf-8'))
    : {};
  const reads: ArticleReadRecord[] = existsSync(READS_FILE)
    ? JSON.parse(readFileSync(READS_FILE, 'utf-8'))
    : [];
  const groups: ArticleQuizGroup[] = existsSync(GROUPS_FILE)
    ? JSON.parse(readFileSync(GROUPS_FILE, 'utf-8'))
    : [];
  const membershipsRaw: ArticleQuizGroupMembership[] = existsSync(MEMBERSHIPS_FILE)
    ? JSON.parse(readFileSync(MEMBERSHIPS_FILE, 'utf-8'))
    : [];
  const memberships = membershipsRaw.map(normalizeMembership);
  const notifications: AdminNotification[] = existsSync(NOTIFS_FILE)
    ? JSON.parse(readFileSync(NOTIFS_FILE, 'utf-8'))
    : [];
  return { quizzes, submissions, classStats, reads, groups, memberships, notifications };
}

function saveQuizzes(quizzes: ArticleQuiz[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(QUIZ_FILE, JSON.stringify(quizzes, null, 2));
}

function saveSubmissions(submissions: ArticleQuizSubmission[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(SUB_FILE, JSON.stringify(submissions, null, 2));
}

function saveClassStats(classStats: Record<string, ArticleQuizClassStats>) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(STATS_FILE, JSON.stringify(classStats, null, 2));
}

function saveReads(reads: ArticleReadRecord[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(READS_FILE, JSON.stringify(reads, null, 2));
}

function saveGroups(groups: ArticleQuizGroup[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(GROUPS_FILE, JSON.stringify(groups, null, 2));
}

function saveMemberships(memberships: ArticleQuizGroupMembership[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(MEMBERSHIPS_FILE, JSON.stringify(memberships, null, 2));
}

function saveNotifications(notifications: AdminNotification[]) {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(NOTIFS_FILE, JSON.stringify(notifications, null, 2));
}

function pushJoinNotification(input: {
  groupId: string;
  groupName: string;
  uid: string;
  studentName: string;
}) {
  const store = ensureStore();
  const notification: AdminNotification = {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'group_join_request',
    groupId: input.groupId,
    groupName: input.groupName,
    uid: input.uid,
    studentName: input.studentName || 'Student',
    createdAt: Date.now(),
    read: false,
  };
  store.notifications.unshift(notification);
  saveNotifications(store.notifications.slice(0, 200));
}

function normalizeGroupCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function generateUniqueGroupCode(existing: ArticleQuizGroup[]): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 40; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!existing.some((g) => g.code === code)) return code;
  }
  return `G${Date.now().toString(36).toUpperCase().slice(-5)}`;
}

export function listGroups(): ArticleQuizGroup[] {
  return [...ensureStore().groups].sort((a, b) => b.createdAt - a.createdAt);
}

export function getGroup(id: string): ArticleQuizGroup | undefined {
  return ensureStore().groups.find((g) => g.id === id);
}

export function getGroupByCode(code: string): ArticleQuizGroup | undefined {
  const normalized = normalizeGroupCode(code);
  if (!normalized) return undefined;
  return ensureStore().groups.find((g) => g.code === normalized);
}

export function createGroup(name: string, code?: string): ArticleQuizGroup {
  const store = ensureStore();
  const trimmedName = name.trim() || 'Untitled Group';
  const normalized = code ? normalizeGroupCode(code) : generateUniqueGroupCode(store.groups);
  if (!normalized || normalized.length < 4) {
    throw new Error('Group code must be at least 4 letters/numbers');
  }
  if (store.groups.some((g) => g.code === normalized)) {
    throw new Error('That group code is already in use');
  }
  const group: ArticleQuizGroup = {
    id: `group_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmedName,
    code: normalized,
    createdAt: Date.now(),
  };
  store.groups.push(group);
  saveGroups(store.groups);
  return group;
}

export function deleteGroup(id: string): boolean {
  const store = ensureStore();
  const next = store.groups.filter((g) => g.id !== id);
  if (next.length === store.groups.length) return false;
  saveGroups(next);
  saveMemberships(store.memberships.filter((m) => m.groupId !== id));
  // Detach quizzes from deleted group
  const quizzes = store.quizzes.map((q) =>
    q.groupId === id ? { ...q, groupId: undefined, updatedAt: Date.now() } : q,
  );
  saveQuizzes(quizzes);
  return true;
}

export function getMembershipForUser(uid: string): ArticleQuizGroupMembership | null {
  const raw = ensureStore().memberships.find((m) => m.uid === uid);
  return raw ? normalizeMembership(raw) : null;
}

/** Approved group only — students cannot access quizzes while pending. */
export function getGroupForUser(uid: string): ArticleQuizGroup | null {
  const membership = getMembershipForUser(uid);
  if (!membership || !isApproved(membership)) return null;
  return getGroup(membership.groupId) || null;
}

export function getPendingGroupForUser(uid: string): ArticleQuizGroup | null {
  const membership = getMembershipForUser(uid);
  if (!membership || membership.status !== 'pending') return null;
  return getGroup(membership.groupId) || null;
}

/**
 * Request to join a group by code. Creates a pending membership until admin approves.
 * One membership record per account.
 */
export function requestJoinGroupByCode(
  uid: string,
  code: string,
  studentName?: string,
): { group: ArticleQuizGroup; status: 'pending' | 'approved'; alreadyMember: boolean } {
  const group = getGroupByCode(code);
  if (!group) throw new Error('Invalid group code');

  const store = ensureStore();
  const existing = store.memberships.find((m) => m.uid === uid);
  const name = (studentName || existing?.studentName || '').trim() || 'Student';

  if (existing && existing.groupId === group.id) {
    const normalized = normalizeMembership(existing);
    if (isApproved(normalized)) {
      return { group, status: 'approved', alreadyMember: true };
    }
    return { group, status: 'pending', alreadyMember: false };
  }

  const without = store.memberships.filter((m) => m.uid !== uid);
  const now = Date.now();
  without.push({
    uid,
    groupId: group.id,
    joinedAt: now,
    status: 'pending',
    studentName: name,
    requestedAt: now,
  });
  saveMemberships(without);
  pushJoinNotification({
    groupId: group.id,
    groupName: group.name,
    uid,
    studentName: name,
  });
  return { group, status: 'pending', alreadyMember: false };
}

/** @deprecated Use requestJoinGroupByCode — kept for older callers. */
export function joinGroupByCode(uid: string, code: string): ArticleQuizGroup {
  const result = requestJoinGroupByCode(uid, code);
  return result.group;
}

export function approveGroupMembership(uid: string): ArticleQuizGroup {
  const store = ensureStore();
  const idx = store.memberships.findIndex((m) => m.uid === uid);
  if (idx < 0) throw new Error('No join request found for this student');
  const membership = normalizeMembership(store.memberships[idx]);
  if (membership.status !== 'pending') {
    const group = getGroup(membership.groupId);
    if (!group) throw new Error('Group not found');
    return group;
  }
  const group = getGroup(membership.groupId);
  if (!group) throw new Error('Group not found');
  store.memberships[idx] = {
    ...membership,
    status: 'approved',
    joinedAt: Date.now(),
    reviewedAt: Date.now(),
  };
  saveMemberships(store.memberships);
  return group;
}

export function rejectGroupMembership(uid: string): boolean {
  const store = ensureStore();
  const membership = store.memberships.find((m) => m.uid === uid);
  if (!membership || normalizeMembership(membership).status !== 'pending') {
    return false;
  }
  saveMemberships(store.memberships.filter((m) => m.uid !== uid));
  return true;
}

export function listPendingMemberships(groupId?: string): Array<
  ArticleQuizGroupMembership & { groupName: string; groupCode: string }
> {
  const store = ensureStore();
  return store.memberships
    .map(normalizeMembership)
    .filter((m) => m.status === 'pending' && (!groupId || m.groupId === groupId))
    .map((m) => {
      const group = store.groups.find((g) => g.id === m.groupId);
      return {
        ...m,
        groupName: group?.name || 'Unknown group',
        groupCode: group?.code || '',
      };
    })
    .sort((a, b) => (b.requestedAt || b.joinedAt) - (a.requestedAt || a.joinedAt));
}

export function listApprovedMembers(groupId: string): ArticleQuizGroupMembership[] {
  return ensureStore()
    .memberships.map(normalizeMembership)
    .filter((m) => m.groupId === groupId && isApproved(m));
}

export function listAdminNotifications(): AdminNotification[] {
  return [...ensureStore().notifications].sort((a, b) => b.createdAt - a.createdAt);
}

export function markAdminNotificationsRead(ids?: string[]): number {
  const store = ensureStore();
  let count = 0;
  const next = store.notifications.map((n) => {
    if (n.read) return n;
    if (ids && ids.length > 0 && !ids.includes(n.id)) return n;
    count += 1;
    return { ...n, read: true };
  });
  saveNotifications(next);
  return count;
}

export function leaveGroup(uid: string): boolean {
  const store = ensureStore();
  const next = store.memberships.filter((m) => m.uid !== uid);
  if (next.length === store.memberships.length) return false;
  saveMemberships(next);
  return true;
}

export function getSubmissionForUser(
  quizId: string,
  uid: string,
): ArticleQuizSubmission | undefined {
  return ensureStore().submissions.find((s) => s.id === `${quizId}_${uid}`);
}

export function listCompletedQuizIdsForUser(uid: string): string[] {
  return ensureStore()
    .submissions.filter((s) => s.uid === uid)
    .map((s) => s.quizId);
}

/**
 * Record first entry to the reading page. Awards read XP once per quiz per user.
 * Throws if the user already submitted (one attempt only).
 */
export function startArticleQuizRead(
  quizId: string,
  uid: string,
): { alreadyRead: boolean; readXpAwarded: boolean; submission?: ArticleQuizSubmission } {
  const quiz = getQuiz(quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (!quiz.published) throw new Error('Quiz is not published');

  const existingSubmission = getSubmissionForUser(quizId, uid);
  if (existingSubmission) {
    return {
      alreadyRead: true,
      readXpAwarded: false,
      submission: existingSubmission,
    };
  }

  const store = ensureStore();
  const readId = `${quizId}_${uid}`;
  const existingRead = store.reads.find((r) => r.id === readId);
  if (existingRead) {
    return { alreadyRead: true, readXpAwarded: false };
  }

  store.reads.push({
    id: readId,
    quizId,
    uid,
    readAt: Date.now(),
    readXpAwarded: true,
  });
  saveReads(store.reads);
  return { alreadyRead: false, readXpAwarded: true };
}

export function listQuizzes(
  publishedOnly = false,
  options?: { groupId?: string | null },
): ArticleQuiz[] {
  const { quizzes } = ensureStore();
  let list = publishedOnly ? quizzes.filter((q) => q.published) : quizzes;
  if (options?.groupId) {
    list = list.filter((q) => q.groupId === options.groupId);
  } else if (options?.groupId === null) {
    // Explicit empty: student not in a group → no quizzes
    list = [];
  }
  return list.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getQuiz(id: string): ArticleQuiz | undefined {
  return ensureStore().quizzes.find((q) => q.id === id);
}

export function upsertQuiz(quiz: ArticleQuiz): ArticleQuiz {
  const { quizzes } = ensureStore();
  const idx = quizzes.findIndex((q) => q.id === quiz.id);
  if (idx >= 0) quizzes[idx] = quiz;
  else quizzes.push(quiz);
  saveQuizzes(quizzes);
  return quiz;
}

export function deleteQuiz(id: string): boolean {
  const store = ensureStore();
  const next = store.quizzes.filter((q) => q.id !== id);
  if (next.length === store.quizzes.length) return false;
  saveQuizzes(next);
  saveSubmissions(store.submissions.filter((s) => s.quizId !== id));
  return true;
}

export function updateQuizQuestions(
  id: string,
  questions: ArticleMcqQuestion[],
  extras?: Partial<Pick<ArticleQuiz, 'title' | 'article' | 'published' | 'sourceUrl' | 'groupId'>>,
): ArticleQuiz | null {
  const quiz = getQuiz(id);
  if (!quiz) return null;
  const updated: ArticleQuiz = {
    ...quiz,
    ...extras,
    questions,
    updatedAt: Date.now(),
  };
  return upsertQuiz(updated);
}

export function submitQuizAnswers(input: {
  quizId: string;
  uid: string;
  studentName: string;
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  overallFeedback?: string;
  questionResults?: ArticleQuizSubmission['questionResults'];
}): ArticleQuizSubmission {
  const quiz = getQuiz(input.quizId);
  if (!quiz) throw new Error('Quiz not found');
  if (!quiz.published) throw new Error('Quiz is not published');

  if (getSubmissionForUser(input.quizId, input.uid)) {
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

  const { submissions } = ensureStore();
  submissions.push(submission);
  saveSubmissions(submissions);
  return submission;
}

export function listSubmissionsForQuiz(quizId: string): ArticleQuizSubmission[] {
  return ensureStore().submissions.filter((s) => s.quizId === quizId);
}

export function saveQuizClassStats(stats: ArticleQuizClassStats): ArticleQuizClassStats {
  const store = ensureStore();
  store.classStats[stats.quizId] = stats;
  saveClassStats(store.classStats);
  return stats;
}

export function getQuizClassStats(quizId: string): ArticleQuizClassStats | null {
  return ensureStore().classStats[quizId] || null;
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

export function getRoster(
  quizId: string,
  students: Array<{ uid: string; studentName: string }>,
): ArticleQuizRoster {
  const { submissions, classStats } = ensureStore();
  const quizSubs = submissions.filter((s) => s.quizId === quizId);
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
    classStats: classStats[quizId] || null,
  };
}
