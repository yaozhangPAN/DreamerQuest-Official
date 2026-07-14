import React from 'react';
import { EvaluationResult } from '../types';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { CheckCircle2, Trophy, ArrowRight, Gift } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface ResultViewProps {
  result: EvaluationResult;
  onDone: () => void;
}

const ResultView: React.FC<ResultViewProps> = ({ result, onDone }) => {
  const chartData = [
    { subject: 'Idea', value: result.scores.idea },
    { subject: 'Structure', value: result.scores.structure },
    { subject: 'Content', value: result.scores.content },
    { subject: 'Language', value: result.scores.language },
    { subject: 'Voice', value: result.scores.voice },
  ];

  const totalScore = result.scores.idea + result.scores.structure + result.scores.content + result.scores.language + result.scores.voice;
  const maxXpFromRubric = totalScore * 5;

  return (
    <div className="max-w-3xl mx-auto space-y-8 animate-in zoom-in duration-500">
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl mb-2">
          <CheckCircle2 size={48} />
        </div>
        <h2 className="text-4xl font-black text-slate-800">Homework Evaluated!</h2>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="bg-amber-100 text-amber-700 px-4 py-1.5 rounded-full font-black text-sm flex items-center gap-2">
            <Trophy size={16} />
            RUBRIC: {totalScore}/100
          </div>
          <div className="bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full font-black text-sm">
            UP TO {maxXpFromRubric} XP FROM SCORES
          </div>
          {result.welcomeBoostApplied && (
            <div className="bg-pink-100 text-pink-700 px-4 py-1.5 rounded-full font-black text-sm flex items-center gap-2">
              <Gift size={16} />
              WELCOME BOOST → 250 XP
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Radar Chart */}
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
          <h3 className="font-bold text-slate-700 mb-4">Rubric Analysis</h3>
          <div className="w-full h-64">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="#4f46e5"
                  fill="#4f46e5"
                  fillOpacity={0.5}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm w-full">
            {chartData.map(d => (
              <div key={d.subject} className="flex justify-between border-b border-slate-50 py-1">
                <span className="text-slate-500 font-medium">{d.subject}</span>
                <span className="font-bold text-slate-800">{d.value}/20 · {d.value * 5} XP</span>
              </div>
            ))}
          </div>
        </div>

        {/* XP Gain Card */}
        <div className="bg-indigo-600 p-8 rounded-3xl text-white shadow-xl shadow-indigo-100 flex flex-col justify-center items-center text-center space-y-6">
          <p className="text-indigo-100 font-bold uppercase tracking-widest text-sm">TOTAL XP EARNED</p>
          <div className="text-7xl font-black tabular-nums">+{result.totalXp}</div>
          <p className="text-indigo-200 text-xs font-bold uppercase tracking-wider">Max 500 XP · 100 XP per criterion</p>
          <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl border border-white/20 w-full">
            <p className="text-sm italic opacity-90">
              {result.isDuplicate
                ? "This looks like a repeat submission! No XP added this time."
                : result.welcomeBoostApplied
                  ? "Welcome boost applied! Your first composition earned at least 250 XP."
                  : "Great progress! Keep writing to unlock your next reward."}
            </p>
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="text-xl font-bold text-slate-800">Teacher's Feedback</h3>
        <div className="prose prose-slate max-w-none text-slate-600 leading-relaxed">
          <ReactMarkdown>{result.feedback}</ReactMarkdown>
        </div>
      </div>

      <button
        onClick={onDone}
        className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black text-lg py-5 rounded-2xl flex items-center justify-center gap-3 transition-all"
      >
        BACK TO DASHBOARD
        <ArrowRight size={24} />
      </button>
    </div>
  );
};

export default ResultView;
