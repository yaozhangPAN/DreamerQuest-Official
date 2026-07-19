
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
  /** @deprecated Old +10% streak bonus; kept for compatibility. Prefer welcomeBoostApplied. */
  bonusApplied: boolean;
  /** First composition submission floored to 250 XP. */
  welcomeBoostApplied?: boolean;
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
  type: 'Spelling' | 'Composition' | 'Oral' | 'Article';
  completedAt: number;
  xpEarned: number;
  /** Article quiz id — enables review from Learning History. */
  quizId?: string;
  score?: number;
  maxScore?: number;
  /** Snapshot of evaluation details for review (Composition / Spelling / Oral). */
  detail?: HistoryDetail;
}

export type HistoryDetail =
  | {
      kind: 'composition';
      scores: RubricScore;
      feedback: string;
      topic?: string;
      welcomeBoostApplied?: boolean;
      isDuplicate?: boolean;
    }
  | {
      kind: 'spelling';
      correctWords: string[];
      incorrectWords: Array<{ original: string; student: string }>;
      feedback: string;
    }
  | {
      kind: 'oral_exam';
      evaluation: OralEvaluation;
      practiceId?: number;
    }
  | {
      kind: 'oral_guided';
      summary: OralPracticeSummary;
      practiceId?: number;
      questions?: string[];
    };

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

export type OralSessionMode = 'MOCK_EXAM' | 'GUIDED_PRACTICE';

export interface OralNotesEvaluation {
  score: number;
  isOrganized: boolean;
  isComplete: boolean;
  strengths: string[];
  improvements: string[];
  feedback: string;
}

export interface OralAnswerGuide {
  mindMapOutline: string;
  usefulPhrases: string[];
  usefulSentences: string[];
  tips: string;
}

export interface OralPracticeAnswerFeedback {
  passed: boolean;
  score: number;
  feedback: string;
  improvements: string[];
  suggestedRevision?: string;
}

export interface OralPracticeSummary {
  modelAnswer: string;
  modelAnswersByQuestion: string[];
  usefulPhrases: string[];
  usefulSentences: string[];
  sentencePatterns: string[];
  overallFeedback: string;
}

export interface ArticleMcqOption {
  id: string;
  text: string;
}

export type ArticleQuestionType = 'mcq' | 'open';

export interface ArticleMcqQuestion {
  id: string;
  /** Defaults to 'mcq' for legacy quizzes that omit this field. */
  type?: ArticleQuestionType;
  prompt: string;
  options: ArticleMcqOption[];
  correctOptionId: string;
  explanation?: string;
  /** Model / suggested answer for open-ended questions. */
  suggestedAnswer?: string;
}

/** Alias used when a quiz may mix MCQ and open-ended items. */
export type ArticleQuestion = ArticleMcqQuestion;

export function isOpenEndedQuestion(q: ArticleQuestion): boolean {
  return q.type === 'open';
}

export function isMcqQuestion(q: ArticleQuestion): boolean {
  return q.type !== 'open';
}

/** Class/cohort that shares one join code; students only see that group's quizzes. */
export interface ArticleQuizGroup {
  id: string;
  name: string;
  /** Short join code students enter (case-insensitive). */
  code: string;
  createdAt: number;
}

export type GroupMembershipStatus = 'pending' | 'approved';

export interface ArticleQuizGroupMembership {
  uid: string;
  groupId: string;
  joinedAt: number;
  /** Legacy records without status are treated as approved. */
  status?: GroupMembershipStatus;
  studentName?: string;
  requestedAt?: number;
  reviewedAt?: number;
}

/** In-app alert for admins (e.g. join requests). */
export interface AdminNotification {
  id: string;
  type: 'group_join_request';
  groupId: string;
  groupName: string;
  uid: string;
  studentName: string;
  createdAt: number;
  read: boolean;
}

export interface ArticleQuiz {
  id: string;
  title: string;
  article: string;
  /** Original article URL when admin submitted a link instead of pasted text. */
  sourceUrl?: string;
  /** Group this quiz belongs to. Students only see quizzes for their joined group. */
  groupId?: string;
  questions: ArticleQuestion[];
  published: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface ArticleQuizSubmission {
  id: string;
  quizId: string;
  uid: string;
  studentName: string;
  /** questionId -> optionId (MCQ) or free-text answer (open-ended) */
  answers: Record<string, string>;
  score: number;
  maxScore: number;
  submittedAt: number;
  /** AI marking details */
  overallFeedback?: string;
  questionResults?: ArticleQuizQuestionResult[];
}

export interface ArticleQuizQuestionResult {
  questionId: string;
  isCorrect: boolean;
  studentAnswerText: string;
  suggestedAnswerText: string;
  explanation: string;
}

export interface ArticleQuizClassStats {
  quizId: string;
  totalStudents: number;
  submittedCount: number;
  unsubmittedCount: number;
  averageScore: number;
  averagePercent: number;
  highestScore: number;
  lowestScore: number;
  questionAccuracy: Array<{
    questionId: string;
    prompt: string;
    correctRate: number;
    commonWrongAnswer?: string;
    /** How many students gave that common wrong answer. */
    commonWrongCount?: number;
  }>;
  aiSummary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  updatedAt: number;
}

export interface ArticleQuizRoster {
  quizId: string;
  submitted: Array<{
    uid: string;
    studentName: string;
    score: number;
    maxScore: number;
    submittedAt: number;
    overallFeedback?: string;
  }>;
  unsubmitted: Array<{
    uid: string;
    studentName: string;
  }>;
  classStats?: ArticleQuizClassStats | null;
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
  SESSION_SELECT = 'SESSION_SELECT',
  ARTICLE_QUIZ_ADMIN = 'ARTICLE_QUIZ_ADMIN',
  ARTICLE_QUIZ_STUDENT = 'ARTICLE_QUIZ_STUDENT',
}
