import React from 'react';
import { SpellingSession } from '../types';
import { PlayCircle, Trash2, Calendar, ChevronLeft, Mic } from 'lucide-react';

interface SessionSelectViewProps {
  sessions: SpellingSession[];
  onSelect: (session: SpellingSession) => void;
  onBack: () => void;
  onDelete: (id: string) => void;
  onStartNew: () => void;
}

const SessionSelectView: React.FC<SessionSelectViewProps> = ({ sessions, onSelect, onBack, onDelete, onStartNew }) => {
  const incompleteSessions = sessions.filter(s => !s.isCompleted);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack}
            className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm active:scale-95"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h2 className="text-3xl font-black text-slate-800">Spelling Practice</h2>
            <p className="text-slate-500 font-medium">Continue active tasks or start new</p>
          </div>
        </div>
        
        {incompleteSessions.length > 0 && (
          <button 
            onClick={onStartNew}
            className="bg-emerald-600 text-white font-black px-6 py-3 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100 flex items-center gap-2"
          >
            <Mic size={20} />
            NEW LIST
          </button>
        )}
      </div>

      {incompleteSessions.length === 0 ? (
        <div className="bg-white p-12 rounded-[2.5rem] border border-slate-200 border-dashed text-center space-y-4">
          <div className="bg-slate-50 w-20 h-20 rounded-full flex items-center justify-center mx-auto text-slate-300">
            <Mic size={40} />
          </div>
          <p className="text-slate-500 font-bold text-lg">No active spelling lists found.</p>
          <button 
            onClick={onStartNew}
            className="bg-emerald-600 text-white font-black px-8 py-3 rounded-2xl hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-100"
          >
            START NEW PRACTICE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Option to start new also as a card if liked, but we have it in header */}
          {incompleteSessions.map((session, index) => (
            <div 
              key={session.id || `session-${index}`}
              className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-all group flex flex-col justify-between"
            >
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="bg-amber-100 p-3 rounded-2xl text-amber-600">
                    <Mic size={24} />
                  </div>
                  <button 
                    onClick={() => {
                        if (confirm("Delete this session?")) {
                            onDelete(session.id);
                        }
                    }}
                    className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                <div>
                  <h3 className="text-xl font-black text-slate-800 truncate">{session.name}</h3>
                  <div className="flex items-center gap-2 text-slate-400 text-xs mt-1 font-bold">
                    <Calendar size={14} />
                    {new Date(session.createdAt).toLocaleDateString()}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex justify-between text-xs font-black uppercase tracking-wider text-slate-500">
                    <span>Progress</span>
                    <span>{session.currentSessionIndex} / {session.sessions.length} Sessions</span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden p-0.5">
                    <div 
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${(session.currentSessionIndex / session.sessions.length) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={() => onSelect(session)}
                className="mt-8 w-full bg-slate-900 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 hover:bg-indigo-600 transition-colors shadow-lg active:scale-95"
              >
                <PlayCircle size={20} />
                CONTINUE NOW
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default SessionSelectView;
