
import React, { useState } from 'react';
import { PlayCircle, ArrowLeft, Star, Clock, Video, BookOpen } from 'lucide-react';

export type PracticeType = 'O_LEVEL' | 'PSLE';

export interface PracticeSet {
  id: number;
  type: PracticeType;
  title: string;
  description: string;
}

interface OralSelectionProps {
  onSelect: (id: number, type: PracticeType) => void;
  onStartCustom: (url: string, type: PracticeType) => void;
  onBack: () => void;
}

const PRACTICES: PracticeSet[] = [
  { id: 1, type: 'O_LEVEL', title: "Oral Practice 1: Selfies & Social Media", description: "你对自拍并上传到社交媒体有何看法？" },
  { id: 2, type: 'O_LEVEL', title: "Oral Practice 2: AI in Food Courts", description: "人工智能帮你在食阁找位子，你有什么感受？" },
  { id: 3, type: 'O_LEVEL', title: "Oral Practice 3: Hungry Ghost Festival", description: "环保创新福物吸引年轻人参与中元节活动" },
  { id: 4, type: 'O_LEVEL', title: "Oral Practice 4: E-waste Recycling", description: "你是如何处理旧电子设备的？" },
  { id: 5, type: 'O_LEVEL', title: "Oral Practice 5: Flooding & Climate Change", description: "预防洪灾是每个人的责任。你同意吗？" },
  { id: 6, type: 'O_LEVEL', title: "Oral Practice 6: Food Rescue App", description: "我们可以如何减少食物浪费？" },
  { id: 101, type: 'PSLE', title: "PSLE Test 1: Helper in Canteen", description: "食堂里学生主动帮助清洁工阿姨的故事" },
  { id: 102, type: 'PSLE', title: "PSLE Test 2: Saving Resources", description: "在日常生活中，我们应该如何节省资源，保护环境？" },
  { id: 103, type: 'PSLE', title: "PSLE Test 3: Caring for Others", description: "我们应该如何关爱身边的弱势群体？" },
  { id: 104, type: 'PSLE', title: "PSLE Test 4: Exercise", description: "多做运动对身体和心理有哪些好处？" },
  { id: 105, type: 'PSLE', title: "PSLE Test 5: Good Neighbors", description: "邻里之间和睦相处有什么重要性？" },
  { id: 106, type: 'PSLE', title: "PSLE Test 6: Zero Waste", description: "为什么要提倡“零浪费”的生活方式？" },
  { id: 107, type: 'PSLE', title: "PSLE Test 7: Environment", description: "我们该如何从小事做起，保护我们的环境？" },
  { id: 108, type: 'PSLE', title: "PSLE Test 8: Friendship", description: "同学之间互助友爱对学习和生活有什么帮助？" },
  { id: 109, type: 'PSLE', title: "PSLE Test 9: Honesty", description: "为什么做人要诚实守信？" },
  { id: 110, type: 'PSLE', title: "PSLE Test 10: Safety", description: "在公共场所，我们该注意哪些安全事项？" },
  { id: 111, type: 'PSLE', title: "PSLE Test 11: Respect Elders", description: "敬老爱幼是中华传统文化，你对此有何看法？" },
  { id: 112, type: 'PSLE', title: "PSLE Test 12: Road Safety", description: "我们如何才能确保公路安全？" },
  { id: 113, type: 'PSLE', title: "PSLE Test 13: Neighborly Relations", description: "良好的邻里关系对建设和谐社会有何作用？" },
  { id: 114, type: 'PSLE', title: "PSLE Test 14: Outdoor Learning", description: "户外学习活动对扩展视野有什么好处？" },
  { id: 115, type: 'PSLE', title: "PSLE Test 15: Saving Water", description: "节约用水的重要性体现在哪里？" },
  { id: 116, type: 'PSLE', title: "PSLE Test 16: More Road Safety", description: "行人应该如何遵守马路规则以确保安全？" },
];

const OralSelection: React.FC<OralSelectionProps> = ({ onSelect, onStartCustom, onBack }) => {
  const [activeTab, setActiveTab] = useState<PracticeType>('O_LEVEL');
  const [youtubeUrl, setYoutubeUrl] = useState('');

  const filteredPractices = PRACTICES.filter(p => p.type === activeTab);

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

      <div className="text-center space-y-4">
        <h2 className="text-3xl font-black text-slate-800 tracking-tight">Choose a Practice Set</h2>
        <p className="text-slate-500 font-medium">Select your level and choose a topic to start your oral examination practice.</p>
        
        <div className="flex justify-center gap-4 mt-6">
          <button 
            onClick={() => setActiveTab('O_LEVEL')}
            className={`px-8 py-3 rounded-full font-black text-sm tracking-wider transition-all ${
              activeTab === 'O_LEVEL' 
                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 translate-y-0.5' 
                : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            O-LEVEL
          </button>
          <button 
            onClick={() => setActiveTab('PSLE')}
            className={`px-8 py-3 rounded-full font-black text-sm tracking-wider transition-all flex items-center gap-2 ${
              activeTab === 'PSLE' 
                ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-200 translate-y-0.5' 
                : 'bg-white text-slate-500 hover:bg-slate-50 border border-slate-200'
            }`}
          >
            PSLE <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px]">NEW</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredPractices.map((practice) => (
          <button
            key={practice.id}
            onClick={() => onSelect(practice.id, practice.type)}
            className="group bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-xl hover:border-indigo-500 transition-all text-left flex flex-col justify-between transform hover:-translate-y-1"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-2xl transition-colors ${activeTab === 'O_LEVEL' ? 'bg-indigo-50 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white' : 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'}`}>
                  {activeTab === 'O_LEVEL' ? <Video size={24} /> : <BookOpen size={24} />}
                </div>
                <div className="flex items-center gap-1 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <Clock size={12} /> {activeTab === 'O_LEVEL' ? '15-20 MINS' : '15 MINS'}
                </div>
              </div>
              <div>
                <h3 className={`text-xl font-black text-slate-800 transition-colors ${activeTab === 'O_LEVEL' ? 'group-hover:text-indigo-600' : 'group-hover:text-emerald-600'}`}>
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
              <div className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${activeTab === 'O_LEVEL' ? 'bg-slate-50 text-slate-600 group-hover:bg-indigo-50 group-hover:text-indigo-700' : 'bg-slate-50 text-slate-600 group-hover:bg-emerald-50 group-hover:text-emerald-700'}`}>
                START PRACTICE
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6 mt-8">
        <h4 className="text-lg font-black text-slate-800">Or Start with a Custom YouTube Video</h4>
        <div className="flex gap-4">
          <input
            type="text"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="Paste YouTube Link here..."
            className="flex-1 px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
          />
          <button
            onClick={() => onStartCustom(youtubeUrl, activeTab)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-sm hover:bg-indigo-700 transition-colors"
          >
            GENERATE
          </button>
        </div>
      </div>
    </div>
  );
};

export default OralSelection;
