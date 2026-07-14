import { ArticleMcqQuestion } from '../types';

export function normalizeGeneratedQuestions(
  raw: Array<{
    prompt: string;
    options: string[];
    correctIndex: number;
    explanation?: string;
  }>,
): ArticleMcqQuestion[] {
  return raw.map((q, qi) => {
    const options = (q.options || []).slice(0, 4).map((text, oi) => ({
      id: `q${qi}_o${oi}`,
      text: String(text),
    }));
    while (options.length < 4) {
      options.push({ id: `q${qi}_o${options.length}`, text: `Option ${options.length + 1}` });
    }
    const correctIndex = Math.min(3, Math.max(0, Math.round(q.correctIndex) || 0));
    return {
      id: `q${qi}_${Date.now()}`,
      prompt: q.prompt,
      options,
      correctOptionId: options[correctIndex].id,
      explanation: q.explanation || '',
    };
  });
}
