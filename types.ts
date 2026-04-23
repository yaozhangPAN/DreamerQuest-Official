
export interface RubricScore {
  idea: number;        // A. Relevance & central idea
  structure: number;   // B. Structure & paragraphing
  content: number;     // C. Content & details / evidence
  language: number;    // D. Language clarity & accuracy
  voice: number;       // E. Voice, style, and emotional impact
}

export interface EvaluationResult {
  scores: RubricScore;
  totalXp: number;
  feedback: string;
  isDuplicate: boolean;
  bonusApplied: boolean;
}

export interface SpellingSession {
  allWords: string[];
  listImages: string[];
  sessions: string[][];
  currentSessionIndex: number;
}

export interface UserProfile {
  name: string;
  school: string;
  level: string;
  parentEmail: string;
  password: string;
}

export interface UserStats {
  profile: UserProfile | null;
  totalXp: number;
  level: number;
  prizesWon: string[];
  submissionHistory: string[]; // Hashes of previous submissions
  lastScore: number;
  bonusCharges: number; // For the +10% next 2 essays bonus
  activeSpellingSession: SpellingSession | null;
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface OralEvaluation {
  summaryScores: {
    personalResponse: number;
    language: number;
    delivery: number;
  };
  videoResponseScores: {
    interaction: number;
    range: number;
    fluency: number;
  };
  feedback: string;
  totalMarks: number;
}

export enum AppView {
  SIGNUP = 'SIGNUP',
  DASHBOARD = 'DASHBOARD',
  SUBMIT = 'SUBMIT',
  CO_PILOT = 'CO_PILOT',
  RESULT = 'RESULT',
  SPELLING = 'SPELLING',
  ORAL_SELECTION = 'ORAL_SELECTION',
  ORAL_PRACTICE = 'ORAL_PRACTICE'
}
