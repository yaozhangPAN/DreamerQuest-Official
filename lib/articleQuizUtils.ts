import { ArticleMcqQuestion, ArticleQuestion, isOpenEndedQuestion } from '../types';

export type RawGeneratedMcq = {
  type?: 'mcq' | 'open';
  prompt: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  suggestedAnswer?: string;
};

export function normalizeGeneratedQuestions(raw: RawGeneratedMcq[]): ArticleQuestion[] {
  const stamp = Date.now();
  return (raw || []).map((q, qi) => {
    const type = q.type === 'open' ? 'open' : 'mcq';
    if (type === 'open') {
      return {
        id: `q${qi}_${stamp}`,
        type: 'open' as const,
        prompt: String(q.prompt || ''),
        options: [],
        correctOptionId: '',
        suggestedAnswer: String(q.suggestedAnswer || q.explanation || ''),
        explanation: q.explanation || '',
      };
    }

    const options = (q.options || []).slice(0, 4).map((text, oi) => ({
      id: `q${qi}_o${oi}`,
      text: String(text),
    }));
    while (options.length < 4) {
      options.push({ id: `q${qi}_o${options.length}`, text: `Option ${options.length + 1}` });
    }
    const correctIndex = Math.min(3, Math.max(0, Math.round(q.correctIndex ?? 0) || 0));
    return {
      id: `q${qi}_${stamp}`,
      type: 'mcq' as const,
      prompt: String(q.prompt || ''),
      options,
      correctOptionId: options[correctIndex].id,
      explanation: q.explanation || '',
    };
  });
}

/** Ensure legacy quizzes without `type` still behave as MCQ. */
export function normalizeStoredQuestion(q: ArticleMcqQuestion): ArticleQuestion {
  if (isOpenEndedQuestion(q)) {
    return {
      ...q,
      type: 'open',
      options: q.options || [],
      correctOptionId: q.correctOptionId || '',
      suggestedAnswer: q.suggestedAnswer || q.explanation || '',
    };
  }
  return {
    ...q,
    type: 'mcq',
    options: q.options || [],
    correctOptionId: q.correctOptionId || '',
  };
}
