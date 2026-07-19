import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  Lock,
  Play,
  Sparkles,
  Users,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { ArticleQuiz, ArticleQuizGroup, ArticleQuizSubmission, isOpenEndedQuestion } from '../types';
import {
  getArticleQuiz,
  getArticleQuizProgress,
  joinArticleGroup,
  leaveArticleGroup,
  listArticleQuizzes,
  startArticleQuizRead,
  submitArticleQuiz,
} from '../lib/articleQuizApi';
import {
  ARTICLE_MCQ_CORRECT_XP,
  ARTICLE_OPEN_CORRECT_XP,
  ARTICLE_READ_XP,
} from '../lib/xpSystem';

interface ArticleQuizStudentProps {
  uid: string;
  studentName: string;
  onBack: () => void;
  onXpEarned: (xp: number, label?: string) => void;
}

type Phase = 'list' | 'read' | 'answer' | 'marking' | 'results';

const ArticleQuizStudent: React.FC<ArticleQuizStudentProps> = ({
  uid,
  studentName,
  onBack,
  onXpEarned,
}) => {
  const [quizzes, setQuizzes] = useState<ArticleQuiz[]>([]);
  const [group, setGroup] = useState<ArticleQuizGroup | null>(null);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [activeQuiz, setActiveQuiz] = useState<ArticleQuiz | null>(null);
  const [phase, setPhase] = useState<Phase>('list');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ArticleQuizSubmission | null>(null);
  const [sessionXp, setSessionXp] = useState({
    read: 0,
    complete: 0,
    perfect: 0,
    mcq: 0,
    open: 0,
    correctMcqCount: 0,
    correctOpenCount: 0,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showJoinModal, setShowJoinModal] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [joining, setJoining] = useState(false);

  const refreshList = async () => {
    setLoading(true);
    setError('');
    try {
      const [listed, done] = await Promise.all([
        listArticleQuizzes(true, { uid }),
        getArticleQuizProgress(uid),
      ]);
      setQuizzes(listed.quizzes);
      setGroup(listed.group ?? null);
      setCompletedIds(new Set(done));
    } catch (e: any) {
      setError(e.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCompletedIds(new Set());
    setActiveQuiz(null);
    setResult(null);
    setAnswers({});
    setPhase('list');
    setSessionXp({
      read: 0,
      complete: 0,
      perfect: 0,
      mcq: 0,
      open: 0,
      correctMcqCount: 0,
      correctOpenCount: 0,
    });
    setError('');
    setGroup(null);
    refreshList();
  }, [uid]);

  const handleJoinGroup = async () => {
    if (!joinCode.trim()) {
      setError('Enter a group code');
      return;
    }
    setJoining(true);
    setError('');
    try {
      const joined = await joinArticleGroup(uid, joinCode.trim());
      setGroup(joined);
      setShowJoinModal(false);
      setJoinCode('');
      await refreshList();
    } catch (e: any) {
      setError(e.message || 'Failed to join group');
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGroup = async () => {
    setJoining(true);
    setError('');
    try {
      await leaveArticleGroup(uid);
      setGroup(null);
      setQuizzes([]);
      setShowJoinModal(false);
    } catch (e: any) {
      setError(e.message || 'Failed to leave group');
    } finally {
      setJoining(false);
    }
  };

  const openQuiz = async (id: string) => {
    setLoading(true);
    setError('');
    setResult(null);
    setAnswers({});
    setSessionXp({
      read: 0,
      complete: 0,
      perfect: 0,
      mcq: 0,
      open: 0,
      correctMcqCount: 0,
      correctOpenCount: 0,
    });
    try {
      const start = await startArticleQuizRead(id, uid);
      if (start.alreadyCompleted && start.submission) {
        setCompletedIds((prev) => new Set(prev).add(id));
        setResult(start.submission);
        const quiz = await getArticleQuiz(id, true, uid);
        setActiveQuiz(quiz);
        setPhase('results');
        setError('This account already completed this quiz. Only one attempt per account.');
        return;
      }

      const quiz = await getArticleQuiz(id, true, uid);
      setActiveQuiz(quiz);
      setPhase('read');

      if (start.readXp > 0) {
        setSessionXp((prev) => ({ ...prev, read: start.readXp }));
        onXpEarned(start.readXp, 'Article reading bonus');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to open quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!activeQuiz) return;
    const unanswered = activeQuiz.questions.filter((q) => {
      const raw = answers[q.id];
      if (isOpenEndedQuestion(q)) return !String(raw || '').trim();
      return !raw;
    });
    if (unanswered.length > 0) {
      setError(`Please answer all questions (${unanswered.length} left).`);
      return;
    }
    setPhase('marking');
    setError('');
    try {
      const { submission, xpAwarded } = await submitArticleQuiz(activeQuiz.id, {
        uid,
        studentName,
        answers,
      });
      setResult(submission);
      setCompletedIds((prev) => new Set(prev).add(activeQuiz.id));
      setSessionXp((prev) => ({
        ...prev,
        complete: xpAwarded.completeXp,
        perfect: xpAwarded.perfectBonusXp,
        mcq: xpAwarded.mcqXp,
        open: xpAwarded.openXp,
        correctMcqCount: xpAwarded.correctMcqCount,
        correctOpenCount: xpAwarded.correctOpenCount,
      }));
      if (xpAwarded.totalXp > 0) {
        onXpEarned(xpAwarded.totalXp, 'Article quiz complete');
      }
      setPhase('results');
    } catch (e: any) {
      setError(e.message || 'AI marking failed. Please try again.');
      setPhase('answer');
    }
  };

  const backToList = () => {
    setActiveQuiz(null);
    setResult(null);
    setAnswers({});
    setPhase('list');
    setSessionXp({
      read: 0,
      complete: 0,
      perfect: 0,
      mcq: 0,
      open: 0,
      correctMcqCount: 0,
      correctOpenCount: 0,
    });
    refreshList();
  };

  const totalSessionXp = sessionXp.read + sessionXp.complete + sessionXp.perfect;

  if (phase === 'marking') {
    return (
      <div className="mx-auto max-w-md space-y-6 py-20 text-center animate-in fade-in duration-300">
        <div className="relative mx-auto w-24 h-24">
          <div className="absolute inset-0 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
            <Sparkles size={28} className="animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-black text-slate-800">AI is marking your answers…</h2>
        <p className="text-slate-500 font-medium">
          Checking each question and preparing suggested answers.
        </p>
      </div>
    );
  }

  if (phase === 'results' && result) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-in zoom-in duration-500">
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={40} />
          </div>
          <h2 className="text-3xl font-black text-slate-800">AI Marking Complete</h2>
          <p className="text-6xl font-black text-indigo-600">
            {result.score}/{result.maxScore}
          </p>
          <p className="text-slate-500">
            {Math.round((result.score / Math.max(1, result.maxScore)) * 100)}% · Nice work, {studentName}!
          </p>
        </div>

        {totalSessionXp > 0 && (
          <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5 space-y-2">
            <p className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-amber-600">
              <Zap size={14} /> XP earned this attempt
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {sessionXp.read > 0 && (
                <div className="rounded-2xl bg-white px-3 py-2 font-bold text-slate-700">
                  Reading +{sessionXp.read}
                </div>
              )}
              {sessionXp.mcq > 0 && (
                <div className="rounded-2xl bg-white px-3 py-2 font-bold text-slate-700">
                  MCQ {sessionXp.correctMcqCount}×{ARTICLE_MCQ_CORRECT_XP} +{sessionXp.mcq}
                </div>
              )}
              {sessionXp.open > 0 && (
                <div className="rounded-2xl bg-white px-3 py-2 font-bold text-slate-700">
                  Open {sessionXp.correctOpenCount}×{ARTICLE_OPEN_CORRECT_XP} +{sessionXp.open}
                </div>
              )}
            </div>
            <p className="text-2xl font-black text-amber-700">+{totalSessionXp} XP total</p>
          </div>
        )}

        {result.overallFeedback && (
          <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 text-indigo-900">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-indigo-400">
              AI Feedback
            </p>
            <p className="leading-relaxed font-medium">{result.overallFeedback}</p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800">Suggested answers</h3>
          {(result.questionResults || []).map((qr, i) => (
            <div
              key={qr.questionId}
              className={`rounded-3xl border p-5 space-y-3 ${
                qr.isCorrect
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : 'border-amber-100 bg-amber-50/40'
              }`}
            >
              <div className="flex items-start gap-2">
                {qr.isCorrect ? (
                  <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
                ) : (
                  <XCircle className="mt-0.5 shrink-0 text-amber-600" size={18} />
                )}
                <div className="space-y-2 flex-1">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Question {i + 1} · {qr.isCorrect ? 'Correct' : 'Needs review'}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-slate-800">Your answer: </span>
                    {qr.studentAnswerText}
                  </p>
                  <p className="text-sm text-slate-600">
                    <span className="font-bold text-indigo-700">Suggested answer: </span>
                    {qr.suggestedAnswerText}
                  </p>
                  <p className="text-sm italic text-slate-500">{qr.explanation}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={backToList}
          className="w-full rounded-2xl bg-slate-800 py-4 font-black text-white"
        >
          Back to Quiz List
        </button>
      </div>
    );
  }

  if (phase === 'read' && activeQuiz) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-in fade-in duration-300">
        <button
          type="button"
          onClick={backToList}
          className="flex items-center gap-2 font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={18} /> All quizzes
        </button>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-amber-600">Step 1 of 2 · Reading</p>
          <h2 className="text-3xl font-black text-slate-800">{activeQuiz.title}</h2>
          <p className="text-slate-500">
            Read the article carefully. One attempt per account — then continue to the questions.
          </p>
          {sessionXp.read > 0 && (
            <p className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-black text-amber-700">
              <Zap size={12} /> +{ARTICLE_READ_XP} XP reading bonus
            </p>
          )}
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 md:p-8 shadow-sm space-y-5">
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider text-slate-400">
            <BookOpen size={14} /> Article
          </h3>

          {activeQuiz.sourceUrl ? (
            <div className="space-y-4">
              <a
                href={activeQuiz.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-4 text-base font-black text-white hover:bg-indigo-700"
              >
                Open article link
              </a>
              <p className="text-center text-xs text-slate-400">
                Read the article in the new tab, then come back here when finished.
              </p>
              <details className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-slate-400">
                  Or read extracted text here
                </summary>
                <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {activeQuiz.article}
                </div>
              </details>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-base leading-relaxed text-slate-700">
              {activeQuiz.article}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setPhase('answer')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 py-5 text-lg font-black text-white hover:bg-indigo-700"
        >
          I&apos;m done reading — Start questions
          <ArrowRight size={22} />
        </button>
      </div>
    );
  }

  if (phase === 'answer' && activeQuiz) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 animate-in slide-in-from-right duration-300">
        <button
          type="button"
          onClick={() => setPhase('read')}
          className="flex items-center gap-2 font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={18} /> Back to article
        </button>

        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-widest text-indigo-600">Step 2 of 2 · Answering</p>
          <h2 className="text-3xl font-black text-slate-800">{activeQuiz.title}</h2>
          <p className="text-slate-500">
            Each correct MCQ = +{ARTICLE_MCQ_CORRECT_XP} XP · each correct open-ended = +{ARTICLE_OPEN_CORRECT_XP} XP.
            One attempt per account.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {activeQuiz.questions.map((q, qi) => {
            const isOpen = isOpenEndedQuestion(q);
            return (
              <div key={q.id} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-black text-slate-800">
                    {qi + 1}. {q.prompt}
                  </p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                      isOpen ? 'bg-amber-100 text-amber-700' : 'bg-sky-100 text-sky-700'
                    }`}
                  >
                    {isOpen ? 'Open-ended' : 'MCQ'}
                  </span>
                </div>

                {isOpen ? (
                  <textarea
                    value={answers[q.id] || ''}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                    rows={4}
                    placeholder="Write your answer here…"
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                ) : (
                  <div className="space-y-2">
                    {(q.options || []).map((opt) => (
                      <label
                        key={opt.id}
                        className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition-all ${
                          answers[q.id] === opt.id
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                            : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <input
                          type="radio"
                          className="mt-1"
                          name={q.id}
                          checked={answers[q.id] === opt.id}
                          onChange={() =>
                            setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                          }
                        />
                        <span className="font-medium">{opt.text}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-5 text-lg font-black text-white hover:bg-emerald-700"
        >
          <Sparkles size={20} />
          Finish &amp; AI Mark
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={18} /> Dashboard
        </button>

        <button
          type="button"
          onClick={() => {
            setError('');
            setShowJoinModal(true);
          }}
          className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-amber-600"
        >
          <Users size={16} />
          {group ? 'Switch Group' : 'Join Group'}
        </button>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-800">Article Quizzes</h2>
        {group ? (
          <p className="text-sm font-bold text-indigo-600">
            Group: {group.name} · Code {group.code}
          </p>
        ) : (
          <p className="text-sm font-bold text-amber-600">
            Join a group with a code to see your quizzes.
          </p>
        )}
        <p className="text-slate-500">
          +{ARTICLE_READ_XP} XP to start reading · +{ARTICLE_MCQ_CORRECT_XP} XP per correct MCQ · +
          {ARTICLE_OPEN_CORRECT_XP} XP per correct open-ended. One attempt per account (switch accounts to try again).
        </p>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10 text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      )}

      {!loading && !group && (
        <div className="rounded-3xl border border-dashed border-amber-200 bg-amber-50/50 p-10 text-center space-y-4">
          <p className="text-slate-600 font-medium">
            Ask your teacher for a group code, then tap Join Group.
          </p>
          <button
            type="button"
            onClick={() => setShowJoinModal(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-5 py-3 text-sm font-black text-white hover:bg-amber-600"
          >
            <Users size={16} /> Join Group
          </button>
        </div>
      )}

      {!loading && group && quizzes.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 p-10 text-center text-slate-400">
          No published quizzes for this group yet.
        </div>
      )}

      <div className="space-y-3">
        {quizzes.map((q) => {
          const done = completedIds.has(q.id);
          return (
            <button
              key={q.id}
              type="button"
              disabled={done}
              onClick={() => openQuiz(q.id)}
              className={`flex w-full items-center justify-between rounded-3xl border p-5 text-left shadow-sm transition-all ${
                done
                  ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-70'
                  : 'border-slate-200 bg-white hover:border-indigo-300 hover:shadow-md'
              }`}
            >
              <div>
                <p className="font-black text-slate-800">{q.title}</p>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  {q.questions.length} questions · {done ? 'Completed on this account' : 'One attempt / account'}
                </p>
              </div>
              {done ? (
                <span className="inline-flex items-center gap-2 rounded-xl bg-slate-200 px-4 py-2 text-xs font-black text-slate-500">
                  <Lock size={14} /> Done
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-black text-white">
                  <Play size={14} /> Start
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showJoinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black text-slate-800">
                {group ? 'Switch Group' : 'Join Group'}
              </h3>
              <button
                type="button"
                onClick={() => setShowJoinModal(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-slate-500">
              Enter the code your teacher shared. You will only see quizzes for that group.
            </p>
            {group && (
              <p className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-600">
                Currently in <span className="text-indigo-600">{group.name}</span> ({group.code})
              </p>
            )}
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleJoinGroup();
              }}
              placeholder="Group code"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-center text-lg font-black tracking-[0.2em] text-slate-800 uppercase"
              autoFocus
            />
            <button
              type="button"
              disabled={joining}
              onClick={handleJoinGroup}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-500 py-3.5 font-black text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {joining ? <Loader2 className="animate-spin" size={18} /> : <Users size={18} />}
              Join
            </button>
            {group && (
              <button
                type="button"
                disabled={joining}
                onClick={handleLeaveGroup}
                className="w-full rounded-2xl border border-slate-200 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50"
              >
                Leave current group
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ArticleQuizStudent;
