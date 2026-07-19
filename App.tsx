import React, { useState, useEffect, useMemo } from 'react';
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
import { logFirestoreError, OperationType } from './lib/firebaseUtils';
import { mergeUserStatsFromFirestore, toClientFirestorePayload } from './lib/userStatsSync';
import { isValidEssayEvaluation } from './lib/validateEvaluation';
import {
  calculateCompositionXp,
  calculateOralXp,
  calculateSpellingXp,
} from './lib/xpSystem';
import XpGainPopup from './components/XpGainPopup';
import AdminTestPanel, { AdminInstantPayload } from './components/AdminTestPanel';
import ArticleQuizAdmin from './components/ArticleQuizAdmin';
import ArticleQuizStudent from './components/ArticleQuizStudent';
import { signOut } from 'firebase/auth';
import {
  createNewDevAccount,
  getDevAccountUid,
  getDevSession,
  getDevUser,
  isDevAuthBypassEnabled,
  loadDevStats,
  saveDevStats,
  setDevSession,
} from './lib/devAuth';
import {
  adminUser,
  getAdminSession,
  loadAdminStats,
  saveAdminStats,
  setAdminSession,
} from './lib/adminAuth';

const XP_PER_LEVEL = 1000;
const isDevBypass = isDevAuthBypassEnabled();

const adminDefaultProfile: UserProfile = {
  name: 'Admin Tester',
  school: 'QA Lab',
  level: 'Secondary 4',
  parentEmail: 'admin@local.test',
};

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
  const [devAccountUid, setDevAccountUid] = useState<string | null>(() =>
    isDevBypass ? getDevAccountUid() : null,
  );
  const [adminLoggedIn, setAdminLoggedIn] = useState(getAdminSession());
  const isLocalSession = adminLoggedIn || isDevBypass;
  const user = useMemo(() => {
    if (adminLoggedIn) return adminUser;
    if (isDevBypass) {
      return devLoggedIn && devAccountUid ? getDevUser(devAccountUid) : null;
    }
    return firebaseUser ?? null;
  }, [adminLoggedIn, isDevBypass, devLoggedIn, devAccountUid, firebaseUser]);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [needsProfileCompletion, setNeedsProfileCompletion] = useState(false);

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
  const [xpPopupAmount, setXpPopupAmount] = useState<number | null>(null);
  const [historyReviewQuizId, setHistoryReviewQuizId] = useState<string | null>(null);

  const showXpGain = (xp: number) => {
    if (xp > 0) setXpPopupAmount(xp);
  };

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
    if (!user || isLocalSession) return;
    try {
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) {
        setUserStats(mergeUserStatsFromFirestore(snap.data(), defaultStats));
      }
    } catch (e) {
      logFirestoreError(e, OperationType.GET, 'users');
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
    if (!user || isLocalSession) return;
    refreshStats();
    const onFocus = () => refreshStats();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [user?.uid, isLocalSession]);

  // Depend on user.uid (stable), not the user object — getDevUser() returns a new
  // object every render, which would re-run this effect and force DASHBOARD forever.
  const userUid = user?.uid ?? null;

  useEffect(() => {
    if (adminLoggedIn) {
      const saved = loadAdminStats();
      if (saved?.profile) {
        setUserStats({ ...defaultStats, ...saved, profile: saved.profile });
      } else {
        setUserStats({
          ...defaultStats,
          profile: adminDefaultProfile,
          isSubscribed: true,
        });
      }
      setView(AppView.DASHBOARD);
      setIsDataLoaded(true);
      return;
    }

    if (isDevBypass) {
      if (devLoggedIn && devAccountUid) {
        const saved = loadDevStats(devAccountUid);
        if (saved) {
          setUserStats({ ...defaultStats, ...saved });
          setView(saved.profile ? AppView.DASHBOARD : AppView.SIGNUP);
        } else {
          setUserStats(defaultStats);
          setView(AppView.SIGNUP);
        }
        setIsDataLoaded(true);
      } else {
        setUserStats(defaultStats);
        setView(AppView.SIGNUP);
        setIsDataLoaded(false);
      }
      return;
    }

    if (userUid) {
      if (!isDataLoaded) {
        setSessionError(null);
        getDoc(doc(db, 'users', userUid))
          .then(snap => {
            if (snap.exists()) {
              const merged = mergeUserStatsFromFirestore(snap.data(), defaultStats);
              setUserStats(merged);
              const studentName = merged.profile?.name?.trim();
              if (!studentName) {
                setNeedsProfileCompletion(true);
                setView(AppView.SIGNUP);
              } else {
                setNeedsProfileCompletion(false);
                setView(AppView.DASHBOARD);
              }
            } else {
              setNeedsProfileCompletion(true);
              setView(AppView.SIGNUP);
            }
            setIsDataLoaded(true);
          })
          .catch(e => {
            logFirestoreError(e, OperationType.GET, 'users');
            setSessionError('Could not load your profile. Check your connection and try again.');
            setIsDataLoaded(true);
          });
      }
    } else {
      setUserStats(defaultStats);
      setView(AppView.SIGNUP);
      setIsDataLoaded(false);
      setSessionError(null);
      setNeedsProfileCompletion(false);
    }
    // isDataLoaded is intentionally read inside the Firebase branch only
  }, [userUid, isDevBypass, devLoggedIn, adminLoggedIn, devAccountUid]);

  useEffect(() => {
    if (adminLoggedIn && isDataLoaded && userStats.profile) {
      saveAdminStats(userStats);
      return;
    }

    if (isDevBypass) {
      if (devLoggedIn && devAccountUid && isDataLoaded && userStats.profile) {
        saveDevStats(userStats, devAccountUid);
      }
      return;
    }

    if (user && isDataLoaded && userStats.profile) {
      setDoc(doc(db, 'users', user.uid), toClientFirestorePayload(userStats), { merge: true })
        .catch(e => logFirestoreError(e, OperationType.WRITE, 'users'));
    }
  }, [userStats, user, isDataLoaded, isDevBypass, adminLoggedIn, devLoggedIn, devAccountUid]);

  const generatePrizeCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 12; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
      if ((i + 1) % 4 === 0 && i !== 11) code += '-';
    }
    return code;
  };

  const recordSubmission = (
    name: string,
    type: HistoryItem['type'],
    xp: number,
    extras?: Partial<Pick<HistoryItem, 'quizId' | 'score' | 'maxScore' | 'detail'>>,
  ) => {
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      name,
      type,
      completedAt: Date.now(),
      xpEarned: xp,
      ...extras,
    };
    setUserStats(prev => ({
      ...prev,
      submissions: [newItem, ...(prev.submissions || [])]
    }));
  };

  const handleSpellingXp = (
    correctCount: number,
    detail?: {
      correctWords: string[];
      incorrectWords: Array<{ original: string; student: string }>;
      feedback: string;
    },
  ) => {
    const xpToAdd = calculateSpellingXp(correctCount);
    setUserStats(prev => {
      const newTotalXp = prev.totalXp + xpToAdd;
      return {
        ...prev,
        totalXp: newTotalXp,
        level: Math.floor(newTotalXp / XP_PER_LEVEL) + 1,
      };
    });

    if (currentActiveSpellingSession) {
      recordSubmission(currentActiveSpellingSession.name, 'Spelling', xpToAdd, {
        score: correctCount,
        detail: detail
          ? {
              kind: 'spelling',
              correctWords: detail.correctWords,
              incorrectWords: detail.incorrectWords,
              feedback: detail.feedback,
            }
          : undefined,
      });
    }
    showXpGain(xpToAdd);
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

  const handleOralXp = (
    marks: number,
    detail?:
      | { kind: 'oral_exam'; evaluation: import('./types').OralEvaluation }
      | {
          kind: 'oral_guided';
          summary: import('./types').OralPracticeSummary;
          questions?: string[];
        },
  ) => {
    const xpToAdd = calculateOralXp(marks);
    setUserStats(prev => {
      const newTotalXp = prev.totalXp + xpToAdd;
      return {
        ...prev,
        totalXp: newTotalXp,
        level: Math.floor(newTotalXp / XP_PER_LEVEL) + 1,
      };
    });

    const historyDetail =
      detail?.kind === 'oral_exam'
        ? {
            kind: 'oral_exam' as const,
            evaluation: detail.evaluation,
            practiceId: selectedOralId,
          }
        : detail?.kind === 'oral_guided'
          ? {
              kind: 'oral_guided' as const,
              summary: detail.summary,
              practiceId: selectedOralId,
              questions: detail.questions,
            }
          : undefined;

    recordSubmission(`Oral Practice #${selectedOralId}`, 'Oral', xpToAdd, {
      score: marks,
      maxScore: detail?.kind === 'oral_exam' ? detail.evaluation.maxMarks || 40 : undefined,
      detail: historyDetail,
    });
    showXpGain(xpToAdd);
  };

  const handleArticleQuizXp = (
    xp: number,
    label = 'Article Quiz',
    meta?: { quizId?: string; score?: number; maxScore?: number },
  ) => {
    if (xp <= 0) return;
    setUserStats(prev => {
      const newTotalXp = prev.totalXp + xp;
      const oldLevel = prev.level;
      const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;
      let newPrizes = [...prev.prizesWon];
      if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
        newPrizes.push(generatePrizeCode());
      }
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: label,
        type: 'Article',
        completedAt: Date.now(),
        xpEarned: xp,
        quizId: meta?.quizId,
        score: meta?.score,
        maxScore: meta?.maxScore,
      };
      return {
        ...prev,
        totalXp: newTotalXp,
        level: newLevel,
        prizesWon: newPrizes,
        submissions: [newItem, ...(prev.submissions || [])],
      };
    });
    showXpGain(xp);
  };

  const applyXpWithHistory = (
    xpToAdd: number,
    history: { name: string; type: HistoryItem['type'] },
    extras?: Partial<UserStats> & {
      historyExtras?: Partial<Pick<HistoryItem, 'quizId' | 'score' | 'maxScore' | 'detail'>>;
    },
  ) => {
    const { historyExtras, ...userExtras } = extras || {};
    setUserStats(prev => {
      const newTotalXp = prev.totalXp + xpToAdd;
      const oldLevel = prev.level;
      const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;
      let newPrizes = [...prev.prizesWon];
      if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
        newPrizes.push(generatePrizeCode());
      }
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: history.name,
        type: history.type,
        completedAt: Date.now(),
        xpEarned: xpToAdd,
        ...historyExtras,
      };
      return {
        ...prev,
        ...userExtras,
        totalXp: newTotalXp,
        level: newLevel,
        prizesWon: newPrizes,
        submissions: [newItem, ...(prev.submissions || [])],
      };
    });
    showXpGain(xpToAdd);
  };

  const handleAdminInstantComplete = (payload: AdminInstantPayload) => {
    if (payload.type === 'Spelling') {
      const xp = calculateSpellingXp(payload.correctWords);
      applyXpWithHistory(
        xp,
        {
          name: `Admin Spelling (${payload.correctWords} correct)`,
          type: 'Spelling',
        },
        {
          historyExtras: {
            score: payload.correctWords,
            detail: {
              kind: 'spelling',
              correctWords: [],
              incorrectWords: [],
              feedback: `Admin instant complete — ${payload.correctWords} words marked correct for QA testing.`,
            },
          },
        },
      );
      return;
    }

    if (payload.type === 'Oral') {
      const xp = calculateOralXp(payload.marks);
      applyXpWithHistory(
        xp,
        {
          name: `Admin Oral (${payload.marks} marks)`,
          type: 'Oral',
        },
        {
          historyExtras: {
            score: payload.marks,
            maxScore: 40,
            detail: {
              kind: 'oral_exam',
              evaluation: {
                categories: [],
                feedback: 'Admin instant complete — simulated oral result for QA testing.',
                totalMarks: payload.marks,
                maxMarks: 40,
              },
            },
          },
        },
      );
      return;
    }

    const { xp, welcomeBoostApplied } = calculateCompositionXp(payload.scores, {
      coPilot: payload.coPilot,
      isFirstSubmission: payload.treatAsFirstSubmission,
      isDuplicate: false,
    });

    setLastEvaluation({
      scores: payload.scores,
      feedback:
        'Admin instant complete — simulated composition evaluation for QA testing.',
      totalXp: xp,
      isDuplicate: false,
      bonusApplied: false,
      welcomeBoostApplied,
    });
    setView(AppView.RESULT);

    setUserStats(prev => {
      const newTotalXp = prev.totalXp + xp;
      const oldLevel = prev.level;
      const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;
      let newPrizes = [...prev.prizesWon];
      if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
        newPrizes.push(generatePrizeCode());
      }
      const newItem: HistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Admin Composition Test',
        type: 'Composition',
        completedAt: Date.now(),
        xpEarned: xp,
        score: payload.scores.idea + payload.scores.structure + payload.scores.content + payload.scores.language + payload.scores.voice,
        maxScore: 100,
        detail: {
          kind: 'composition',
          scores: payload.scores,
          feedback:
            'Admin instant complete — simulated composition evaluation for QA testing.',
          topic: 'Admin Composition Test',
          welcomeBoostApplied,
          isDuplicate: false,
        },
      };
      return {
        ...prev,
        totalXp: newTotalXp,
        level: newLevel,
        prizesWon: newPrizes,
        lastScore: xp,
        submissionHistory: [...prev.submissionHistory, `admin_${Date.now()}`],
        submissions: [newItem, ...(prev.submissions || [])],
      };
    });
    showXpGain(xp);
  };

  const enterAdminMode = () => {
    setAdminSession(true);
    setAdminLoggedIn(true);
    setDevLoggedIn(false);
    setDevSession(false);
    setDevAccountUid(null);
    const saved = loadAdminStats();
    setUserStats(
      saved?.profile
        ? { ...defaultStats, ...saved }
        : {
            ...defaultStats,
            profile: adminDefaultProfile,
            isSubscribed: true,
          },
    );
    setIsDataLoaded(true);
    setNeedsProfileCompletion(false);
    setView(AppView.DASHBOARD);
  };

  const handleSubmission = async (imagesBase64: string[]) => {
    setIsProcessing(true);
    try {
      const contentHash = `hash_${imagesBase64.reduce((acc, curr) => acc + curr.length, 0)}`;

      const evaluation = await evaluateEssay(imagesBase64, currentTopic);
      if (!isValidEssayEvaluation(evaluation)) {
        throw new Error('Invalid evaluation response from AI service.');
      }

      setUserStats(prev => {
        const isDuplicate = prev.submissionHistory.includes(contentHash);
        const isFirstSubmission = prev.submissionHistory.length === 0;
        const { xp: finalXp, welcomeBoostApplied } = calculateCompositionXp(evaluation.scores, {
          coPilot: isCoPilotActiveForSubmission,
          isFirstSubmission,
          isDuplicate,
        });

        const newTotalXp = prev.totalXp + finalXp;
        const oldLevel = prev.level;
        const newLevel = Math.floor(newTotalXp / XP_PER_LEVEL) + 1;

        let newPrizes = [...prev.prizesWon];
        if (Math.floor(newLevel / 10) > Math.floor(oldLevel / 10)) {
          newPrizes.push(generatePrizeCode());
        }

        const newItem: HistoryItem = {
          id: Math.random().toString(36).substr(2, 9),
          name: currentTopic || 'Composition Submission',
          type: 'Composition',
          completedAt: Date.now(),
          xpEarned: finalXp,
          score:
            evaluation.scores.idea +
            evaluation.scores.structure +
            evaluation.scores.content +
            evaluation.scores.language +
            evaluation.scores.voice,
          maxScore: 100,
          detail: {
            kind: 'composition',
            scores: evaluation.scores,
            feedback: evaluation.feedback,
            topic: currentTopic || undefined,
            welcomeBoostApplied,
            isDuplicate,
          },
        };

        setLastEvaluation({
          ...evaluation,
          totalXp: finalXp,
          isDuplicate,
          bonusApplied: false,
          welcomeBoostApplied,
        });
        setView(AppView.RESULT);
        setCurrentTopic('');
        setIsCoPilotActiveForSubmission(false);
        showXpGain(finalXp);

        return {
          ...prev,
          totalXp: newTotalXp,
          level: newLevel,
          prizesWon: newPrizes,
          submissionHistory: isDuplicate ? prev.submissionHistory : [...prev.submissionHistory, contentHash],
          lastScore: isDuplicate ? prev.lastScore : finalXp,
          submissions: [newItem, ...(prev.submissions || [])],
        };
      });
    } catch (error) {
      alert("Error processing your homework. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleLogout = async () => {
    if (adminLoggedIn) {
      setAdminSession(false);
      setAdminLoggedIn(false);
      setUserStats(defaultStats);
      setView(AppView.SIGNUP);
      setIsDataLoaded(false);
      return;
    }
    if (isDevBypass) {
      setDevSession(false);
      setDevLoggedIn(false);
      setDevAccountUid(null);
      setUserStats(defaultStats);
      setView(AppView.SIGNUP);
      setIsDataLoaded(false);
      return;
    }
    await signOut(auth);
  };

  const sessionLoading = isLocalSession ? false : authLoading;

  if (sessionLoading || (user && !isDataLoaded)) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center font-bold text-slate-500">Verifying session...</div>;
  }

  if (sessionError && user) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-rose-600 font-bold">{sessionError}</p>
        <button
          onClick={() => {
            setIsDataLoaded(false);
            setSessionError(null);
          }}
          className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold"
        >
          Retry
        </button>
        <button onClick={handleLogout} className="text-slate-500 font-semibold underline">
          Log out
        </button>
      </div>
    );
  }

  if (!user || view === AppView.SIGNUP || view === AppView.LOGIN) {
    return (
      <AuthView
        resumeUser={needsProfileCompletion && firebaseUser ? firebaseUser : null}
        onAdminLogin={enterAdminMode}
        onSuccess={(profile) => {
          if (isDevBypass && profile) {
            // Each new local profile gets a unique uid so article quiz
            // attempts are not shared with previous accounts on this device.
            const { uid, stats } = createNewDevAccount(profile);
            setDevAccountUid(uid);
            setUserStats(stats);
            setDevLoggedIn(true);
            setAdminLoggedIn(false);
            setAdminSession(false);
            setIsDataLoaded(true);
          } else if (profile) {
            setUserStats((prev) => ({
              ...prev,
              profile,
            }));
            setNeedsProfileCompletion(false);
            setIsDataLoaded(true);
          }
          setView(AppView.DASHBOARD);
        }}
      />
    );
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
            {adminLoggedIn && (
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-rose-600">
                Admin
              </span>
            )}
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

      <main className={`flex-1 w-full mx-auto px-4 py-8 overflow-x-hidden ${
        view === AppView.ORAL_PRACTICE || view === AppView.ORAL_SELECTION
          ? 'max-w-6xl'
          : 'max-w-4xl'
      }`}>
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
            onStartArticleQuiz={() => {
              setHistoryReviewQuizId(null);
              setView(adminLoggedIn ? AppView.ARTICLE_QUIZ_ADMIN : AppView.ARTICLE_QUIZ_STUDENT);
            }}
            isAdmin={adminLoggedIn}
          />
        )}

        {view === AppView.ARTICLE_QUIZ_ADMIN && (
          <ArticleQuizAdmin
            onBack={() => setView(AppView.DASHBOARD)}
            onOpenStudentView={() => {
              setHistoryReviewQuizId(null);
              setView(AppView.ARTICLE_QUIZ_STUDENT);
            }}
          />
        )}

        {view === AppView.ARTICLE_QUIZ_STUDENT && (
          <ArticleQuizStudent
            uid={user.uid}
            studentName={userStats.profile?.name || 'Student'}
            onBack={() => {
              setHistoryReviewQuizId(null);
              setView(AppView.DASHBOARD);
            }}
            onXpEarned={handleArticleQuizXp}
            initialReviewQuizId={historyReviewQuizId}
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
            uid={user.uid}
            onBack={() => setView(AppView.DASHBOARD)}
            onReviewArticleQuiz={(quizId) => {
              setHistoryReviewQuizId(quizId);
              setView(AppView.ARTICLE_QUIZ_STUDENT);
            }}
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

      {xpPopupAmount !== null && xpPopupAmount > 0 && (
        <XpGainPopup amount={xpPopupAmount} onComplete={() => setXpPopupAmount(null)} />
      )}
      {adminLoggedIn && <AdminTestPanel onInstantComplete={handleAdminInstantComplete} />}
    </div>
  );
};

export default App;
