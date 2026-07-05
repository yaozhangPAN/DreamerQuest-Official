
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

export interface Session {
  words: string[];
}

export interface SpellingSession {
  id: string;
  name: string;
  createdAt: number;
  allWords: string[];
  listImages: string[];
  sessions: Session[];
  currentSessionIndex: number;
  isCompleted: boolean;
}

export interface HistoryItem {
  id: string;
  name: string;
  type: 'Spelling' | 'Composition' | 'Oral';
  completedAt: number;
  xpEarned: number;
}

export interface UserProfile {
  name: string;
  school: string;
  level: string;
  parentEmail: string;
}

export interface UserStats {
  profile: UserProfile | null;
  totalXp: number;
  level: number;
  prizesWon: string[];
  submissionHistory: string[]; // Hashes of previous submissions
  submissions: HistoryItem[];
  lastScore: number;
  bonusCharges: number; // For the +10% next 2 essays bonus
  activeSpellingSessions: SpellingSession[];
  // Monetization fields
  isSubscribed: boolean;
  githubConnection?: {
    username: string;
    avatarUrl: string;
    accessToken?: string;
    connectedAt: number;
  };
}

export interface ChatMessage {
  role: 'user' | 'ai';
  text: string;
}

export interface ScoreItem {
  label: string;
  score: number;
  max: number;
}

export interface ScoreCategory {
  title: string;
  items: ScoreItem[];
}

export interface OralEvaluation {
  categories: ScoreCategory[];
  feedback: string;
  totalMarks: number;
  maxMarks: number;
  modelAnswer?: string;
  goodWords?: string[];
}

export enum AppView {
  SIGNUP = 'SIGNUP',
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  SUBMIT = 'SUBMIT',
  CO_PILOT = 'CO_PILOT',
  RESULT = 'RESULT',
  SPELLING = 'SPELLING',
  ORAL_SELECTION = 'ORAL_SELECTION',
  ORAL_PRACTICE = 'ORAL_PRACTICE',
  HISTORY = 'HISTORY',
  SESSION_SELECT = 'SESSION_SELECT'
}
