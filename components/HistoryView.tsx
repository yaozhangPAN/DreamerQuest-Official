import React, { useState } from 'react';
import {
  HistoryItem,
  ArticleQuizSubmission,
  HistoryDetail,
} from '../types';
import {
  ChevronLeft,
  Calendar,
  Trophy,
  Send,
  Mic,
  PlayCircle,
  BookOpen,
  Zap,
  Eye,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { getMyArticleQuizSubmission } from '../lib/articleQuizApi';

interface HistoryViewProps {
  items: HistoryItem[];
  uid?: string;
  onBack: () => void;
  onReviewArticleQuiz?: (quizId: string) => void;
}

type ReviewState =
  | { mode: 'article'; title: string; submission: ArticleQuizSubmission }
  | { mode: 'local'; item: HistoryItem; detail: HistoryDetail };

const HistoryView: React.FC<HistoryViewProps> = ({
  items,
  uid,
  onBack,
  onReviewArticleQuiz,
}) => {
  const sortedItems = [...items].sort((a, b) => b.completedAt - a.completedAt);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [review, setReview] = useState<ReviewState | null>(null);

  const getTypeIcon = (type: HistoryItem['type']) => {
    switch (type) {
      case 'Composition': return <Send size={20} />;
      case 'Spelling': return <Mic size={20} />;
      case 'Oral': return <PlayCircle size={20} />;
      case 'Article': return <BookOpen size={20} />;
      default: return <BookOpen size={20} />;
    }
  };

  const getTypeColor = (type: HistoryItem['type']) => {
    switch (type) {
      case 'Composition': return 'bg-indigo-100 text-indigo-600';
      case 'Spelling': return 'bg-emerald-100 text-emerald-600';
      case 'Oral': return 'bg-amber-100 text-amber-600';
      case 'Article': return 'bg-rose-100 text-rose-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const openReview = async (item: HistoryItem) => {
    setReviewError('');
    setReview(null);

    if (item.detail) {
      setReview({ mode: 'local', item, detail: item.detail });
      return;
    }

    if (item.type === 'Article' && item.quizId && uid) {
      setReviewLoading(true);
      try {
        const data = await getMyArticleQuizSubmission(item.quizId, uid);
        setReview({
          mode: 'article',
          title: data.quiz.title,
          submission: data.submission,
        });
      } catch (e: any) {
        setReviewError(e.message || 'Failed to load review details');
      } finally {
        setReviewLoading(false);
      }
      return;
    }

    setReviewError(
      item.type === 'Article'
        ? 'This older record has no quiz link. Open Article Quizzes and tap a completed quiz to review.'
        : 'This older record has no saved details. New practice sessions will keep full review notes here.',
    );
  };

  const closeReview = () => {
    setReview(null);
    setReviewError('');
  };

  if (review?.mode === 'article') {
    const { submission, title } = review;
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <ReviewHeader title={title} onBack={closeReview} />
        <ScoreBanner
          score={`${submission.score}/${submission.maxScore}`}
          subtitle={`${Math.round(
            (submission.score / Math.max(1, submission.maxScore)) * 100,
          )}% correct`}
        />
        {submission.overallFeedback && (
          <FeedbackCard title="AI Feedback" text={submission.overallFeedback} />
        )}
        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800">Your answers vs suggested</h3>
          {(submission.questionResults || []).map((qr, i) => (
            <AnswerCompareCard
              key={qr.questionId}
              index={i + 1}
              isCorrect={qr.isCorrect}
              yours={qr.studentAnswerText}
              suggested={qr.suggestedAnswerText}
              explanation={qr.explanation}
            />
          ))}
        </div>
        {onReviewArticleQuiz && submission.quizId && (
          <button
            type="button"
            onClick={() => onReviewArticleQuiz(submission.quizId)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-4 font-black text-white"
          >
            Open in Article Quizzes <ArrowRight size={18} />
          </button>
        )}
      </div>
    );
  }

  if (review?.mode === 'local') {
    const { item, detail } = review;
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <ReviewHeader title={item.name} onBack={closeReview} />
        <div className="inline-flex items-center gap-2 rounded-full bg-amber-50 px-4 py-2 text-sm font-black text-amber-700 border border-amber-100">
          <Zap size={14} fill="currentColor" /> +{item.xpEarned} XP
        </div>

        {detail.kind === 'composition' && (
          <>
            <ScoreBanner
              score={`${
                detail.scores.idea +
                detail.scores.structure +
                detail.scores.content +
                detail.scores.language +
                detail.scores.voice
              }/100`}
              subtitle="Rubric total"
            />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              {(
                [
                  ['Idea', detail.scores.idea],
                  ['Structure', detail.scores.structure],
                  ['Content', detail.scores.content],
                  ['Language', detail.scores.language],
                  ['Voice', detail.scores.voice],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 text-center">
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                  <p className="text-xl font-black text-indigo-600">{value}/20</p>
                </div>
              ))}
            </div>
            {(detail.welcomeBoostApplied || detail.isDuplicate) && (
              <p className="text-sm font-bold text-slate-500">
                {detail.isDuplicate
                  ? 'Marked as a repeat submission.'
                  : 'Welcome boost was applied on this submission.'}
              </p>
            )}
            <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-3">
              <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                Teacher&apos;s Feedback
              </p>
              <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
                <ReactMarkdown>{detail.feedback}</ReactMarkdown>
              </div>
            </div>
          </>
        )}

        {detail.kind === 'spelling' && (
          <>
            <ScoreBanner
              score={`${detail.correctWords.length} correct`}
              subtitle={`${detail.incorrectWords.length} to revise`}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 space-y-3">
                <h3 className="font-black text-emerald-700">Correct</h3>
                {detail.correctWords.length === 0 && (
                  <p className="text-sm text-emerald-700/60 italic">None this round.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {detail.correctWords.map((w) => (
                    <span
                      key={w}
                      className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-emerald-700 border border-emerald-100"
                    >
                      {w}
                    </span>
                  ))}
                </div>
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-5 space-y-3">
                <h3 className="font-black text-amber-700">Revise these</h3>
                {detail.incorrectWords.length === 0 && (
                  <p className="text-sm text-amber-700/60 italic">Perfect score!</p>
                )}
                {detail.incorrectWords.map((w, i) => (
                  <div key={`${w.original}_${i}`} className="rounded-2xl bg-white px-4 py-3 text-sm">
                    <p className="font-black text-slate-800">{w.original}</p>
                    <p className="text-slate-500">
                      You wrote: <span className="font-bold text-amber-700">{w.student || '(blank)'}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <FeedbackCard title="AI Feedback" text={detail.feedback} />
          </>
        )}

        {detail.kind === 'oral_exam' && (
          <>
            <ScoreBanner
              score={`${detail.evaluation.totalMarks}/${detail.evaluation.maxMarks || 40}`}
              subtitle="Oral marks"
            />
            {detail.evaluation.categories?.map((cat, i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-white p-5 space-y-3">
                <h3 className="font-black text-slate-800">{cat.title}</h3>
                {cat.items.map((scoreItem, j) => (
                  <div key={j} className="flex items-center justify-between text-sm">
                    <span className="font-medium text-slate-600">{scoreItem.label}</span>
                    <span className="font-black text-indigo-600">
                      {scoreItem.score}/{scoreItem.max}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <FeedbackCard title="Examiner Feedback" text={detail.evaluation.feedback} />
            {detail.evaluation.modelAnswer && (
              <FeedbackCard title="Model Answer" text={detail.evaluation.modelAnswer} />
            )}
            {detail.evaluation.goodWords && detail.evaluation.goodWords.length > 0 && (
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-wider text-emerald-600">
                  Good words / phrases
                </p>
                <div className="flex flex-wrap gap-2">
                  {detail.evaluation.goodWords.map((word) => (
                    <span
                      key={word}
                      className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-emerald-800 border border-emerald-100"
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {detail.kind === 'oral_guided' && (
          <>
            <FeedbackCard title="Overall Feedback" text={detail.summary.overallFeedback} />
            <FeedbackCard title="Model Answer" text={detail.summary.modelAnswer} />
            {detail.summary.modelAnswersByQuestion?.map((ans, i) => (
              <div key={i} className="rounded-3xl border border-slate-200 bg-slate-50 p-5 space-y-2">
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Q{i + 1}
                  {detail.questions?.[i] ? `: ${detail.questions[i]}` : ''}
                </p>
                <p className="text-slate-700 whitespace-pre-wrap font-medium">{ans}</p>
              </div>
            ))}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50 p-5">
                <p className="mb-2 text-xs font-black uppercase text-emerald-700">Useful Phrases</p>
                <ul className="space-y-1 text-sm text-emerald-900">
                  {detail.summary.usefulPhrases.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50 p-5">
                <p className="mb-2 text-xs font-black uppercase text-amber-700">Useful Sentences</p>
                <ul className="space-y-1 text-sm text-amber-900">
                  {detail.summary.usefulSentences.map((s) => (
                    <li key={s}>• {s}</li>
                  ))}
                </ul>
              </div>
            </div>
            {detail.summary.sentencePatterns?.length > 0 && (
              <div className="rounded-3xl border border-violet-100 bg-violet-50 p-5">
                <p className="mb-2 text-xs font-black uppercase text-violet-700">Sentence Patterns</p>
                <ul className="space-y-1 text-sm text-violet-900">
                  {detail.summary.sentencePatterns.map((p) => (
                    <li key={p}>• {p}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-black text-slate-800">Learning History</h2>
            <p className="text-slate-500 font-medium">
              Tap any record to review scores, feedback, and revisions.
            </p>
          </div>
        </div>
        <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-xl shadow-indigo-100 flex items-center gap-3">
          <Trophy size={20} className="text-amber-400" />
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Submissions</p>
            <p className="text-2xl font-black leading-none">{items.length}</p>
          </div>
        </div>
      </div>

      {(reviewError || reviewLoading) && (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-600 flex items-center gap-2">
          {reviewLoading ? <Loader2 className="animate-spin" size={16} /> : null}
          {reviewLoading ? 'Loading review…' : reviewError}
        </div>
      )}

      {sortedItems.length === 0 ? (
        <div className="bg-white p-20 rounded-[3rem] border border-slate-200 border-dashed text-center space-y-4">
          <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto text-slate-200">
            <BookOpen size={48} />
          </div>
          <div className="space-y-2">
            <p className="text-slate-800 font-black text-xl">Your journey starts here!</p>
            <p className="text-slate-500 font-medium max-w-sm mx-auto">
              Complete a practice session to see your hard work recorded here.
            </p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Activity</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Completed</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">XP</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedItems.map((item) => {
                  const canReview = Boolean(item.detail || (item.type === 'Article' && item.quizId));
                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                      onClick={() => openReview(item)}
                    >
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${getTypeColor(item.type)} transition-transform group-hover:scale-110 shadow-sm`}>
                            {getTypeIcon(item.type)}
                          </div>
                          <div>
                            <span className="font-black text-slate-700 text-lg truncate max-w-[220px] block">
                              {item.name}
                            </span>
                            {typeof item.score === 'number' && (
                              <span className="text-xs font-bold text-slate-400">
                                {typeof item.maxScore === 'number'
                                  ? `Score ${item.score}/${item.maxScore}`
                                  : `Score ${item.score}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${getTypeColor(item.type)}`}>
                          {item.type}
                        </span>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 text-slate-700 font-bold">
                            <Calendar size={14} className="text-slate-300" />
                            {new Date(item.completedAt).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })}
                          </div>
                          <span className="text-[10px] text-slate-400 font-black uppercase mt-1 ml-6">
                            {new Date(item.completedAt).toLocaleTimeString(undefined, {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-black text-lg border border-emerald-100">
                          <Zap size={16} fill="currentColor" />
                          +{item.xpEarned}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-black ${
                            canReview
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'bg-slate-100 text-slate-400'
                          }`}
                        >
                          <Eye size={14} /> {canReview ? 'Details' : 'Limited'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

function ReviewHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onBack}
        className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 shadow-sm"
      >
        <ChevronLeft size={24} />
      </button>
      <div>
        <h2 className="text-2xl font-black text-slate-800">Review &amp; Revision</h2>
        <p className="text-slate-500 font-medium">{title}</p>
      </div>
    </div>
  );
}

function ScoreBanner({ score, subtitle }: { score: string; subtitle: string }) {
  return (
    <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 text-center space-y-2">
      <p className="text-5xl font-black text-indigo-600">{score}</p>
      <p className="text-slate-600 font-bold">{subtitle}</p>
    </div>
  );
}

function FeedbackCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6">
      <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">{title}</p>
      <p className="leading-relaxed text-slate-700 font-medium whitespace-pre-wrap">{text}</p>
    </div>
  );
}

function AnswerCompareCard({
  index,
  isCorrect,
  yours,
  suggested,
  explanation,
}: {
  index: number;
  isCorrect: boolean;
  yours: string;
  suggested: string;
  explanation: string;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 space-y-2 ${
        isCorrect ? 'border-emerald-100 bg-emerald-50/40' : 'border-amber-100 bg-amber-50/40'
      }`}
    >
      <div className="flex items-start gap-2">
        {isCorrect ? (
          <CheckCircle2 className="mt-0.5 shrink-0 text-emerald-600" size={18} />
        ) : (
          <XCircle className="mt-0.5 shrink-0 text-amber-600" size={18} />
        )}
        <div className="space-y-2 flex-1">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">
            Question {index} · {isCorrect ? 'Correct' : 'Revise this'}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-bold text-slate-800">Your answer: </span>
            {yours}
          </p>
          <p className="text-sm text-slate-600">
            <span className="font-bold text-indigo-700">Suggested answer: </span>
            {suggested}
          </p>
          <p className="text-sm italic text-slate-500">{explanation}</p>
        </div>
      </div>
    </div>
  );
}

export default HistoryView;
