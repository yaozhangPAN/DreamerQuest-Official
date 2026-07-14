import { RubricScore } from '../types';

/** XP per rubric point (0–20 per criterion → up to 100 XP each, 500 total). */
export const COMPOSITION_XP_PER_POINT = 5;
export const SPELLING_XP_PER_WORD = 5;
export const ORAL_XP_PER_MARK = 15;
export const COMPOSITION_FIRST_SUBMISSION_FLOOR = 250;

/** Article quiz XP */
export const ARTICLE_READ_XP = 10;
export const ARTICLE_COMPLETE_XP = 25;
export const ARTICLE_PERFECT_BONUS_XP = 10;

export function calculateArticleQuizCompletionXp(options: {
  allCorrect: boolean;
}): { completeXp: number; perfectBonusXp: number; totalXp: number } {
  const completeXp = ARTICLE_COMPLETE_XP;
  const perfectBonusXp = options.allCorrect ? ARTICLE_PERFECT_BONUS_XP : 0;
  return {
    completeXp,
    perfectBonusXp,
    totalXp: completeXp + perfectBonusXp,
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
