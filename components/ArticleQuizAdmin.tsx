import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Pencil,
  Trash2,
  Link2,
  ExternalLink,
  Users,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import { ArticleMcqQuestion, ArticleQuiz, ArticleQuizGroup, ArticleQuizRoster } from '../types';
import {
  createArticleGroup,
  createArticleQuiz,
  deleteArticleGroup,
  deleteArticleQuiz,
  fetchArticleFromUrlApi,
  generateArticleMcqs,
  getArticleQuizRoster,
  listArticleGroups,
  listArticleQuizzes,
  refreshArticleQuizStats,
  updateArticleQuiz,
} from '../lib/articleQuizApi';

interface ArticleQuizAdminProps {
  onBack: () => void;
  onOpenStudentView?: () => void;
}

type Tab = 'create' | 'edit' | 'roster' | 'groups';

const ArticleQuizAdmin: React.FC<ArticleQuizAdminProps> = ({ onBack, onOpenStudentView }) => {
  const [tab, setTab] = useState<Tab>('create');
  const [quizzes, setQuizzes] = useState<ArticleQuiz[]>([]);
  const [groups, setGroups] = useState<ArticleQuizGroup[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [title, setTitle] = useState('');
  const [articleUrl, setArticleUrl] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [article, setArticle] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [draftQuestions, setDraftQuestions] = useState<ArticleMcqQuestion[]>([]);
  const [draftGroupId, setDraftGroupId] = useState('');
  const [generating, setGenerating] = useState(false);
  const [fetchingUrl, setFetchingUrl] = useState(false);

  // Groups
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCode, setNewGroupCode] = useState('');

  // Roster
  const [roster, setRoster] = useState<ArticleQuizRoster | null>(null);
  const [refreshingStats, setRefreshingStats] = useState(false);

  const selected = quizzes.find((q) => q.id === selectedId) || null;

  const groupName = (groupId?: string) =>
    groups.find((g) => g.id === groupId)?.name || (groupId ? 'Unknown group' : 'No group');

  const loadRoster = async (quizId: string) => {
    const data = await getArticleQuizRoster(quizId);
    setRoster(data);
  };

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [listed, groupList] = await Promise.all([
        listArticleQuizzes(false),
        listArticleGroups(),
      ]);
      setQuizzes(listed.quizzes);
      setGroups(groupList);
      if (!draftGroupId && groupList[0]) setDraftGroupId(groupList[0].id);
      if (selectedId && !listed.quizzes.find((q) => q.id === selectedId)) {
        setSelectedId(listed.quizzes[0]?.id || null);
      } else if (!selectedId && listed.quizzes[0]) {
        setSelectedId(listed.quizzes[0].id);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to load quizzes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (tab === 'roster' && selectedId) {
      loadRoster(selectedId).catch((e) => setError(e.message || 'Failed to load roster'));
    }
  }, [tab, selectedId]);

  const handleSubmitArticleUrl = async () => {
    const url = articleUrl.trim();
    if (!url) {
      setError('Enter an article URL first.');
      return;
    }
    setFetchingUrl(true);
    setError('');
    try {
      const result = await fetchArticleFromUrlApi(url);
      setSourceUrl(result.url);
      setArticle(result.article);
      if (!title.trim() && result.title) setTitle(result.title);
      // Open the original link for admin to review
      window.open(result.url, '_blank', 'noopener,noreferrer');
    } catch (e: any) {
      setError(e.message || 'Failed to open article link');
    } finally {
      setFetchingUrl(false);
    }
  };

  const handleGenerate = async () => {
    if (!article.trim()) {
      setError('Submit an article URL first so the page content can be loaded.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const result = await generateArticleMcqs({
        article,
        title: title || undefined,
        questionCount,
      });
      setDraftQuestions(result.questions);
      if (!title.trim() && result.title) setTitle(result.title);
      setTab('create');
    } catch (e: any) {
      setError(e.message || 'AI MCQ generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveNew = async (publish: boolean) => {
    if (!article.trim() || draftQuestions.length === 0) {
      setError('Need a submitted article URL and generated questions before saving.');
      return;
    }
    if (!draftGroupId) {
      setError('Assign this quiz to a group first (create one in the Groups tab).');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const quiz = await createArticleQuiz({
        title: title || 'Article Quiz',
        article,
        sourceUrl: sourceUrl || undefined,
        questions: draftQuestions,
        published: publish,
        groupId: draftGroupId,
      });
      setTitle('');
      setArticleUrl('');
      setSourceUrl('');
      setArticle('');
      setDraftQuestions([]);
      await refresh();
      setSelectedId(quiz.id);
      setTab('edit');
    } catch (e: any) {
      setError(e.message || 'Failed to save quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveEdits = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      await updateArticleQuiz(selected.id, {
        title: selected.title,
        article: selected.article,
        sourceUrl: selected.sourceUrl,
        questions: selected.questions,
        published: selected.published,
        groupId: selected.groupId || null,
      });
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Failed to update quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      setError('Enter a group name');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const group = await createArticleGroup({
        name: newGroupName.trim(),
        code: newGroupCode.trim() || undefined,
      });
      setNewGroupName('');
      setNewGroupCode('');
      await refresh();
      setDraftGroupId(group.id);
    } catch (e: any) {
      setError(e.message || 'Failed to create group');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (id: string) => {
    if (!confirm('Delete this group? Quizzes will be unassigned from it.')) return;
    setLoading(true);
    setError('');
    try {
      await deleteArticleGroup(id);
      await refresh();
    } catch (e: any) {
      setError(e.message || 'Failed to delete group');
    } finally {
      setLoading(false);
    }
  };

  const patchSelected = (patch: Partial<ArticleQuiz>) => {
    if (!selectedId) return;
    setQuizzes((prev) =>
      prev.map((q) => (q.id === selectedId ? { ...q, ...patch } : q)),
    );
  };

  const updateQuestion = (
    source: 'draft' | 'selected',
    qIndex: number,
    patch: Partial<ArticleMcqQuestion>,
  ) => {
    if (source === 'draft') {
      setDraftQuestions((prev) =>
        prev.map((q, i) => (i === qIndex ? { ...q, ...patch } : q)),
      );
      return;
    }
    if (!selected) return;
    const questions = selected.questions.map((q, i) =>
      i === qIndex ? { ...q, ...patch } : q,
    );
    patchSelected({ questions });
  };

  const updateOptionText = (
    source: 'draft' | 'selected',
    qIndex: number,
    oIndex: number,
    text: string,
  ) => {
    const list = source === 'draft' ? draftQuestions : selected?.questions || [];
    const q = list[qIndex];
    if (!q) return;
    const options = q.options.map((o, i) => (i === oIndex ? { ...o, text } : o));
    updateQuestion(source, qIndex, { options });
  };

  const renderQuestionEditor = (
    questions: ArticleMcqQuestion[],
    source: 'draft' | 'selected',
  ) => (
    <div className="space-y-4">
      {questions.map((q, qi) => (
        <div key={q.id} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <label className="flex-1 space-y-1">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Question {qi + 1}
              </span>
              <textarea
                value={q.prompt}
                onChange={(e) => updateQuestion(source, qi, { prompt: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800"
                rows={2}
              />
            </label>
            <button
              type="button"
              onClick={() => {
                if (source === 'draft') {
                  setDraftQuestions((prev) => prev.filter((_, i) => i !== qi));
                } else if (selected) {
                  patchSelected({
                    questions: selected.questions.filter((_, i) => i !== qi),
                  });
                }
              }}
              className="rounded-xl p-2 text-rose-500 hover:bg-rose-50"
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="space-y-2">
            {q.options.map((opt, oi) => (
              <div key={opt.id} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`correct-${source}-${q.id}`}
                  checked={q.correctOptionId === opt.id}
                  onChange={() => updateQuestion(source, qi, { correctOptionId: opt.id })}
                />
                <input
                  value={opt.text}
                  onChange={(e) => updateOptionText(source, qi, oi, e.target.value)}
                  className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <input
            value={q.explanation || ''}
            onChange={(e) => updateQuestion(source, qi, { explanation: e.target.value })}
            placeholder="Explanation (optional)"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600"
          />
        </div>
      ))}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-in fade-in duration-300">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-2 font-bold text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={18} /> Dashboard
        </button>
        <div className="flex items-center gap-2">
          {onOpenStudentView && (
            <button
              type="button"
              onClick={onOpenStudentView}
              className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-indigo-600"
            >
              Student answering page
            </button>
          )}
          <div className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-rose-600">
            Admin · Article MCQ
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-3xl font-black text-slate-800">Article Quizzes</h2>
        <p className="text-slate-500">
          Submit an article URL, open the link, let AI create MCQs, edit questions, and track submissions.
        </p>
      </div>

      <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
        {(
          [
            ['create', 'URL + AI', Link2],
            ['edit', 'Edit Qns', Pencil],
            ['roster', 'Submissions', Users],
            ['groups', 'Groups', Users],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-black transition-all ${
              tab === id ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">
          {error}
        </div>
      )}

      {tab === 'create' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Quiz title (optional — filled from the page)"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-800"
            />

            <label className="block space-y-2">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                Article URL
              </span>
              <div className="flex flex-col gap-3 sm:flex-row">
                <input
                  type="url"
                  value={articleUrl}
                  onChange={(e) => setArticleUrl(e.target.value)}
                  placeholder="https://example.com/article"
                  className="w-full flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800"
                />
                <button
                  type="button"
                  disabled={fetchingUrl}
                  onClick={handleSubmitArticleUrl}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-60"
                >
                  {fetchingUrl ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Link2 size={16} />
                  )}
                  Submit URL
                </button>
              </div>
            </label>

            {sourceUrl && (
              <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
                <CheckCircle2 size={16} className="text-emerald-600" />
                <span className="font-bold text-emerald-800">Link loaded</span>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-indigo-600 hover:underline"
                >
                  Open article <ExternalLink size={14} />
                </a>
                <span className="text-xs text-emerald-700/70">
                  {article.length.toLocaleString()} chars extracted for AI
                </span>
              </div>
            )}

            {article && (
              <details className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3">
                <summary className="cursor-pointer text-xs font-black uppercase tracking-wider text-slate-400">
                  Preview extracted text
                </summary>
                <div className="mt-3 max-h-48 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                  {article}
                </div>
              </details>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-bold text-slate-500">
                Group
                <select
                  value={draftGroupId}
                  onChange={(e) => setDraftGroupId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-800"
                >
                  <option value="">Select group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-sm font-bold text-slate-500">
                Q count
                <input
                  type="number"
                  min={3}
                  max={12}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value) || 5)}
                  className="w-16 rounded-lg border border-slate-200 px-2 py-1"
                />
              </label>
              <button
                type="button"
                disabled={generating || !article}
                onClick={handleGenerate}
                className="ml-auto inline-flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {generating ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
                AI Jobs · Create MCQs
              </button>
            </div>
            {groups.length === 0 && (
              <p className="text-xs font-bold text-amber-600">
                Create a group in the Groups tab first, then assign quizzes to it.
              </p>
            )}
          </div>

          {draftQuestions.length > 0 && (
            <div className="space-y-4">
              <h3 className="text-lg font-black text-slate-800">Generated questions (editable)</h3>
              {renderQuestionEditor(draftQuestions, 'draft')}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => handleSaveNew(false)}
                  disabled={loading}
                  className="flex-1 rounded-2xl border-2 border-slate-200 py-4 font-black text-slate-600 hover:bg-slate-50"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => handleSaveNew(true)}
                  disabled={loading}
                  className="flex-1 rounded-2xl bg-emerald-600 py-4 font-black text-white hover:bg-emerald-700"
                >
                  Save & Publish
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'edit' && (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            {quizzes.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  selectedId === q.id
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {q.title} {q.published ? '· Live' : '· Draft'} · {groupName(q.groupId)}
              </button>
            ))}
            {quizzes.length === 0 && (
              <p className="text-sm text-slate-400">No quizzes yet — create one in Upload + AI.</p>
            )}
          </div>

          {selected && (
            <div className="space-y-4 rounded-3xl border border-slate-200 bg-white p-6">
              <input
                value={selected.title}
                onChange={(e) => patchSelected({ title: e.target.value })}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xl font-black text-slate-800"
              />
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Group
                </span>
                <select
                  value={selected.groupId || ''}
                  onChange={(e) =>
                    patchSelected({ groupId: e.target.value || undefined })
                  }
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
                >
                  <option value="">No group</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Article URL
                </span>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    type="url"
                    value={selected.sourceUrl || ''}
                    onChange={(e) => patchSelected({ sourceUrl: e.target.value })}
                    placeholder="https://…"
                    className="w-full flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm"
                  />
                  {selected.sourceUrl && (
                    <a
                      href={selected.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-600"
                    >
                      Open <ExternalLink size={14} />
                    </a>
                  )}
                </div>
              </label>
              <textarea
                value={selected.article}
                onChange={(e) => patchSelected({ article: e.target.value })}
                rows={6}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
              />
              {renderQuestionEditor(selected.questions, 'selected')}
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => patchSelected({ published: !selected.published })}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-black text-slate-700"
                >
                  {selected.published ? <EyeOff size={16} /> : <Eye size={16} />}
                  {selected.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdits}
                  disabled={loading}
                  className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-700"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (!confirm('Delete this quiz?')) return;
                    await deleteArticleQuiz(selected.id);
                    setSelectedId(null);
                    await refresh();
                  }}
                  className="ml-auto rounded-2xl bg-rose-50 px-4 py-3 text-sm font-black text-rose-600"
                >
                  Delete
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'roster' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            {quizzes.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => setSelectedId(q.id)}
                className={`rounded-full px-4 py-2 text-xs font-black ${
                  selectedId === q.id
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {q.title}
              </button>
            ))}
            {selectedId && (
              <button
                type="button"
                disabled={refreshingStats}
                onClick={async () => {
                  setRefreshingStats(true);
                  setError('');
                  try {
                    await refreshArticleQuizStats(selectedId);
                    await loadRoster(selectedId);
                  } catch (e: any) {
                    setError(e.message || 'Failed to refresh AI stats');
                  } finally {
                    setRefreshingStats(false);
                  }
                }}
                className="ml-auto inline-flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {refreshingStats ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Refresh AI Stats
              </button>
            )}
          </div>

          {roster?.classStats && (
            <div className="space-y-4 rounded-3xl border border-indigo-100 bg-gradient-to-br from-indigo-50 to-white p-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-widest text-indigo-400">
                    AI Class Consolidation
                  </p>
                  <h3 className="text-xl font-black text-slate-800">Live performance overview</h3>
                </div>
                <p className="text-[10px] font-bold text-slate-400">
                  Updated {new Date(roster.classStats.updatedAt).toLocaleString()}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Submitted', `${roster.classStats.submittedCount}/${roster.classStats.totalStudents}`],
                  ['Avg %', `${roster.classStats.averagePercent}%`],
                  ['Highest', String(roster.classStats.highestScore)],
                  ['Lowest', String(roster.classStats.lowestScore)],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-2xl bg-white px-4 py-3 shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                    <p className="text-2xl font-black text-slate-800">{value}</p>
                  </div>
                ))}
              </div>

              <p className="text-sm leading-relaxed text-slate-700 font-medium">
                {roster.classStats.aiSummary}
              </p>

              <div className="grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl bg-emerald-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase text-emerald-600">Strengths</p>
                  <ul className="space-y-1 text-sm text-emerald-900">
                    {roster.classStats.strengths.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-amber-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase text-amber-600">Weaknesses</p>
                  <ul className="space-y-1 text-sm text-amber-900">
                    {roster.classStats.weaknesses.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
                <div className="rounded-2xl bg-sky-50 p-4">
                  <p className="mb-2 text-xs font-black uppercase text-sky-600">Recommendations</p>
                  <ul className="space-y-1 text-sm text-sky-900">
                    {roster.classStats.recommendations.map((s) => (
                      <li key={s}>• {s}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {roster.classStats.questionAccuracy.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Per-question accuracy
                  </p>
                  {roster.classStats.questionAccuracy.map((qa) => (
                    <div key={qa.questionId} className="rounded-2xl bg-white px-4 py-3 text-sm">
                      <div className="flex justify-between gap-3">
                        <p className="font-bold text-slate-700 line-clamp-2">{qa.prompt}</p>
                        <span className="shrink-0 font-black text-indigo-600">{qa.correctRate}%</span>
                      </div>
                      {qa.commonWrongAnswer && (
                        <p className="mt-1 text-xs text-slate-400">
                          Common wrong answer: {qa.commonWrongAnswer}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {roster && !roster.classStats && roster.submitted.length > 0 && (
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 px-4 py-3 text-sm text-indigo-700">
              Submissions received. Click <b>Refresh AI Stats</b> to consolidate class performance.
            </div>
          )}

          {roster && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border border-emerald-100 bg-emerald-50/50 p-5 space-y-3">
                <h3 className="flex items-center gap-2 font-black text-emerald-700">
                  <CheckCircle2 size={18} /> Submitted ({roster.submitted.length})
                </h3>
                {roster.submitted.length === 0 && (
                  <p className="text-sm text-emerald-700/60">No submissions yet.</p>
                )}
                {roster.submitted.map((s) => (
                  <div
                    key={s.uid}
                    className="rounded-2xl bg-white px-4 py-3 text-sm space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-800">{s.studentName}</span>
                      <span className="font-black text-emerald-600">
                        {s.score}/{s.maxScore}
                      </span>
                    </div>
                    {s.overallFeedback && (
                      <p className="text-xs text-slate-500 line-clamp-2">{s.overallFeedback}</p>
                    )}
                  </div>
                ))}
              </div>
              <div className="rounded-3xl border border-amber-100 bg-amber-50/50 p-5 space-y-3">
                <h3 className="flex items-center gap-2 font-black text-amber-700">
                  <Users size={18} /> Unsubmitted ({roster.unsubmitted.length})
                </h3>
                {roster.unsubmitted.length === 0 && (
                  <p className="text-sm text-amber-700/60">Everyone on the roster has submitted.</p>
                )}
                {roster.unsubmitted.map((s) => (
                  <div
                    key={s.uid}
                    className="rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-700"
                  >
                    {s.studentName}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!selectedId && (
            <p className="text-sm text-slate-400">Select a quiz to view its roster.</p>
          )}
        </div>
      )}

      {tab === 'groups' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 space-y-4">
            <h3 className="text-lg font-black text-slate-800">Create group</h3>
            <p className="text-sm text-slate-500">
              Each group gets one join code. Share the code with students — they only see quizzes
              assigned to that group.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="Group name (e.g. P5 Class A)"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"
              />
              <input
                value={newGroupCode}
                onChange={(e) => setNewGroupCode(e.target.value.toUpperCase())}
                placeholder="Optional custom code (auto if blank)"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black tracking-widest text-slate-800 uppercase"
              />
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleCreateGroup}
              className="rounded-2xl bg-rose-600 px-5 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:opacity-60"
            >
              Create Group
            </button>
          </div>

          <div className="space-y-3">
            {groups.length === 0 && (
              <div className="rounded-3xl border border-dashed border-slate-200 p-8 text-center text-slate-400">
                No groups yet.
              </div>
            )}
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5"
              >
                <div>
                  <p className="font-black text-slate-800">{g.name}</p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">
                    Join code
                  </p>
                  <p className="font-black tracking-[0.25em] text-indigo-600 text-xl">{g.code}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {quizzes.filter((q) => q.groupId === g.id).length} quiz(zes) assigned
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteGroup(g.id)}
                  className="rounded-xl px-3 py-2 text-sm font-bold text-rose-500 hover:bg-rose-50"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(loading || generating) && tab !== 'create' && (
        <div className="flex justify-center text-slate-400">
          <Loader2 className="animate-spin" />
        </div>
      )}
    </div>
  );
};

export default ArticleQuizAdmin;
