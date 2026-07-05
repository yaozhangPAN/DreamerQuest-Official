import React from 'react';
import { HistoryItem } from '../types';
import { ChevronLeft, Calendar, Trophy, Send, Mic, PlayCircle, BookOpen, Zap } from 'lucide-react';

interface HistoryViewProps {
  items: HistoryItem[];
  onBack: () => void;
}

const HistoryView: React.FC<HistoryViewProps> = ({ items, onBack }) => {
  const sortedItems = [...items].sort((a, b) => b.completedAt - a.completedAt);

  const getTypeIcon = (type: HistoryItem['type']) => {
    switch (type) {
      case 'Composition': return <Send size={20} />;
      case 'Spelling': return <Mic size={20} />;
      case 'Oral': return <PlayCircle size={20} />;
      default: return <BookOpen size={20} />;
    }
  };

  const getTypeColor = (type: HistoryItem['type']) => {
    switch (type) {
      case 'Composition': return 'bg-indigo-100 text-indigo-600';
      case 'Spelling': return 'bg-emerald-100 text-emerald-600';
      case 'Oral': return 'bg-amber-100 text-amber-600';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

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
            <h2 className="text-3xl font-black text-slate-800">Learning History</h2>
            <p className="text-slate-500 font-medium">Keep tracking your progress!</p>
          </div>
        </div>
        <div className="bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-xl shadow-indigo-100 flex items-center gap-3">
          <Trophy size={20} className="text-amber-400" />
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Total Submissions</p>
            <p className="text-2xl font-black leading-none">{items.length}</p>
          </div>
        </div>
      </div>

      {sortedItems.length === 0 ? (
        <div className="bg-white p-20 rounded-[3rem] border border-slate-200 border-dashed text-center space-y-4">
          <div className="bg-slate-50 w-24 h-24 rounded-full flex items-center justify-center mx-auto text-slate-200">
            <BookOpen size={48} />
          </div>
          <div className="space-y-2">
            <p className="text-slate-800 font-black text-xl">Your journey starts here!</p>
            <p className="text-slate-500 font-medium max-w-sm mx-auto">Complete a practice session to see your hard work recorded here.</p>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Activity</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Type</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest">Completed</th>
                  <th className="px-8 py-5 text-xs font-black text-slate-400 uppercase tracking-widest text-right">XP Earned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sortedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl ${getTypeColor(item.type)} transition-transform group-hover:scale-110 shadow-sm`}>
                          {getTypeIcon(item.type)}
                        </div>
                        <span className="font-black text-slate-700 text-lg truncate max-w-[200px]">{item.name}</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider ${getTypeColor(item.type)}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col">
                        <div className="flex items-center gap-2 text-slate-700 font-bold">
                          <Calendar size={14} className="text-slate-300" />
                          {new Date(item.completedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                        <span className="text-[10px] text-slate-400 font-black uppercase mt-1 ml-6">
                          {new Date(item.completedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl font-black text-lg border border-emerald-100">
                        <Zap size={16} fill="currentColor" />
                        +{item.xpEarned}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default HistoryView;
