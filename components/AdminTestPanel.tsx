import React, { useMemo, useState } from 'react';
import { FlaskConical, X, Zap } from 'lucide-react';
import { RubricScore } from '../types';
import {
  calculateCompositionXp,
  calculateOralXp,
  calculateSpellingXp,
} from '../lib/xpSystem';

export type AdminInstantPayload =
  | { type: 'Spelling'; correctWords: number }
  | { type: 'Oral'; marks: number }
  | {
      type: 'Composition';
      scores: RubricScore;
      coPilot: boolean;
      treatAsFirstSubmission: boolean;
    };

interface AdminTestPanelProps {
  onInstantComplete: (payload: AdminInstantPayload) => void;
}

const defaultScores: RubricScore = {
  idea: 16,
  structure: 16,
  content: 16,
  language: 16,
  voice: 16,
};

const AdminTestPanel: React.FC<AdminTestPanelProps> = ({ onInstantComplete }) => {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'Spelling' | 'Oral' | 'Composition'>('Spelling');
  const [correctWords, setCorrectWords] = useState(10);
  const [oralMarks, setOralMarks] = useState(30);
  const [scores, setScores] = useState<RubricScore>(defaultScores);
  const [coPilot, setCoPilot] = useState(false);
  const [treatAsFirst, setTreatAsFirst] = useState(false);

  const previewXp = useMemo(() => {
    if (tab === 'Spelling') return calculateSpellingXp(correctWords);
    if (tab === 'Oral') return calculateOralXp(oralMarks);
    return calculateCompositionXp(scores, {
      coPilot,
      isFirstSubmission: treatAsFirst,
      isDuplicate: false,
    }).xp;
  }, [tab, correctWords, oralMarks, scores, coPilot, treatAsFirst]);

  const apply = () => {
    if (tab === 'Spelling') {
      onInstantComplete({ type: 'Spelling', correctWords });
    } else if (tab === 'Oral') {
      onInstantComplete({ type: 'Oral', marks: oralMarks });
    } else {
      onInstantComplete({
        type: 'Composition',
        scores,
        coPilot,
        treatAsFirstSubmission: treatAsFirst,
      });
    }
  };

  const setAllCriteria = (value: number) => {
    setScores({
      idea: value,
      structure: value,
      content: value,
      language: value,
      voice: value,
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[90] flex items-center gap-2 rounded-2xl bg-rose-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-rose-200 hover:bg-rose-700"
      >
        <FlaskConical size={18} />
        ADMIN TEST
      </button>

      {open && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-lg overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-rose-600 px-5 py-4 text-white">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-rose-100">QA Mode</p>
                <h3 className="text-lg font-black">Instant Complete</h3>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-xl bg-white/15 p-2 hover:bg-white/25"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="flex gap-2 rounded-2xl bg-slate-100 p-1">
                {(['Spelling', 'Oral', 'Composition'] as const).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setTab(name)}
                    className={`flex-1 rounded-xl py-2 text-xs font-black transition-all ${
                      tab === name ? 'bg-white text-rose-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>

              {tab === 'Spelling' && (
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Correct words
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={correctWords}
                    onChange={(e) => setCorrectWords(Math.max(0, Number(e.target.value) || 0))}
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-800"
                  />
                  <p className="text-sm text-slate-500">5 XP × correct words</p>
                </label>
              )}

              {tab === 'Oral' && (
                <label className="block space-y-2">
                  <span className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Marks (evaluation score)
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={oralMarks}
                    onChange={(e) =>
                      setOralMarks(Math.min(50, Math.max(0, Number(e.target.value) || 0)))
                    }
                    className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-bold text-slate-800"
                  />
                  <p className="text-sm text-slate-500">15 XP × marks (O-Level max 30 · PSLE max 50)</p>
                </label>
              )}

              {tab === 'Composition' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {[20, 15, 10, 5, 0].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setAllCriteria(v)}
                        className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600 hover:bg-rose-50 hover:text-rose-600"
                      >
                        All {v}/20
                      </button>
                    ))}
                  </div>
                  {(
                    [
                      ['idea', 'Idea'],
                      ['structure', 'Structure'],
                      ['content', 'Content'],
                      ['language', 'Language'],
                      ['voice', 'Voice'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center justify-between gap-3">
                      <span className="w-24 text-sm font-bold text-slate-600">{label}</span>
                      <input
                        type="range"
                        min={0}
                        max={20}
                        value={scores[key]}
                        onChange={(e) =>
                          setScores((prev) => ({ ...prev, [key]: Number(e.target.value) }))
                        }
                        className="flex-1"
                      />
                      <span className="w-12 text-right text-sm font-black text-slate-800">
                        {scores[key]}
                      </span>
                    </label>
                  ))}
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={coPilot}
                      onChange={(e) => setCoPilot(e.target.checked)}
                    />
                    Co-Pilot (25% XP)
                  </label>
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
                    <input
                      type="checkbox"
                      checked={treatAsFirst}
                      onChange={(e) => setTreatAsFirst(e.target.checked)}
                    />
                    Treat as first submission (250 XP floor)
                  </label>
                </div>
              )}

              <div className="flex items-center justify-between rounded-2xl bg-indigo-50 px-4 py-3 text-indigo-700">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider">
                  <Zap size={14} /> Preview XP
                </span>
                <span className="text-2xl font-black">+{previewXp}</span>
              </div>

              <button
                type="button"
                onClick={apply}
                className="w-full rounded-2xl bg-rose-600 py-4 text-lg font-black text-white hover:bg-rose-700"
              >
                INSTANT COMPLETE
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AdminTestPanel;
