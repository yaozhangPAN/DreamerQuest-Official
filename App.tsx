import React, { useState, useEffect } from 'react';
import { AppView, UserStats, EvaluationResult, SpellingSession, UserProfile, HistoryItem } from './types';
import { evaluateEssay } from './geminiService';
import Dashboard from './components/Dashboard';
import SubmissionForm from './components/SubmissionForm';
import ResultView from './components/ResultView';
import CoPilotChat from './components/CoPilotChat';
import SpellingPractice from './components/SpellingPractice';
import AuthView from './components/AuthView';
import OralPractice from './components/OralPractice';
import OralSelection from './components/OralSelection';
import HistoryView from './components/HistoryView';
import SessionSelectView from './components/SessionSelectView';
import { BookOpen, LayoutDashboard, Send, Mic, LogOut, PlayCircle, Zap, ChevronLeft, Calendar, Trophy, TrendingUp } from 'lucide-react';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth, db } from './lib/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from './lib/firebaseUtils';
import { signOut } from 'firebase/auth';
import {
  devUser,
  getDevSession,
  isDevAuthBypassEnabled,
  loadDevStats,
  saveDevStats,
  setDevSession,
} from './lib/devAuth';

const XP_PER_LEVEL = 1000;
const isDevBypass = isDevAuthBypassEnabled();

const defaultStats: UserStats = {
  profile: null,
  totalXp: 0,
  level: 1,
  prizesWon: [],
  submissionHistory: [],
  submissions: [],
  lastScore: 0,
  bonusCharges: 0,
  activeSpellingSessions: [],
  isSubscribed: false
};

const App: React.FC = () => {
  const [firebaseUser, authLoading] = useAuthState(auth);
  const [devLoggedIn, setDevLoggedIn] = useState(isDevBypass && getDevSession());
  const user = isDevBypass ? (devLoggedIn ? devUser : null) : firebaseUser;
  const [isDataLoaded, setIsDataLoaded] = useState(false);

  const [userStats, setUserStats] = useState<UserStats>(defaultStats);
  const [view, setView] = useState<AppView>(AppView.SIGNUP);
  const [stripeLink, setStripeLink] = useState<string | null>(null);

  const [currentTopic, setCurrentTopic] = useState('');
  const [selectedOralId, setSelectedOralId] = useState<number>(1);
  const [customYoutubeUrl, setCustomYoutubeUrl] = useState<string>('');
  const [isCoPilotActiveForSubmission, setIsCoPilotActiveForSubmission] = useState(false);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [currentActiveSpellingSession, setCurrentActiveSpellingSession] = useState<SpellingSession | null>(null);

  const handleUpgrade = () => {
    if (!user) return;
    const baseLink = stripeLink || (import.meta as any).env.VITE_STRIPE_PAYMENT_LINK;
    if (!baseLink) {
      alert("Stripe Payment Link is not configured in environment variables.");
      return;
    }
    // Append client_reference_id for later tracking via Webhook
    const paymentUrl = `${baseLink}?client_reference_id=${user.uid}`;
    window.location.href = paymentUrl;
  };

  const refreshStats = async () => {
    if (user) {
      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setUserStats({ 
            ...defaultStats, 
            ...data,
            submissions: data.submissions || [],
            activeSpellingSessions: data.activeSpellingSessions || (data.activeSpellingSession ? [data.activeSpellingSession] : [])
          } as UserStats);
        }
      } catch (e) {
        handleFirestoreError(e, OperationType.GET, 'users');
      }
    }
  };

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data.stripePaymentLink) setStripeLink(data.stripePaymentLink);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost')) {
        return;
      }
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        refreshStats();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [user]);

  useEffect(() => {
    if (isDevBypass) {
      if (devLoggedIn) {
        const saved = loadDevStats();
        if (saved) {
          setUserStats({ ...defaultStats, ...saved });
          setView(saved.profile ? AppView.DASHBOARD : AppView.SIGNUP);
        }
        setIsDataLoaded(true);
      } else {
        setUserStats(defaultStats);
        setView(AppView.SIGNUP);
        setIsDataLoaded(false);
      }
      return;
    }

    if (user) {
      if (!isDataLoaded) {
        getDoc(doc(db, 'users', user.uid))
          .then(snap => {
            if (snap.exists()) {
              const data = snap.data();
              setUserStats({ 
                ...defaultStats, 
                ...data,
                submissions: data.submissions || [],
                activeSpellingSessions: data.activeSpellingSessions || (data.activeSpellingSession ? [data.activeSpellingSession] : [])
              } as UserStats);
              setView(AppView.DASHBOARD);
            }
            setIsDataLoaded(true);
          })
          .catch(e => handleFirestoreError(e, OperationType.GET, 'users'));
      }
    } else {
      setUserStats(defaultStats);
      setView(AppView.SIGNUP);
      setIsDataLoaded(false);
    }
  }, [user, isDevBypass, devLoggedIn]);

  useEffect(() => {
    if (isDevBypass) {
      if (devLoggedIn && isDataLoaded && userStats.profile) {
        saveDevStats(userStats);
      }
      return;
    }

    if (user && isDataLoaded && userStats.profile) {
      setDoc(doc(db, 'users', user.uid), userStats)
        .catch(e => handleFirestoreError(e, OperationType.WRITE, 'users'));
    }
  }, [userStats, user, isDataLoaded]);

  const generatePrizeCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if ((i + 1) % 4 === 0 && i !== 11) code += '-';
    }
    return code;
  };

  const recordSubmission = (name: string, type: HistoryItem['type'], xp: number) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      type,
      completedAt: Date.now(),
      xpEarned: xp
    };
    setUserStats(prev => ({
      ...prev,
      submissions: [newItem, ...(prev.submissions || [])]
    }));
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

    if (currentActiveSpellingSession) {
      recordSubmission(currentActiveSpellingSession.name, 'Spelling', xpToAdd);
    }
  };

  const handleSaveSpellingSession = (session: SpellingSession | null) => {
    if (!session) {
      // Session deleted or finished
      if (currentActiveSpellingSession) {
        setUserStats(prev => ({
          ...prev,
          activeSpellingSessions: prev.activeSpellingSessions.filter(s => s.id !== currentActiveSpellingSession.id)
        }));
      }
      return;
    }

    setUserStats(prev => {
      const exists = prev.activeSpellingSessions.find(s => s.id === session.id);
      if (exists) {
        return {
          ...prev,
          activeSpellingSessions: prev.activeSpellingSessions.map(s => s.id === session.id ? session : s)
        };
      } else {
        return {
          ...prev,
          activeSpellingSessions: [session, ...prev.activeSpellingSessions]
        };
      }
    });
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

    recordSubmission(`Oral Practice #${selectedOralId}`, 'Oral', xpToAdd);
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

      recordSubmission(currentTopic || "Composition Submission", 'Composition', finalXp);

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
  }

  const handleLogout = async () => {
    if (isDevBypass) {
      setDevSession(false);
      setDevLoggedIn(false);
      setUserStats(defaultStats);
      setView(AppView.SIGNUP);
      return;
    }
    await signOut(auth);
  };

  const sessionLoading = isDevBypass ? false : authLoading;

  if (sessionLoading || (user && !isDataLoaded)) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-500">Verifying session...</div>;
  }

  if (!user || view === AppView.SIGNUP || view === AppView.LOGIN) {
    return <AuthView onSuccess={(profile) => {
      if (isDevBypass && profile) {
        const stats = { ...defaultStats, profile };
        setUserStats(stats);
        saveDevStats(stats);
        setDevSession(true);
        setDevLoggedIn(true);
        setIsDataLoaded(true);
      } else if (profile) {
        setUserStats({ ...defaultStats, profile });
      }
      setView(AppView.DASHBOARD);
    }} />;
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
              onClick={() => setView(AppView.HISTORY)}
              className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${view === AppView.HISTORY ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-100'}`}
            >
              <TrendingUp size={18} />
              <span className="hidden sm:inline">Learning History</span>
            </button>
            {!userStats.isSubscribed && (
              <button 
                onClick={handleUpgrade}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-sm active:scale-95"
              >
                <Zap size={18} fill="currentColor" />
                <span>UPGRADE</span>
              </button>
            )}
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
            onStartSpelling={() => {
              if (userStats.activeSpellingSessions.length > 0) {
                setView(AppView.SESSION_SELECT);
              } else {
                setCurrentActiveSpellingSession(null);
                setView(AppView.SPELLING);
              }
            }} 
            onContinueSpelling={() => {}}
            onShowHistory={() => setView(AppView.HISTORY)}
            onStartOral={() => setView(AppView.ORAL_SELECTION)}
            uid={user.uid}
            onRefreshStats={refreshStats}
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
            activeSession={currentActiveSpellingSession}
            onSaveSession={handleSaveSpellingSession}
          />
        )}

        {view === AppView.SESSION_SELECT && (
          <SessionSelectView 
            sessions={userStats.activeSpellingSessions}
            onSelect={(s) => {
              setCurrentActiveSpellingSession(s);
              setView(AppView.SPELLING);
            }}
            onStartNew={() => {
              setCurrentActiveSpellingSession(null);
              setView(AppView.SPELLING);
            }}
            onBack={() => setView(AppView.DASHBOARD)}
            onDelete={(id) => {
              setUserStats(prev => ({
                ...prev,
                activeSpellingSessions: prev.activeSpellingSessions.filter(s => s.id !== id)
              }));
            }}
          />
        )}

        {view === AppView.HISTORY && (
          <HistoryView 
            items={userStats.submissions || []} 
            onBack={() => setView(AppView.DASHBOARD)} 
          />
        )}

        {view === AppView.ORAL_SELECTION && (
          <OralSelection 
            onSelect={(id, type) => {
              setSelectedOralId(id);
              setCustomYoutubeUrl('');
              setView(AppView.ORAL_PRACTICE);
            }}
            onStartCustom={(url, type) => {
              setCustomYoutubeUrl(url);
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
            youtubeUrl={customYoutubeUrl}
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
