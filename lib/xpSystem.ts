import { RubricScore } from '../types';

/** XP per rubric point (0–20 per criterion → up to 100 XP each, 500 total). */
export const COMPOSITION_XP_PER_POINT = 5;
export const SPELLING_XP_PER_WORD = 5;
export const ORAL_XP_PER_MARK = 15;
export const COMPOSITION_FIRST_SUBMISSION_FLOOR = 250;

/** Article quiz XP */
export const ARTICLE_READ_XP = 10;
export const ARTICLE_MCQ_CORRECT_XP = 5;
export const ARTICLE_OPEN_CORRECT_XP = 15;

/** @deprecated Kept for older UI copy; completion XP is now per-correct-answer. */
export const ARTICLE_COMPLETE_XP = 25;
/** @deprecated Perfect bonus removed — XP scales with correct answers. */
export const ARTICLE_PERFECT_BONUS_XP = 0;

export function calculateArticleQuizCompletionXp(options: {
  questionResults: Array<{
    questionId: string;
    isCorrect: boolean;
    type?: 'mcq' | 'open';
  }>;
}): {
  completeXp: number;
  perfectBonusXp: number;
  mcqXp: number;
  openXp: number;
  correctMcqCount: number;
  correctOpenCount: number;
  totalXp: number;
} {
  let correctMcqCount = 0;
  let correctOpenCount = 0;

  for (const result of options.questionResults || []) {
    if (!result.isCorrect) continue;
    if (result.type === 'open') correctOpenCount += 1;
    else correctMcqCount += 1;
  }

  const mcqXp = correctMcqCount * ARTICLE_MCQ_CORRECT_XP;
  const openXp = correctOpenCount * ARTICLE_OPEN_CORRECT_XP;
  const completeXp = mcqXp + openXp;

  return {
    completeXp,
    perfectBonusXp: 0,
    mcqXp,
    openXp,
    correctMcqCount,
    correctOpenCount,
    totalXp: completeXp,
  };
}

export function calculateSpellingXp(correctWordCount: number): number {
  return Math.max(0, correctWordCount) * SPELLING_XP_PER_WORD;
}

export function calculateOralXp(totalMarks: number): number {
  return Math.max(0, totalMarks) * ORAL_XP_PER_MARK;
}

/**
 * Composition XP from five rubric criteria (0–20 each → 0–100 XP each, max 500).
 * Co-Pilot: 25% of calculated XP. First submission: floor to 250 if XP is 1–249.
 */
export function calculateCompositionXp(
  scores: RubricScore,
  options: { coPilot: boolean; isFirstSubmission: boolean; isDuplicate: boolean }
): { xp: number; welcomeBoostApplied: boolean } {
  if (options.isDuplicate) {
    return { xp: 0, welcomeBoostApplied: false };
  }

  let xp =
    scores.idea * COMPOSITION_XP_PER_POINT +
    scores.structure * COMPOSITION_XP_PER_POINT +
    scores.content * COMPOSITION_XP_PER_POINT +
    scores.language * COMPOSITION_XP_PER_POINT +
    scores.voice * COMPOSITION_XP_PER_POINT;

  if (options.coPilot) {
    xp = Math.floor(xp * 0.25);
  }

  let welcomeBoostApplied = false;
  if (
    options.isFirstSubmission &&
    xp >= 1 &&
    xp < COMPOSITION_FIRST_SUBMISSION_FLOOR
  ) {
    xp = COMPOSITION_FIRST_SUBMISSION_FLOOR;
    welcomeBoostApplied = true;
  }

  return { xp, welcomeBoostApplied };
}
