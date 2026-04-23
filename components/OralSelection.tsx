
import React from 'react';
import { PlayCircle, ArrowLeft, Star, Clock, Video } from 'lucide-react';

interface OralSelectionProps {
  onSelect: (id: number) => void;
  onBack: () => void;
}

const PRACTICES = [
  { id: 1, title: "Oral Practice 1: Selfies & Social Media", description: "你对自拍并上传到社交媒体有何看法？" },
  { id: 2, title: "Oral Practice 2: AI in Food Courts", description: "人工智能帮你在食阁找位子，你有什么感受？" },
  { id: 3, title: "Oral Practice 3: Hungry Ghost Festival", description: "环保创新福物吸引年轻人参与中元节活动" },
  { id: 4, title: "Oral Practice 4: E-waste Recycling", description: "你是如何处理旧电子设备的？" },
  { id: 5, title: "Oral Practice 5: Flooding & Climate Change", description: "预防洪灾是每个人的责任。你同意吗？" },
  { id: 6, title: "Oral Practice 6: Food Rescue App", description: "我们可以如何减少食物浪费？" },
];

const OralSelection: React.FC<OralSelectionProps> = ({ onSelect, onBack }) => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-slate-800 font-bold transition-colors"
        >
          <ArrowLeft size={20} /> BACK TO DASHBOARD
        </button>
        <div className="bg-amber-100 px-4 py-1.5 rounded-full text-amber-700 font-black text-sm flex items-center gap-2">
          <PlayCircle size={16} />
          ORAL PRACTICE SELECTION
        </div>
      </div>

      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Choose a Practice Set</h2>
        <p className="text-slate-500 font-medium">Select one of the topics below to start your oral examination practice.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {PRACTICES.map((practice) => (
          <button
            key={practice.id}
            onClick={() => onSelect(practice.id)}
            className="group bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-500 transition-all text-left flex flex-col justify-between transform hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <Video size={24} />
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Clock size={12} /> 15-20 MINS
                </div>
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-800 group-hover:text-indigo-600 transition-colors">
                  {practice.title}
                </h3>
                <p className="text-slate-500 text-sm font-medium mt-1 line-clamp-2">
                  {practice.description}
                </p>
              </div>
            </div>
            
            <div className="mt-6 flex items-center justify-between">
              <div className="flex items-center gap-1">
                {[1, 2, 3].map((s) => (
                  <Star key={s} size={14} className="text-amber-400 fill-current" />
                ))}
              </div>
              <div className="bg-slate-50 px-4 py-2 rounded-xl text-xs font-black text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-700 transition-colors">
                START PRACTICE
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default OralSelection;
