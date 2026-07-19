import React, { useState } from 'react';
import { HistoryItem, ArticleQuizSubmission } from '../types';
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
import { getMyArticleQuizSubmission } from '../lib/articleQuizApi';

interface HistoryViewProps {
  items: HistoryItem[];
  uid?: string;
  onBack: () => void;
  onReviewArticleQuiz?: (quizId: string) => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({
  items,
  uid,
  onBack,
  onReviewArticleQuiz,
}) => {
  const sortedItems = [...items].sort((a, b) => b.completedAt - a.completedAt);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewSubmission, setReviewSubmission] = useState<ArticleQuizSubmission | null>(null);

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
    if (item.type !== 'Article' || !item.quizId || !uid) {
      setReviewError(
        item.type === 'Article'
          ? 'This older record has no quiz link. Open Article Quizzes and tap a completed quiz to review.'
          : 'Detailed review is available for Article Quizzes. Open that practice area to continue.',
      );
      setReviewSubmission(null);
      return;
    }

    setReviewLoading(true);
    setReviewError('');
    try {
      const data = await getMyArticleQuizSubmission(item.quizId, uid);
      setReviewTitle(data.quiz.title);
      setReviewSubmission(data.submission);
    } catch (e: any) {
      setReviewError(e.message || 'Failed to load review details');
      setReviewSubmission(null);
    } finally {
      setReviewLoading(false);
    }
  };

  if (reviewSubmission) {
    return (
      <div className="space-y-6 animate-in fade-in duration-300">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setReviewSubmission(null)}
            className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 shadow-sm"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-2xl font-black text-slate-800">Review &amp; Revision</h2>
            <p className="text-slate-500 font-medium">{reviewTitle}</p>
          </div>
        </div>

        <div className="rounded-3xl border border-indigo-100 bg-indigo-50 p-6 text-center space-y-2">
          <p className="text-5xl font-black text-indigo-600">
            {reviewSubmission.score}/{reviewSubmission.maxScore}
          </p>
          <p className="text-slate-600 font-bold">
            {Math.round(
              (reviewSubmission.score / Math.max(1, reviewSubmission.maxScore)) * 100,
            )}
            % correct
          </p>
        </div>

        {reviewSubmission.overallFeedback && (
          <div className="rounded-3xl border border-slate-200 bg-white p-6">
            <p className="mb-2 text-xs font-black uppercase tracking-wider text-slate-400">
              AI Feedback
            </p>
            <p className="leading-relaxed text-slate-700 font-medium">
              {reviewSubmission.overallFeedback}
            </p>
          </div>
        )}

        <div className="space-y-4">
          <h3 className="text-lg font-black text-slate-800">Your answers vs suggested</h3>
          {(reviewSubmission.questionResults || []).map((qr, i) => (
            <div
              key={qr.questionId}
              className={`rounded-3xl border p-5 space-y-2 ${
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
                    Question {i + 1} · {qr.isCorrect ? 'Correct' : 'Revise this'}
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

        {onReviewArticleQuiz && reviewSubmission.quizId && (
          <button
            type="button"
            onClick={() => onReviewArticleQuiz(reviewSubmission.quizId)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 py-4 font-black text-white"
          >
            Open in Article Quizzes <ArrowRight size={18} />
          </button>
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
              Tap a record to review details and revise.
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
                {sortedItems.map((item) => (
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
                          {typeof item.score === 'number' && typeof item.maxScore === 'number' && (
                            <span className="text-xs font-bold text-slate-400">
                              Score {item.score}/{item.maxScore}
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
                      <span className="inline-flex items-center gap-1 rounded-xl bg-indigo-50 px-3 py-2 text-xs font-black text-indigo-600">
                        <Eye size={14} /> Details
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
