import { RubricScore } from '../types';

export function isValidRubricScore(scores: unknown): scores is RubricScore {
  if (!scores || typeof scores !== 'object') return false;
  const s = scores as Record<string, unknown>;
  return (
    typeof s.idea === 'number' &&
    typeof s.structure === 'number' &&
    typeof s.content === 'number' &&
    typeof s.language === 'number' &&
    typeof s.voice === 'number'
  );
}

export function isValidEssayEvaluation(
  evaluation: unknown
): evaluation is { scores: RubricScore; feedback: string } {
  if (!evaluation || typeof evaluation !== 'object') return false;
  const e = evaluation as Record<string, unknown>;
  return isValidRubricScore(e.scores) && typeof e.feedback === 'string';
}
