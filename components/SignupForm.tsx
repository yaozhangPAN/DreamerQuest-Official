
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { GraduationCap, User, Mail, School, Sparkles, ArrowRight, Lock, Eye, EyeOff } from 'lucide-react';

interface SignupFormProps {
  onSignup: (profile: UserProfile) => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ onSignup }) => {
  const [formData, setFormData] = useState<UserProfile>({
    name: '',
    school: '',
    level: '',
    parentEmail: '',
    password: ''
  });

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.school || !formData.level || !formData.parentEmail || !formData.password) {
      setError('Please fill in all the fields!');
      return;
    }
    if (!formData.parentEmail.includes('@')) {
      setError('Please enter a valid parent email!');
      return;
    }

    // Check account limit per email
    const registeredChildrenKey = 'dreamerquest_registered_children';
    const registeredData = localStorage.getItem(registeredChildrenKey);
    const registeredMap: Record<string, string[]> = registeredData ? JSON.parse(registeredData) : {};
    
    const parentEmail = formData.parentEmail.toLowerCase().trim();
    const childName = formData.name.trim();
    const childrenForEmail = registeredMap[parentEmail] || [];

    // If child is not already registered under this email
    if (!childrenForEmail.includes(childName)) {
      if (childrenForEmail.length >= 5) {
        setError('This parent email has already created the maximum of 5 child accounts.');
        return;
      }
      // Register new child
      childrenForEmail.push(childName);
      registeredMap[parentEmail] = childrenForEmail;
      localStorage.setItem(registeredChildrenKey, JSON.stringify(registeredMap));
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters!');
      return;
    }
    onSignup(formData);
  };

  const levels = ['Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 5', 'Primary 6', 'Secondary 1', 'Secondary 2', 'Secondary 3', 'Secondary 4'];

  return (
    <div className="max-w-md mx-auto py-12 px-4 animate-in fade-in slide-in-from-bottom-8 duration-700">
      <div className="text-center mb-10 space-y-4">
        <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-indigo-200 text-white transform hover:rotate-6 transition-transform">
          <GraduationCap size={40} />
        </div>
        <div className="space-y-2">
          <h2 className="text-4xl font-black text-slate-800 tracking-tight">Welcome Hero!</h2>
          <p className="text-slate-500 font-medium">Create your DreamerQuest profile to start your journey.</p>
        </div>
      </div>

      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-100/50">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1 flex items-center gap-2">
              <User size={12} className="text-indigo-500" />
              Student's Name
            </label>
            <input 
              type="text" 
              placeholder="Enter your full name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1 flex items-center gap-2">
              <School size={12} className="text-emerald-500" />
              School
            </label>
            <input 
              type="text" 
              placeholder="Which school do you attend?"
              value={formData.school}
              onChange={(e) => setFormData({ ...formData, school: e.target.value })}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Sparkles size={12} className="text-amber-500" />
              Grade
            </label>
            <select 
              value={formData.level}
              onChange={(e) => setFormData({ ...formData, level: e.target.value })}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-amber-500 font-medium text-slate-800 transition-all appearance-none cursor-pointer text-sm"
            >
              <option value="">Select your grade</option>
              {levels.map(l => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Mail size={12} className="text-rose-500" />
              Parent's Email
            </label>
            <input 
              type="email" 
              placeholder="parent@example.com"
              value={formData.parentEmail}
              onChange={(e) => setFormData({ ...formData, parentEmail: e.target.value })}
              className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-500 font-medium text-slate-800 transition-all text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-700 uppercase tracking-widest ml-1 flex items-center gap-2">
              <Lock size={12} className="text-violet-500" />
              Choose Password
            </label>
            <div className="relative">
              <input 
                type={showPassword ? "text" : "password"} 
                placeholder="At least 6 characters"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-5 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500 font-medium text-slate-800 transition-all text-sm pr-12"
              />
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-rose-50 text-rose-600 px-4 py-3 rounded-xl text-sm font-bold flex items-center gap-2 border border-rose-100 animate-in shake-in duration-300">
              <Sparkles size={14} />
              {error}
            </div>
          )}

          <button 
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 mt-2 rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-[0.98]"
          >
            START ADVENTURE
            <ArrowRight size={20} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default SignupForm;
