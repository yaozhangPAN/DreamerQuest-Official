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
}): Promise<{ title: string; questions: ArticleMcqQuestion[] }> {
  const raw = await api<{
    title: string;
    questions: Array<{
      prompt: string;
      options: string[];
      correctIndex: number;
      explanation: string;
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
): Promise<{ quizzes: ArticleQuiz[]; group?: ArticleQuizGroup | null }> {
  const params = new URLSearchParams();
  if (publishedOnly) params.set('published', '1');
  if (options?.uid) params.set('uid', options.uid);
  const q = params.toString() ? `?${params}` : '';
  const data = await api<{ quizzes: ArticleQuiz[]; group?: ArticleQuizGroup | null }>(
    `/api/article-quizzes${q}`,
  );
  return { quizzes: data.quizzes, group: data.group ?? null };
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
  xpAwarded: { completeXp: number; perfectBonusXp: number; totalXp: number };
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
): Promise<ArticleQuizGroup | null> {
  const data = await api<{ group: ArticleQuizGroup | null }>(
    `/api/article-groups/membership/${encodeURIComponent(uid)}`,
  );
  return data.group;
}

export async function joinArticleGroup(
  uid: string,
  code: string,
): Promise<ArticleQuizGroup> {
  const data = await api<{ group: ArticleQuizGroup }>('/api/article-groups/join', {
    method: 'POST',
    body: JSON.stringify({ uid, code }),
  });
  return data.group;
}

export async function leaveArticleGroup(uid: string): Promise<void> {
  await api('/api/article-groups/leave', {
    method: 'POST',
    body: JSON.stringify({ uid }),
  });
}
