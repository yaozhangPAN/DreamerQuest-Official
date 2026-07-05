import React, { useState } from 'react';
import { UserProfile } from '../types';
import { auth, db } from '../lib/firebase';
import { GoogleAuthProvider, signInWithPopup, User } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firebaseUtils';
import { GraduationCap, ArrowRight, Sparkles, User as UserIcon, Building2, BookOpen, Mail } from 'lucide-react';

interface AuthViewProps {
  onSuccess: (profile?: UserProfile) => void;
}

const AuthView: React.FC<AuthViewProps> = ({ onSuccess }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  // States for profile completion
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    school: '',
    level: 'Primary 1',
    parentEmail: ''
  });

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    setError('');
    try {
      const provider = new GoogleAuthProvider();
      const userCredential = await signInWithPopup(auth, provider);
      
      // Check if user exists
      const userDocRef = doc(db, 'users', userCredential.user.uid);
      const docSnap = await getDoc(userDocRef);
      
      if (!docSnap.exists()) {
        // User does not exist, require profile completion
        setPendingUser(userCredential.user);
        setFormData(prev => ({
          ...prev,
          name: userCredential.user.displayName || '',
          parentEmail: userCredential.user.email || ''
        }));
      } else {
        onSuccess(); // Existing user will be loaded in App.tsx
      }
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign in was cancelled.');
      } else {
        setError(err.message || 'Login failed. Note: Please try opening the app in a new tab if you encounter network issues.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingUser) return;
    
    setIsLoading(true);
    setError('');
    
    try {
      const userDocRef = doc(db, 'users', pendingUser.uid);
      
      const newProfile: UserProfile = {
        name: formData.name || 'Hero',
        school: formData.school || 'My School',
        level: formData.level,
        parentEmail: formData.parentEmail,
      };
      
      const newStats = {
        profile: newProfile,
        totalXp: 0,
        level: 1,
        prizesWon: [],
        submissionHistory: [],
        lastScore: 0,
        bonusCharges: 0,
        activeSpellingSession: null,
        isSubscribed: false
      };
      
      await setDoc(userDocRef, newStats).catch(e => handleFirestoreError(e, OperationType.WRITE, 'users'));
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
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100/50">
        {error && (
          <div className="mb-6 bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm font-bold flex flex-col gap-2 border border-rose-100 animate-in shake-in duration-300">
            <div className="flex items-center gap-2">
              <Sparkles size={14} />
              {error}
            </div>
            {!pendingUser && (
              <p className="font-normal text-xs mt-1">If you get a network error, please click the "Open in new tab" button at the top right of the preview window to sign in.</p>
            )}
          </div>
        )}

        {!pendingUser ? (
          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full bg-white border-2 border-slate-200 hover:border-indigo-600 hover:bg-slate-50 text-slate-800 py-4 mt-2 rounded-2xl font-black text-lg transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-[0.98]"
          >
            {isLoading ? 'CONNECTING...' : 'CONTINUE WITH GOOGLE'}
            {!isLoading && <ArrowRight size={20} />}
          </button>
        ) : (
          <form onSubmit={handleProfileSubmit} className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="text-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Complete Your Profile</h3>
              <p className="text-slate-500 text-sm">Tell us a bit more about yourself to get started.</p>
            </div>
            
            <div className="space-y-4">
              <div className="relative">
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
                  <UserIcon size={20} />
                </div>
                <input
                  type="text"
                  placeholder="Your Name (e.g. Alex)"
                  required
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
                  value={formData.parentEmail}
                  onChange={e => setFormData({ ...formData, parentEmail: e.target.value })}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-slate-800 font-medium placeholder:text-slate-400 transition-all"
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
          </form>
        )}
      </div>
    </div>
  );
};

export default AuthView;
