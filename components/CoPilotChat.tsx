
import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, ArrowLeft, Bot, User, PenTool } from 'lucide-react';
import { ChatMessage } from '../types';
import { getCoPilotInspiration } from '../geminiService';
import ReactMarkdown from 'react-markdown';

interface CoPilotChatProps {
  topic: string;
  onBack: () => void;
  onSubmitMode: () => void;
}

const CoPilotChat: React.FC<CoPilotChatProps> = ({ topic, onBack, onSubmitMode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'ai', text: `Hi! I see your topic is "${topic}". I'm here to help you brainstorm. What part are you stuck on?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsLoading(true);

    try {
      const response = await getCoPilotInspiration(messages, userMsg, topic);
      setMessages(prev => [...prev, { role: 'ai', text: response }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'ai', text: "Oops, my brain stalled for a second! Can you try asking that again?" }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[700px] bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden animate-in fade-in duration-500">
      {/* Header */}
      <div className="bg-slate-50 p-4 border-b border-slate-200 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-bold text-sm">
          <ArrowLeft size={18} />
          BACK
        </button>
        <div className="text-center overflow-hidden whitespace-nowrap px-4">
          <p className="text-[10px] uppercase font-black text-slate-400">Current Topic</p>
          <p className="text-xs font-bold text-slate-600 truncate max-w-[200px]">{topic}</p>
        </div>
        <div className="flex items-center gap-2 bg-indigo-100 px-3 py-1.5 rounded-full text-indigo-700 font-bold text-xs">
          <Sparkles size={14} />
          CO-PILOT
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 shadow-sm
              ${msg.role === 'user' ? 'bg-slate-100 text-slate-500' : 'bg-indigo-600 text-white'}`}
            >
              {msg.role === 'user' ? <User size={20} /> : <Bot size={20} />}
            </div>
            <div className={`max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed shadow-sm
              ${msg.role === 'user' ? 'bg-slate-100 text-slate-800 rounded-tr-none' : 'bg-indigo-50 text-indigo-900 rounded-tl-none'}`}
            >
              {msg.role === 'ai' ? (
                <div className="prose prose-sm prose-indigo max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-2 prose-li:my-0.5">
                  <ReactMarkdown>{msg.text}</ReactMarkdown>
                </div>
              ) : (
                msg.text
              )}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex gap-4">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center bg-indigo-600 text-white shrink-0 shadow-sm animate-pulse">
              <Bot size={20} />
            </div>
            <div className="bg-indigo-50 p-4 rounded-2xl rounded-tl-none">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-2 h-2 bg-indigo-300 rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Input & Call to Action */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 space-y-4">
        <div className="relative">
          <input 
            type="text" 
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask for an idea..."
            className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 pr-16 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800 placeholder:text-slate-400"
          />
          <button 
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className={`absolute right-2 top-2 bottom-2 px-4 rounded-xl text-white transition-all
              ${!input.trim() || isLoading ? 'bg-slate-200' : 'bg-indigo-600 hover:bg-indigo-700'}`}
          >
            <Send size={18} />
          </button>
        </div>

        <button 
          onClick={onSubmitMode}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-4 rounded-2xl font-black flex items-center justify-center gap-2 shadow-lg shadow-emerald-100 transition-all"
        >
          <PenTool size={20} />
          DONE GETTING IDEAS? SUBMIT ESSAY
        </button>
      </div>
    </div>
  );
};

export default CoPilotChat;
