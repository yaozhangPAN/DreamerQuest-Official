
import React, { useState } from 'react';
import { UserStats } from '../types';
import { Trophy, Star, Gift, TrendingUp, Zap, Mic, Send, PlayCircle, Github, RefreshCw, CheckCircle, ExternalLink, AlertCircle } from 'lucide-react';

interface DashboardProps {
  stats: UserStats;
  onStart: () => void;
  onStartSpelling: () => void;
  onContinueSpelling: () => void;
  onShowHistory: () => void;
  onStartOral: () => void;
  uid: string;
  onRefreshStats: () => void;
}

const Dashboard: React.FC<DashboardProps> = ({ stats, onStart, onStartSpelling, onContinueSpelling, onShowHistory, onStartOral, uid, onRefreshStats }) => {
  const currentLevelXp = stats.totalXp % 1000;
  const progressPercent = (currentLevelXp / 1000) * 100;
  const nextPrizeLevel = Math.ceil((stats.level + 0.1) / 10) * 10;
  const levelsToPrize = nextPrizeLevel - stats.level;

  const incompleteSpellingCount = stats.activeSpellingSessions.filter(s => !s.isCompleted).length;
  const submissionsCount = stats.submissions?.length || 0;

  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ success: boolean; repoUrl?: string; error?: string } | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  const handleConnectGithub = async () => {
    try {
      const response = await fetch(`/api/auth/github/url?uid=${uid}`);
      if (!response.ok) {
        throw new Error('Failed to get GitHub authorize URL');
      }
      const { url } = await response.json();

      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        url,
        'github_oauth_popup',
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      if (!popup) {
        alert('Popup was blocked! Please enable popups to connect to GitHub.');
      }
    } catch (error: any) {
      console.error('Error connecting to GitHub:', error);
      alert('Error connecting to GitHub: ' + error.message);
    }
  };

  const handleDisconnectGithub = async () => {
    if (!window.confirm("Are you sure you want to disconnect your GitHub account?")) return;
    setIsDisconnecting(true);
    try {
      const response = await fetch('/api/github/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      if (!response.ok) throw new Error('Failed to disconnect');
      onRefreshStats();
      setSyncResult(null);
    } catch (error: any) {
      alert('Error disconnecting: ' + error.message);
    } finally {
      setIsDisconnecting(false);
    }
  };

  const handleSyncPortfolio = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const response = await fetch('/api/github/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to sync');
      }
      setSyncResult({ success: true, repoUrl: data.repoUrl });
    } catch (error: any) {
      setSyncResult({ success: false, error: error.message });
    } finally {
      setIsSyncing(false);
    }
  };

  const getRank = (level: number) => {
    if (level < 5) return "Novice Narrator";
    if (level < 10) return "Word Wizard";
    if (level < 20) return "Master Storyteller";
    return "Legendary Author";
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Welcome & Main Level */}
      <div className="bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 rounded-[2.5rem] p-8 md:p-10 text-white shadow-2xl shadow-indigo-200/50 relative overflow-hidden">
        {/* Background Decorative element */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl"></div>
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div>
            <p className="text-indigo-200 font-black uppercase tracking-[0.2em] text-xs mb-2">
              {getRank(stats.level)}
            </p>
            <h2 className="text-4xl font-black mb-1 text-white opacity-100 drop-shadow-md">Welcome back, {stats.profile?.name || 'Writer'}!</h2>
            <p className="text-white font-medium opacity-100 drop-shadow-md">{stats.profile?.school} • {stats.profile?.level}</p>
          </div>
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xl px-6 py-4 rounded-3xl border border-white/20 shadow-inner">
            <div className="text-right">
              <p className="text-xs font-black uppercase tracking-wider opacity-90 text-white">Level</p>
              <p className="text-4xl font-black tracking-tighter text-white drop-shadow-md">{stats.level}</p>
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

      {/* Action CTA Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
        <button 
          onClick={onStartSpelling}
          className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xl py-8 rounded-[2.5rem] shadow-xl shadow-emerald-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-3 group"
        >
          <div className="bg-white/20 p-3 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <Mic size={28} />
          </div>
          SPELLING PRACTICE
          {incompleteSpellingCount > 0 && (
            <span className="text-xs bg-white/20 px-3 py-1 rounded-full animate-pulse">
              {incompleteSpellingCount} ACTIVE
            </span>
          )}
        </button>

        <button 
          onClick={onStart}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xl py-8 rounded-[2.5rem] shadow-xl shadow-indigo-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-3 group"
        >
          <div className="bg-white/20 p-3 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <Send size={28} />
          </div>
          COMPOSITION PRACTICE
        </button>

        <button 
          onClick={onStartOral}
          className="bg-sky-500 hover:bg-sky-600 text-white font-black text-xl py-8 rounded-[2.5rem] shadow-xl shadow-sky-100 transition-all transform hover:-translate-y-1 active:scale-95 flex flex-col items-center gap-3 group"
        >
          <div className="bg-white/20 p-3 rounded-[1.5rem] group-hover:scale-110 transition-transform">
            <PlayCircle size={28} />
          </div>
          ORAL PRACTICE
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <button 
          onClick={onShowHistory}
          className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm flex items-center gap-5 hover:border-blue-200 transition-colors text-left"
        >
          <div className="bg-blue-100 p-4 rounded-2xl text-blue-600">
            <TrendingUp size={24} />
          </div>
          <div>
            <p className="text-slate-500 text-xs font-black uppercase tracking-wider">Submissions</p>
            <p className="text-2xl font-black text-slate-800">{submissionsCount}</p>
          </div>
        </button>
        
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

      {/* GitHub Portfolio Integration */}
      <div id="github-portfolio-card" className="bg-slate-900 text-white p-8 md:p-10 rounded-[2.5rem] shadow-2xl relative overflow-hidden group">
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-4 right-4 text-slate-800 opacity-20 pointer-events-none">
          <Github size={120} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-indigo-600/30 p-2.5 rounded-2xl text-indigo-400">
              <Github size={24} />
            </div>
            <h3 className="text-2xl font-black text-white tracking-tight">GitHub Creative Writing Portfolio</h3>
          </div>
          
          <p className="text-slate-400 font-medium max-w-2xl mb-8 leading-relaxed">
            Connect your GitHub account to automatically compile and back up your creative essay submissions, 
            spelling logs, and performance marks into a beautiful markdown portfolio repository (**DreamerQuest-Portfolio**)!
          </p>

          {stats.githubConnection ? (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-800/60 backdrop-blur-md p-6 rounded-3xl border border-slate-700/50">
                <div className="flex items-center gap-4">
                  <img 
                    src={stats.githubConnection.avatarUrl} 
                    alt="GitHub Avatar" 
                    className="w-14 h-14 rounded-full border-2 border-indigo-500"
                    referrerPolicy="no-referrer"
                  />
                  <div>
                    <p className="text-xs font-black text-indigo-400 uppercase tracking-widest">CONNECTED ACCOUNT</p>
                    <p className="font-bold text-lg text-white">@{stats.githubConnection.username}</p>
                    <p className="text-xs text-slate-400">Connected on {new Date(stats.githubConnection.connectedAt).toLocaleDateString()}</p>
                  </div>
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={handleSyncPortfolio}
                    disabled={isSyncing}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white px-5 py-3 rounded-2xl text-sm font-black transition-all shadow-lg active:scale-95"
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>SYNCING...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw size={18} />
                        <span>SYNC PORTFOLIO</span>
                      </>
                    )}
                  </button>
                  
                  <button
                    onClick={handleDisconnectGithub}
                    disabled={isDisconnecting}
                    className="bg-transparent hover:bg-slate-700/50 text-slate-300 border border-slate-700 px-5 py-3 rounded-2xl text-sm font-bold transition-all"
                  >
                    Disconnect
                  </button>
                </div>
              </div>

              {syncResult && (
                <div className={`p-5 rounded-2xl border flex items-start gap-3 animate-in fade-in duration-300 ${syncResult.success ? 'bg-emerald-950/40 border-emerald-800/40 text-emerald-300' : 'bg-rose-950/40 border-rose-800/40 text-rose-300'}`}>
                  {syncResult.success ? (
                    <>
                      <CheckCircle className="text-emerald-400 shrink-0 mt-0.5" size={20} />
                      <div className="flex-1">
                        <p className="font-bold text-sm">Successfully Synchronized!</p>
                        <p className="text-xs text-slate-400 mt-1 mb-3">All your writing achievements are published to your repository.</p>
                        <a 
                          href={syncResult.repoUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-4 py-2 rounded-xl text-xs font-black transition-colors"
                        >
                          <span>VIEW REPOSITORY</span>
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="text-rose-400 shrink-0 mt-0.5" size={20} />
                      <div>
                        <p className="font-bold text-sm">Synchronization Failed</p>
                        <p className="text-xs text-slate-400 mt-1">{syncResult.error}</p>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={handleConnectGithub}
              className="flex items-center gap-2 bg-white hover:bg-slate-100 text-slate-900 px-6 py-4 rounded-3xl font-black text-sm tracking-wide transition-all shadow-xl hover:shadow-indigo-500/10 hover:scale-[1.02] active:scale-95"
            >
              <Github size={20} />
              <span>CONNECT GITHUB ACCOUNT</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
