import React, { useState, useEffect } from 'react';
import { UserProfile, UserStats } from '../types';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { logFirestoreError, OperationType } from '../lib/firebaseUtils';
import { toClientFirestorePayload } from '../lib/userStatsSync';
import { isDevAuthBypassEnabled } from '../lib/devAuth';
import { validateAdminCredentials } from '../lib/adminAuth';
import { GraduationCap, ArrowRight, Sparkles, User as UserIcon, Building2, BookOpen, Mail, Shield } from 'lucide-react';

interface AuthViewProps {
  onSuccess: (profile?: UserProfile) => void;
  onAdminLogin: () => void;
  resumeUser?: User | null;
}

const AuthView: React.FC<AuthViewProps> = ({ onSuccess, onAdminLogin, resumeUser }) => {
  const isDevBypass = isDevAuthBypassEnabled();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showAdminLogin, setShowAdminLogin] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [showDevProfile, setShowDevProfile] = useState(isDevBypass);
  const [formData, setFormData] = useState({
    name: '',
    school: '',
    level: 'Primary 1',
    parentEmail: ''
  });

  useEffect(() => {
    if (resumeUser && !isDevBypass) {
      setPendingUser(resumeUser);
      setFormData(prev => ({
        ...prev,
        // Do not use Google displayName — parents often sign in; student name must be entered deliberately.
        name: '',
        parentEmail: resumeUser.email || '',
      }));
    }
  }, [resumeUser, isDevBypass]);

  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validateAdminCredentials(adminUsername.trim(), adminPassword)) {
      setError('Invalid admin username or password.');
      return;
    }
    onAdminLogin();
  };

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);

      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const docSnap = await getDoc(userDocRef);

      if (!docSnap.exists()) {
        setPendingUser(userCredential.user);
        setFormData(prev => ({
          ...prev,
          name: '',
          parentEmail: userCredential.user.email || ''
        }));
      } else {
        const data = docSnap.data() as Partial<UserStats>;
        const studentName = data.profile?.name?.trim();
        if (!studentName) {
          setPendingUser(userCredential.user);
          setFormData(prev => ({
            ...prev,
            name: '',
            school: data.profile?.school || '',
            level: data.profile?.level || prev.level,
            parentEmail: userCredential.user.email || data.profile?.parentEmail || '',
          }));
        } else {
          onSuccess();
        }
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign in was cancelled.');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError('This browser domain is not authorized for Google Sign-In. Open http://localhost:3000 in Chrome, or run with Firebase Emulator enabled.');
      } else {
        setError(err.message || 'Login failed. Note: Please try opening the app in a new tab if you encounter network issues.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    const studentName = formData.name.trim();
    if (!studentName) {
      setError('Please enter the student\'s real name so we can track progress.');
      setIsLoading(false);
      return;
    }

    const school = formData.school.trim();
    if (!school) {
      setError('Please enter the school name.');
      setIsLoading(false);
      return;
    }

    const googleEmail = pendingUser?.email || formData.parentEmail.trim();
    const newProfile: UserProfile = {
      name: studentName,
      school,
      level: formData.level,
      parentEmail: googleEmail,
    };

    if (isDevBypass && showDevProfile) {
      onSuccess(newProfile);
      setIsLoading(false);
      return;
    }

    if (!pendingUser) return;

    try {
      const userDocRef = doc(db, 'users', pendingUser.uid);
      const existing = await getDoc(userDocRef);

      if (existing.exists()) {
        // Completing a missing student name — keep XP / progress intact.
        await setDoc(
          userDocRef,
          { profile: newProfile },
          { merge: true },
        ).catch(e => logFirestoreError(e, OperationType.WRITE, 'users'));
      } else {
        const newStats: UserStats = {
          profile: newProfile,
          totalXp: 0,
          level: 1,
          prizesWon: [],
          submissionHistory: [],
          submissions: [],
          lastScore: 0,
          bonusCharges: 0,
          activeSpellingSessions: [],
          isSubscribed: false,
        };

        await setDoc(userDocRef, toClientFirestorePayload(newStats), { merge: true })
          .catch(e => logFirestoreError(e, OperationType.WRITE, 'users'));
      }
      onSuccess(newProfile);
    } catch (err: any) {
      setError(err.message || 'Failed to save profile.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="text-center mb-10 space-y-4">
        <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200 text-white transform hover:rotate-6 transition-transform">
          <GraduationCap size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">DreamerQuest</h2>
          <p className="text-slate-500 font-medium">Log in to start your adventure!</p>
          {isDevBypass && (
            <p className="text-xs font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-full inline-block">
              Local dev mode — no Google sign-in required
            </p>
          )}
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100/50">
        {error && (
          <div className="mb-6 bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm font-bold flex flex-col gap-2 border border-rose-100 animate-in shake-in duration-300">
            <div className="flex items-center gap-2">
              <Sparkles size={14} />
              {error}
            </div>
          </div>
        )}

        {showAdminLogin ? (
          <form onSubmit={handleAdminSubmit} className="space-y-4 animate-in fade-in duration-300">
            <div className="text-center mb-2">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-600">
                <Shield size={22} />
              </div>
              <h3 className="text-xl font-bold text-slate-800">Admin Access</h3>
              <p className="text-sm text-slate-500">QA testing account only</p>
            </div>
            <input
              type="text"
              autoComplete="username"
              placeholder="Admin username"
              required
              value={adminUsername}
              onChange={(e) => setAdminUsername(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <input
              type="password"
              autoComplete="current-password"
              placeholder="Admin password"
              required
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500"
            />
            <button
              type="submit"
              className="w-full rounded-2xl bg-rose-600 py-4 text-lg font-black text-white hover:bg-rose-700"
            >
              ENTER ADMIN MODE
            </button>
            <button
              type="button"
              onClick={() => {
                setShowAdminLogin(false);
                setError('');
              }}
              className="w-full py-2 text-sm font-bold text-slate-400 hover:text-slate-600"
            >
              Back to normal login
            </button>
          </form>
        ) : !pendingUser && !showDevProfile ? (
          <div className="space-y-4">
            <button
              onClick={handleGoogleLogin}
              disabled={isLoading}
              className="w-full bg-white border-2 border-slate-200 hover:border-indigo-600 hover:bg-slate-50 text-slate-800 py-4 mt-2 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-[0.98]"
            >
              {isLoading ? 'CONNECTING...' : 'CONTINUE WITH GOOGLE'}
              {!isLoading && <ArrowRight size={20} />}
            </button>
            <button
              type="button"
              onClick={() => setShowAdminLogin(true)}
              className="w-full py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-rose-500"
            >
              Admin
            </button>
          </div>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">
                {showDevProfile && !pendingUser ? 'Create New Account' : 'Student Profile'}
              </h3>
              <p className="text-slate-500 text-sm">
                {showDevProfile && !pendingUser
                  ? 'This creates a fresh account so article quizzes start with a clean attempt history.'
                  : 'Enter the student\'s name so teachers can track learning progress.'}
              </p>
            </div>

            <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <UserIcon size={20} />
                </div>
                <input
                  type="text"
                  placeholder="Student name (姓名)"
                  required
                  minLength={1}
                  autoComplete="name"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 font-medium placeholder:text-slate-400 transition-all"
                />
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Building2 size={20} />
                </div>
                <input
                  type="text"
                  placeholder="Your School"
                  required
                  value={formData.school}
                  onChange={e => setFormData({ ...formData, school: e.target.value })}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 font-medium placeholder:text-slate-400 transition-all"
                />
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <BookOpen size={20} />
                </div>
                <select
                  required
                  value={formData.level}
                  onChange={e => setFormData({ ...formData, level: e.target.value })}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 font-medium transition-all appearance-none"
                >
                  <option value="" disabled className="text-slate-400">Select your level</option>
                  {['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'Secondary 1', 'Secondary 2', 'Secondary 3', 'Secondary 4'].map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>

              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <Mail size={20} />
                </div>
                <input
                  type="email"
                  placeholder="Parent's Email Address"
                  required
                  readOnly={!!pendingUser && !isDevBypass}
                  value={formData.parentEmail}
                  onChange={e => setFormData({ ...formData, parentEmail: e.target.value })}
                  className={`w-full pl-12 pr-4 py-4 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium placeholder:text-slate-400 transition-all ${pendingUser && !isDevBypass ? 'bg-slate-100 cursor-not-allowed' : 'bg-slate-50 focus:bg-white'}`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 mt-6 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-[0.98] shadow-xl shadow-indigo-100"
            >
              {isLoading ? 'SAVING...' : 'START ADVENTURE'}
            </button>
            <button
              type="button"
              onClick={() => setShowAdminLogin(true)}
              className="w-full py-2 text-xs font-bold uppercase tracking-widest text-slate-300 hover:text-rose-500"
            >
              Admin
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthView;
