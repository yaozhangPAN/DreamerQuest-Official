
import React, { useState, useRef } from 'react';
import { Camera, Sparkles, X, Send, BookOpen, PenTool, ChevronRight, AlertCircle, Loader2 } from 'lucide-react';
import { extractTopicFromImage } from '../geminiService';
import ReactMarkdown from 'react-markdown';

interface SubmissionFormProps {
  isProcessing: boolean;
  topic: string;
  setTopic: (t: string) => void;
  onSubmit: (imagesBase64: string[]) => void;
  onOpenCoPilot: () => void;
  isCoPilotActive?: boolean;
}

const SubmissionForm: React.FC<SubmissionFormProps> = ({ 
  isProcessing, 
  topic, 
  setTopic, 
  onSubmit, 
  onOpenCoPilot,
  isCoPilotActive
}) => {
  const [step, setStep] = useState(topic ? 2 : 1);
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [topicImages, setTopicImages] = useState<string[]>([]);
  const [isExtractingTopic, setIsExtractingTopic] = useState(false);
  
  const essayInputRef = useRef<HTMLInputElement>(null);
  const topicInputRef = useRef<HTMLInputElement>(null);

  const handleTopicImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const promises = files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      
      const newImages = await Promise.all(promises);
      setTopicImages(prev => [...prev, ...newImages]);
    }
    e.target.value = '';
  };

  const processTopicImages = async () => {
    if (topicImages.length === 0) return;
    setIsExtractingTopic(true);
    try {
      const base64Array = topicImages.map(img => img.split(',')[1]);
      const extracted = await extractTopicFromImage(base64Array);
      setTopic(extracted);
      setStep(2);
    } catch (err) {
      alert("Could not read the topic image(s). Please try another photo.");
    } finally {
      setIsExtractingTopic(false);
    }
  };

  const handleEssayFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      const promises = files.map(file => {
        return new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      });
      Promise.all(promises).then(results => {
        setSelectedImages(prev => [...prev, ...results]);
      });
    }
  };

  const handleSubmit = () => {
    if (selectedImages.length > 0) {
      const base64Array = selectedImages.map(img => img.split(',')[1]);
      onSubmit(base64Array);
    }
  };

  // Step 1: Upload Topic Image
  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom duration-500">
        <div className="text-center space-y-3">
          <div className="bg-indigo-100 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
            <BookOpen size={32} />
          </div>
          <h2 className="text-3xl font-black text-slate-800">Step 1: The Topic</h2>
          <p className="text-slate-500">Take a photo of your homework instructions or the topic question.</p>
        </div>

        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex justify-between items-end mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-lg mb-1">Your Topic / Prompt</h3>
              <p className="text-slate-500 text-sm">Upload images of your assignment instructions</p>
            </div>
            {topicImages.length > 0 && !isExtractingTopic && (
              <button 
                onClick={processTopicImages}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
              >
                Scan the Prompt
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {topicImages.map((img, idx) => (
              <div key={idx} className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
                <img src={img} alt={`Topic Preview ${idx + 1}`} className="w-full h-full object-cover" />
                {!isExtractingTopic && (
                  <button 
                    onClick={() => setTopicImages(prev => prev.filter((_, i) => i !== idx))}
                    className="absolute top-2 right-2 bg-white/90 backdrop-blur p-1.5 rounded-full shadow-lg hover:bg-white text-slate-600"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
            {!isExtractingTopic && (
              <button 
                onClick={() => topicInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors"
              >
                <Camera size={24} />
                <span className="font-medium text-sm">Add Page</span>
              </button>
            )}
            <input type="file" ref={topicInputRef} className="hidden" accept="image/*" onChange={handleTopicImageChange} multiple />
          </div>

          {isExtractingTopic && (
            <div className="flex flex-col items-center gap-4 pt-4 border-t border-slate-100">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="font-bold text-slate-700">AI is reading your topic...</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Step 2: Choose Path
  if (step === 2 && selectedImages.length === 0) {
    // CO-PILOT MODE: Streamlined Step 2
    if (isCoPilotActive) {
      return (
        <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom duration-500">
          <div className="text-center space-y-2">
            <h2 className="text-3xl font-black text-slate-800">Ready to Submit?</h2>
            <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100 mx-auto max-w-xl">
              <p className="text-xs font-black text-indigo-400 uppercase mb-1">Topic</p>
              <div className="text-indigo-900 font-bold leading-relaxed line-clamp-3 prose prose-indigo max-w-none">
                <ReactMarkdown>{topic}</ReactMarkdown>
              </div>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center gap-3 max-w-xl mx-auto">
            <Sparkles className="text-amber-600 shrink-0" size={20} />
            <p className="text-amber-800 text-sm font-medium">
              <b>Co-Pilot Mode Active:</b> You used AI help, so XP earned will be <b>25%</b> of normal value.
            </p>
          </div>

          <button 
            onClick={() => essayInputRef.current?.click()}
            className="w-full max-w-xl mx-auto bg-emerald-600 hover:bg-emerald-700 text-white p-8 rounded-3xl shadow-xl shadow-emerald-100 transition-all flex flex-col items-center gap-4 group"
          >
            <input type="file" ref={essayInputRef} className="hidden" accept="image/*" onChange={handleEssayFileChange} multiple />
            <div className="bg-white/20 p-4 rounded-2xl group-hover:scale-110 transition-transform">
              <PenTool size={40} className="text-white" />
            </div>
            <div>
              <h3 className="text-2xl font-black">Upload Handwritten Essay</h3>
              <p className="text-emerald-100 mt-1">Take a photo of your work</p>
            </div>
          </button>

          <button 
            onClick={onOpenCoPilot}
            className="w-full text-slate-400 font-bold hover:text-indigo-600 py-2 transition-colors flex items-center justify-center gap-2"
          >
            <Sparkles size={16} />
            Wait, I need more ideas (Back to Chat)
          </button>
        </div>
      );
    }

    // NORMAL MODE: Standard Step 2 with Options
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-in slide-in-from-bottom duration-500">
        <div className="text-center space-y-2">
          <div className="flex justify-center gap-2 mb-4">
             <span className="w-8 h-2 rounded-full bg-emerald-400"></span>
             <span className="w-8 h-2 rounded-full bg-indigo-500"></span>
             <span className="w-8 h-2 rounded-full bg-slate-200"></span>
          </div>
          <h2 className="text-3xl font-black text-slate-800">Identify Success</h2>
          <div className="bg-indigo-50 p-6 rounded-2xl border border-indigo-100">
            <p className="text-xs font-black text-indigo-400 uppercase mb-1">Extracted Topic</p>
            <div className="text-indigo-900 font-bold leading-relaxed prose prose-indigo max-w-none">
              <ReactMarkdown>{topic}</ReactMarkdown>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <button 
            onClick={onOpenCoPilot}
            className="bg-white p-8 rounded-3xl border-2 border-slate-100 hover:border-indigo-500 hover:shadow-xl transition-all text-center group flex flex-col items-center gap-4"
          >
            <div className="bg-indigo-50 p-6 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <Sparkles size={40} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">I need inspiration</h3>
              <p className="text-sm text-slate-500 mt-2">Open Co-Pilot to chat for ideas. (XP reduced 4x)</p>
            </div>
          </button>

          <button 
            onClick={() => essayInputRef.current?.click()}
            className="bg-white p-8 rounded-3xl border-2 border-slate-100 hover:border-emerald-500 hover:shadow-xl transition-all text-center group flex flex-col items-center gap-4"
          >
            <input type="file" ref={essayInputRef} className="hidden" accept="image/*" onChange={handleEssayFileChange} multiple />
            <div className="bg-emerald-50 p-6 rounded-2xl text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
              <PenTool size={40} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-slate-800">I'm ready to submit</h3>
              <p className="text-sm text-slate-500 mt-2">Upload a photo of your handwritten work. (Full XP)</p>
            </div>
          </button>
        </div>

        <button 
          onClick={() => {
            setTopicImages([]);
            setStep(1);
          }} 
          className="w-full text-slate-400 font-bold hover:text-slate-600 py-2"
        >
          ← Wrong topic? Re-scan Prompt
        </button>
      </div>
    );
  }

  // Step 3: Final Submission Confirm
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in zoom-in duration-500">
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-black text-slate-800">Final Step</h2>
        <p className="text-slate-500">Submitting essay for topic: <span className="font-bold text-slate-800">{topic.substring(0, 50)}...</span></p>
      </div>

      <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {selectedImages.map((img, idx) => (
             <div key={idx} className="relative rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 aspect-square">
               <img src={img} alt={`Preview ${idx + 1}`} className="w-full h-full object-cover" />
               <button 
                 onClick={() => setSelectedImages(prev => prev.filter((_, i) => i !== idx))}
                 className="absolute top-2 right-2 bg-white/90 backdrop-blur p-1.5 rounded-full shadow-lg hover:bg-white text-slate-600"
               >
                 <X size={16} />
               </button>
             </div>
          ))}
          <button 
            onClick={() => essayInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 aspect-square rounded-2xl border-2 border-dashed border-slate-300 hover:border-indigo-500 hover:bg-slate-50 text-slate-500 hover:text-indigo-600 transition-colors"
          >
            <Camera size={24} />
            <span className="font-medium text-sm">Add Page</span>
          </button>
          <input type="file" ref={essayInputRef} className="hidden" accept="image/*" onChange={handleEssayFileChange} multiple />
        </div>

        <div className="flex items-start gap-3 bg-amber-50 p-4 rounded-2xl border border-amber-100">
          <AlertCircle className="text-amber-600 mt-0.5 shrink-0" size={20} />
          <div className="text-sm text-amber-700 font-medium space-y-1">
            <p>
              <b>Handwriting Only:</b> The AI will give <b>0 points</b> if the text is typed!
            </p>
            {isCoPilotActive && (
              <p>
                <Sparkles size={12} className="inline mr-1" />
                <b>Co-Pilot Active:</b> Final XP will be 25% of the rubric score.
              </p>
            )}
          </div>
        </div>

        <button 
          disabled={isProcessing}
          onClick={handleSubmit}
          className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3
            ${isProcessing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-100'}
          `}
        >
          {isProcessing ? (
            <><Loader2 className="animate-spin" size={20} /> Grading Essay...</>
          ) : (
            <><Send size={20} /> Finish Submission</>
          )}
        </button>
      </div>
    </div>
  );
};

export default SubmissionForm;
