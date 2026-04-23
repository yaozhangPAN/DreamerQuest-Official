
import React, { useState, useEffect } from 'react';
import { AppView, UserStats, EvaluationResult, SpellingSession, UserProfile } from './types';
import { evaluateEssay } from './geminiService';
import Dashboard from './components/Dashboard';
import SubmissionForm from './components/SubmissionForm';
import ResultView from './components/ResultView';
import CoPilotChat from './components/CoPilotChat';
import SpellingPractice from './components/SpellingPractice';
import SignupForm from './components/SignupForm';
import OralPractice from './components/OralPractice';
import OralSelection from './components/OralSelection';
import { BookOpen, LayoutDashboard, Send, Mic, LogOut, PlayCircle } from 'lucide-react';

const XP_PER_LEVEL = 1000;

const App: React.FC = () => {
  const [userStats, setUserStats] = useState<UserStats>(() => {
    const saved = localStorage.getItem('dreamerquest_stats');
    return saved ? JSON.parse(saved) : {
      profile: null,
      totalXp: 0,
      level: 1,
      prizesWon: [],
      submissionHistory: [],
      lastScore: 0,
      bonusCharges: 0,
      activeSpellingSession: null
    };
  });

  const [view, setView] = useState<AppView>(() => {
    return userStats.profile ? AppView.DASHBOARD : AppView.SIGNUP;
  });

  const [currentTopic, setCurrentTopic] = useState('');
  const [selectedOralId, setSelectedOralId] = useState<number>(1);
  const [isCoPilotActiveForSubmission, setIsCoPilotActiveForSubmission] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    localStorage.setItem('dreamerquest_stats', JSON.stringify(userStats));
  }, [userStats]);

  const handleSignup = (profile: UserProfile) => {
    setUserStats(prev => ({ ...prev, profile }));
    setView(AppView.DASHBOARD);
  };

  const generatePrizeCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if ((i + 1) % 4 === 0 && i !== 11) code += '-';
    }
    return code;
  };

  const handleSpellingXp = (correctCount: number) => {
    const xpToAdd = correctCount * 5; // 5 XP per word
    const newTotalXp = userStats.totalXp + xpToAdd;
    const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;
    
    setUserStats(prev => ({
      ...prev,
      totalXp: newTotalXp,
      level: newLevel
    }));
  };

  const handleSaveSpellingSession = (session: SpellingSession | null) => {
    setUserStats(prev => ({ ...prev, activeSpellingSession: session }));
  };

  const handleOralXp = (marks: number) => {
    const xpToAdd = marks * 15; // 15 XP per mark
    const newTotalXp = userStats.totalXp + xpToAdd;
    const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;

    setUserStats(prev => ({
      ...prev,
      totalXp: newTotalXp,
      level: newLevel
    }));
  };

  const handleSubmission = async (imagesBase64: string[]) => {
    setIsProcessing(true);
    try {
      const contentHash = `hash_${imagesBase64.reduce((acc, curr) => acc + curr.length, 0)}`;
      const isDuplicate = userStats.submissionHistory.includes(contentHash);

      const evaluation = await evaluateEssay(imagesBase64, currentTopic);
      
      let scoreXp = evaluation.scores.idea + evaluation.scores.structure + evaluation.scores.content + evaluation.scores.language + evaluation.scores.voice;
      
      if (isCoPilotActiveForSubmission) {
        scoreXp = Math.floor(scoreXp / 4);
      }

      const isFirstSubmission = userStats.submissionHistory.length === 0;
      if (isFirstSubmission && scoreXp < 50 && scoreXp > 0) scoreXp = 50;
      if (isDuplicate) scoreXp = 0;

      let finalXp = scoreXp;
      const bonusApplied = userStats.bonusCharges > 0 && !isDuplicate && scoreXp > 0;
      if (bonusApplied) {
        finalXp = Math.floor(finalXp * 1.1);
      }

      const newTotalXp = userStats.totalXp + finalXp;
      const oldLevel = userStats.level;
      const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;
      
      let newPrizes = [...userStats.prizesWon];
      if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
        newPrizes.push(generatePrizeCode());
      }

      let newBonusCharges = userStats.bonusCharges > 0 ? userStats.bonusCharges - 1 : 0;
      if (!isDuplicate && !isFirstSubmission && scoreXp > userStats.lastScore && scoreXp > 0) {
        newBonusCharges = 2;
      }

      setUserStats(prev => ({
        ...prev,
        totalXp: newTotalXp,
        level: newLevel,
        prizesWon: newPrizes,
        submissionHistory: isDuplicate ? prev.submissionHistory : [...prev.submissionHistory, contentHash],
        lastScore: isDuplicate ? prev.lastScore : scoreXp,
        bonusCharges: newBonusCharges
      }));

      setLastEvaluation({
        ...evaluation,
        totalXp: finalXp,
        isDuplicate,
        bonusApplied
      });
      setView(AppView.RESULT);
      setCurrentTopic('');
      setIsCoPilotActiveForSubmission(false);
    } catch (error) {
      alert("Error processing your homework. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = () => {
    setUserStats(prev => ({ ...prev, profile: null }));
    setView(AppView.SIGNUP);
  };

  if (view === AppView.SIGNUP) {
    return <SignupForm onSignup={handleSignup} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView(AppView.DASHBOARD)}>
            <div className="bg-indigo-600 p-2 rounded-xl text-white">
              <BookOpen size={24} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">DreamerQuest</h1>
          </div>
          
          <nav className="flex gap-4">
            <button 
              onClick={() => setView(AppView.DASHBOARD)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${view === AppView.DASHBOARD ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <LayoutDashboard size={18} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button 
              onClick={() => setView(AppView.SPELLING)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${view === AppView.SPELLING ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Mic size={18} />
              <span className="hidden sm:inline">Spelling</span>
            </button>
            <button 
              onClick={() => setView(AppView.ORAL_SELECTION)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${view === AppView.ORAL_SELECTION || view === AppView.ORAL_PRACTICE ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <PlayCircle size={18} />
              <span className="hidden sm:inline">Oral</span>
            </button>
            <button 
              onClick={() => {
                setCurrentTopic('');
                setIsCoPilotActiveForSubmission(false);
                setView(AppView.SUBMIT);
              }}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${view === AppView.SUBMIT ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <Send size={18} />
              <span className="hidden sm:inline">Submit</span>
            </button>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:bg-slate-100 transition-all"
            >
              <LogOut size={18} />
              <span className="hidden sm:inline">Log Out</span>
            </button>
          </nav>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-8">
        {view === AppView.DASHBOARD && (
          <Dashboard 
            stats={userStats} 
            onStart={() => setView(AppView.SUBMIT)} 
            onStartSpelling={() => setView(AppView.SPELLING)} 
            onStartOral={() => setView(AppView.ORAL_SELECTION)}
          />
        )}
        
        {view === AppView.SUBMIT && (
          <SubmissionForm 
            isProcessing={isProcessing} 
            topic={currentTopic}
            setTopic={setCurrentTopic}
            onSubmit={handleSubmission} 
            onOpenCoPilot={() => {
              setIsCoPilotActiveForSubmission(true);
              setView(AppView.CO_PILOT);
            }}
            isCoPilotActive={isCoPilotActiveForSubmission}
          />
        )}

        {view === AppView.CO_PILOT && (
          <CoPilotChat 
            topic={currentTopic}
            onBack={() => setView(AppView.SUBMIT)} 
            onSubmitMode={() => setView(AppView.SUBMIT)}
          />
        )}

        {view === AppView.SPELLING && (
          <SpellingPractice 
            onXpEarned={handleSpellingXp}
            onDone={() => setView(AppView.DASHBOARD)}
            activeSession={userStats.activeSpellingSession}
            onSaveSession={handleSaveSpellingSession}
          />
        )}

        {view === AppView.ORAL_SELECTION && (
          <OralSelection 
            onSelect={(id) => {
              setSelectedOralId(id);
              setView(AppView.ORAL_PRACTICE);
            }}
            onBack={() => setView(AppView.DASHBOARD)}
          />
        )}

        {view === AppView.ORAL_PRACTICE && (
          <OralPractice 
            onDone={() => setView(AppView.ORAL_SELECTION)}
            onXpEarned={handleOralXp}
            practiceId={selectedOralId}
          />
        )}

        {view === AppView.RESULT && lastEvaluation && (
          <ResultView 
            result={lastEvaluation} 
            onDone={() => setView(AppView.DASHBOARD)} 
          />
        )}
      </main>

      <footer className="py-8 text-center text-slate-400 text-sm">
        <p>© 2024 DreamerQuest • {userStats.profile?.name}'s Journey • Evaluation by AI</p>
      </footer>
    </div>
  );
};

export default App;
