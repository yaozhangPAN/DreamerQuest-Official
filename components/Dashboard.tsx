
import React from 'react';
import { UserStats } from '../types';
import { Trophy, Star, Gift, TrendingUp, Zap, Mic, Send, PlayCircle } from 'lucide-react';

interface DashboardProps {
  stats: UserStats;
  onStart: () => void;
  onStartSpelling: () => void;
  onStartOral: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ stats, onStart, onStartSpelling, onStartOral }) => {
  const currentLevelXp = stats.totalXp % 1000;
  const progressPercent = (currentLevelXp / 1000) * 100;
  const nextPrizeLevel = Math.ceil((stats.level + 0.1) / 10) * 10;
  const levelsToPrize = nextPrizeLevel - stats.level;

  const hasActiveSpellingSession = stats.activeSpellingSession && 
    stats.activeSpellingSession.currentSessionIndex < stats.activeSpellingSession.sessions.length;

  const getRank = (level: number) => {
    if (level < 5) return "Novice Narrator";
    if (level < 10) return "Word Wizard";
    if (level < 20) return "Master Storyteller";
    return "Legendary Author";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Welcome & Main Level */}
      <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl shadow-indigo-100 relative overflow-hidden">
        {/* Background Decorative element */}
        <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <p className="text-indigo-200 font-black uppercase tracking-[0.2em] text-xs mb-2">
              {getRank(stats.level)}
            </p>
            <h2 className="text-4xl font-black mb-1">Welcome back, {stats.profile?.name || 'Writer'}!</h2>
            <p className="text-indigo-100 font-medium opacity-90">{stats.profile?.school} • {stats.profile?.level}</p>
          </div>
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl px-6 py-4 rounded-3xl border border-white/20 shadow-inner">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-wider opacity-70">Level</p>
              <p className="text-4xl font-black tracking-tighter">{stats.level}</p>
            </div>
            <div className="bg-gradient-to-tr from-amber-400 to-amber-300 p-3 rounded-2xl shadow-xl shadow-amber-500/30">
              <Star className="text-white fill-current" size={32} />
            </div>
          </div>
        </div>

        {/* XP Progress Bar */}
        <div className="mt-10">
          <div className="flex justify-between items-end mb-3">
            <span className="text-xs font-black uppercase tracking-widest opacity-80">XP PROGRESS</span>
            <span className="text-sm font-black bg-white/20 px-3 py-1 rounded-full">{currentLevelXp} / 1000 XP</span>
          </div>
          <div className="h-5 bg-black/20 rounded-full overflow-hidden p-1.5 shadow-inner">
            <div 
              className="h-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-400 rounded-full transition-all duration-1000 ease-out shadow-[0_0_15px_rgba(52,211,153,0.6)]"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Active Session Callout */}
      {hasActiveSpellingSession && (
        <div className="animate-in slide-in-from-top duration-700">
          <button 
            onClick={onStartSpelling}
            className="w-full bg-amber-500 hover:bg-amber-600 text-white p-6 rounded-[2rem] shadow-xl shadow-amber-100/50 transition-all flex items-center justify-between group transform hover:scale-[1.01] active:scale-[0.99]"
          >
            <div className="flex items-center gap-4">
              <div className="bg-white/20 p-4 rounded-2xl group-hover:rotate-12 transition-transform">
                <PlayCircle size={32} />
              </div>
              <div className="text-left">
                <h3 className="text-xl font-black">Continue Spelling</h3>
                <p className="text-amber-100 font-bold opacity-90">
                  Session {stats.activeSpellingSession!.currentSessionIndex + 1} of {stats.activeSpellingSession!.sessions.length}
                </p>
              </div>
            </div>
            <TrendingUp className="opacity-50 group-hover:translate-x-2 transition-transform" />
          </button>
        </div>
      )}

      {/* Action CTA Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
        <button 
          onClick={onStart}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xl py-10 rounded-[2.5rem] shadow-xl shadow-indigo-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-4 group"
        >
          <div className="bg-white/20 p-4 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <Send size={32} />
          </div>
          SUBMIT ESSAY
        </button>

        <button 
          onClick={onStartSpelling}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl py-10 rounded-[2.5rem] shadow-xl shadow-emerald-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-4 group"
        >
          <div className="bg-white/20 p-4 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <Mic size={32} />
          </div>
          {hasActiveSpellingSession ? 'NEW SPELLING LIST' : 'SPELLING PRACTICE'}
        </button>

        <button 
          onClick={onStartOral}
          className="bg-amber-500 hover:bg-amber-600 text-white font-black text-xl py-10 rounded-[2.5rem] shadow-xl shadow-amber-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-4 group"
        >
          <div className="bg-white/20 p-4 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <PlayCircle size={32} />
          </div>
          ORAL PRACTICE
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:border-blue-200 transition-colors">
          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Submissions</p>
            <p className="text-2xl font-black text-slate-800">{stats.submissionHistory.length}</p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:border-orange-200 transition-colors">
          <div className="bg-orange-100 p-4 rounded-2xl text-orange-600">
            <Zap size={24} />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Bonuses</p>
            <p className="text-2xl font-black text-slate-800">{stats.bonusCharges}</p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:border-pink-200 transition-colors">
          <div className="bg-pink-100 p-4 rounded-2xl text-pink-600">
            <Gift size={24} />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Prizes Won</p>
            <p className="text-2xl font-black text-slate-800">{stats.prizesWon.length}</p>
          </div>
        </div>
      </div>

      {/* Prize Milestone */}
      <div className="bg-white p-8 md:p-10 rounded-[2.5rem] border border-slate-200 shadow-sm relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 translate-x-10 -translate-y-10 group-hover:translate-x-0 group-hover:translate-y-0 transition-transform duration-700">
          <Trophy className="text-slate-100" size={160} />
        </div>
        <div className="relative z-10">
          <h3 className="text-2xl font-black text-slate-800 mb-2">Next Robux Milestone</h3>
          <p className="text-slate-500 mb-8 font-medium">Reach Level {nextPrizeLevel} to unlock a new Robux gift card code for your parents to redeem!</p>
          <div className="flex items-center gap-6">
            <div className="flex-1 bg-slate-100 h-3 rounded-full overflow-hidden shadow-inner">
              <div 
                className="h-full bg-indigo-600 rounded-full shadow-[0_0_10px_rgba(79,70,229,0.3)]"
                style={{ width: `${((stats.level % 10) / 10) * 100}%` }}
              />
            </div>
            <span className="font-black text-indigo-600 text-lg">{levelsToPrize} levels to go</span>
          </div>
        </div>
      </div>

      {/* My Prizes */}
      {stats.prizesWon.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
            <div className="bg-indigo-100 p-2 rounded-xl text-indigo-600">
              <Gift size={24} />
            </div>
            Your Treasure Chest
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {stats.prizesWon.map((code, idx) => (
              <div key={idx} className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] flex justify-between items-center shadow-sm hover:shadow-md transition-shadow">
                <div>
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">Robux Reward</p>
                  <p className="font-mono font-black text-xl text-emerald-800 tracking-wider">{code}</p>
                </div>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(code);
                    alert('Copied to clipboard!');
                  }}
                  className="bg-white px-5 py-2 rounded-2xl text-sm font-black text-emerald-700 border border-emerald-200 hover:bg-emerald-100 hover:scale-105 transition-all active:scale-95"
                >
                  COPY
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
