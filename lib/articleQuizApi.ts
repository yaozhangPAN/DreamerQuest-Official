import {
  ArticleMcqQuestion,
  ArticleQuiz,
  ArticleQuizGroup,
  ArticleQuizRoster,
  ArticleQuizSubmission,
} from '../types';
import { normalizeGeneratedQuestions } from './articleQuizUtils';

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error((data as { error?: string }).error || `HTTP ${response.status}`);
  }
  return data as T;
}

export async function generateArticleMcqs(input: {
  article: string;
  title?: string;
  questionCount?: number;
  mcqCount?: number;
  openCount?: number;
}): Promise<{ title: string; questions: ArticleMcqQuestion[] }> {
  const raw = await api<{
    title: string;
    questions: Array<{
      type?: 'mcq' | 'open';
      prompt: string;
      options?: string[];
      correctIndex?: number;
      explanation: string;
      suggestedAnswer?: string;
    }>;
  }>('/api/gemini/generate-article-mcqs', {
    method: 'POST',
    body: JSON.stringify(input),
  });

  return {
    title: raw.title || input.title || 'Article Quiz',
    questions: normalizeGeneratedQuestions(raw.questions || []),
  };
}

export async function listArticleQuizzes(
  publishedOnly = false,
  options?: { uid?: string },
): Promise<{
  quizzes: ArticleQuiz[];
  group?: ArticleQuizGroup | null;
  pendingGroup?: ArticleQuizGroup | null;
}> {
  const params = new URLSearchParams();
  if (publishedOnly) params.set('published', '1');
  if (options?.uid) params.set('uid', options.uid);
  const q = params.toString() ? `?${params}` : '';
  const data = await api<{
    quizzes: ArticleQuiz[];
    group?: ArticleQuizGroup | null;
    pendingGroup?: ArticleQuizGroup | null;
  }>(`/api/article-quizzes${q}`);
  return {
    quizzes: data.quizzes,
    group: data.group ?? null,
    pendingGroup: data.pendingGroup ?? null,
  };
}

export async function getArticleQuiz(
  id: string,
  asStudent = false,
  uid?: string,
): Promise<ArticleQuiz> {
  const params = new URLSearchParams();
  if (asStudent) params.set('student', '1');
  if (uid) params.set('uid', uid);
  const q = params.toString() ? `?${params}` : '';
  const data = await api<{ quiz: ArticleQuiz }>(`/api/article-quizzes/${id}${q}`);
  return data.quiz;
}

export async function fetchArticleFromUrlApi(url: string): Promise<{
  url: string;
  title: string;
  article: string;
}> {
  return api('/api/article-quizzes/fetch-url', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function extractArticleFromFileApi(input: {
  filename: string;
  mimeType?: string;
  dataBase64: string;
}): Promise<{ title: string; article: string }> {
  return api('/api/article-quizzes/extract-file', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createArticleQuiz(input: {
  title: string;
  article: string;
  questions: ArticleMcqQuestion[];
  published?: boolean;
  sourceUrl?: string;
  groupId?: string;
}): Promise<ArticleQuiz> {
  const data = await api<{ quiz: ArticleQuiz }>('/api/article-quizzes', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.quiz;
}

export async function updateArticleQuiz(
  id: string,
  input: Partial<{
    title: string;
    article: string;
    questions: ArticleMcqQuestion[];
    published: boolean;
    sourceUrl: string;
    groupId: string | null;
  }>,
): Promise<ArticleQuiz> {
  const data = await api<{ quiz: ArticleQuiz }>(`/api/article-quizzes/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  });
  return data.quiz;
}

export async function deleteArticleQuiz(id: string): Promise<void> {
  await api(`/api/article-quizzes/${id}`, { method: 'DELETE' });
}

export async function submitArticleQuiz(
  id: string,
  input: { uid: string; studentName: string; answers: Record<string, string> },
): Promise<{
  submission: ArticleQuizSubmission;
  xpAwarded: {
    completeXp: number;
    perfectBonusXp: number;
    mcqXp: number;
    openXp: number;
    correctMcqCount: number;
    correctOpenCount: number;
    totalXp: number;
  };
}> {
  return api(`/api/article-quizzes/${id}/submit`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function startArticleQuizRead(
  id: string,
  uid: string,
): Promise<{
  alreadyCompleted: boolean;
  alreadyRead?: boolean;
  readXp: number;
  submission?: ArticleQuizSubmission;
}> {
  return api(`/api/article-quizzes/${id}/start-read`, {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}

export async function getArticleQuizProgress(uid: string): Promise<string[]> {
  const data = await api<{ completedQuizIds: string[] }>(
    `/api/article-quizzes/progress/${encodeURIComponent(uid)}`,
  );
  return data.completedQuizIds;
}

export async function getArticleQuizRoster(id: string): Promise<ArticleQuizRoster> {
  const data = await api<{ roster: ArticleQuizRoster }>(`/api/article-quizzes/${id}/roster`);
  return data.roster;
}

export async function refreshArticleQuizStats(id: string) {
  return api<{ classStats: import('../types').ArticleQuizClassStats }>(
    `/api/article-quizzes/${id}/refresh-stats`,
    { method: 'POST', body: '{}' },
  );
}

export async function listArticleGroups(): Promise<ArticleQuizGroup[]> {
  const data = await api<{ groups: ArticleQuizGroup[] }>('/api/article-groups');
  return data.groups;
}

export async function createArticleGroup(input: {
  name: string;
  code?: string;
}): Promise<ArticleQuizGroup> {
  const data = await api<{ group: ArticleQuizGroup }>('/api/article-groups', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.group;
}

export async function deleteArticleGroup(id: string): Promise<void> {
  await api(`/api/article-groups/${id}`, { method: 'DELETE' });
}

export async function getArticleGroupMembership(
  uid: string,
): Promise<{ group: ArticleQuizGroup | null; pendingGroup: ArticleQuizGroup | null }> {
  const data = await api<{
    group: ArticleQuizGroup | null;
    pendingGroup?: ArticleQuizGroup | null;
  }>(`/api/article-groups/membership/${encodeURIComponent(uid)}`);
  return { group: data.group, pendingGroup: data.pendingGroup ?? null };
}

export async function joinArticleGroup(
  uid: string,
  code: string,
  studentName?: string,
): Promise<{
  group: ArticleQuizGroup;
  status: 'pending' | 'approved';
  alreadyMember: boolean;
  pending: boolean;
}> {
  return api('/api/article-groups/join', {
    method: 'POST',
    body: JSON.stringify({ uid, code, studentName }),
  });
}

export async function leaveArticleGroup(uid: string): Promise<void> {
  await api('/api/article-groups/leave', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}

export async function listPendingGroupJoins(): Promise<
  Array<{
    uid: string;
    groupId: string;
    studentName?: string;
    requestedAt?: number;
    joinedAt: number;
    groupName: string;
    groupCode: string;
  }>
> {
  const data = await api<{ pending: Array<any> }>('/api/article-groups/pending');
  return data.pending || [];
}

export async function approveGroupJoin(uid: string): Promise<ArticleQuizGroup> {
  const data = await api<{ group: ArticleQuizGroup }>('/api/article-groups/approve', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
  return data.group;
}

export async function rejectGroupJoin(uid: string): Promise<void> {
  await api('/api/article-groups/reject', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}

export async function listAdminNotifications(): Promise<{
  notifications: import('../types').AdminNotification[];
  unreadCount: number;
}> {
  return api('/api/admin/notifications');
}

export async function markAdminNotificationsRead(ids?: string[]): Promise<void> {
  await api('/api/admin/notifications/read', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export async function getMyArticleQuizSubmission(
  quizId: string,
  uid: string,
): Promise<{
  quiz: Pick<ArticleQuiz, 'id' | 'title' | 'article' | 'sourceUrl'> & {
    questions: Array<{
      id: string;
      type?: 'mcq' | 'open';
      prompt: string;
      options: ArticleMcqQuestion['options'];
    }>;
  };
  submission: ArticleQuizSubmission;
}> {
  return api(
    `/api/article-quizzes/${encodeURIComponent(quizId)}/my-submission?uid=${encodeURIComponent(uid)}`,
  );
}
