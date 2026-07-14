
import React, { useState, useRef, useEffect } from 'react';
import { Camera, Volume2, SkipForward, RotateCcw, Send, CheckCircle2, Loader2, List, PenTool, ArrowLeft, X, Plus, ChevronLeft } from 'lucide-react';
import { extractSpellingList, generateSpellingAudio, evaluateSpellingAnswers } from '../geminiService';
import { compressDataUrl } from '../lib/imageUtils';
import {
  filterChineseSystemVoices,
  getSpeechVoices,
  speakTextWithSystemVoice,
} from '../lib/systemTtsVoices';
import { SpellingSession, Session } from '../types';

interface SpellingPracticeProps {
  onXpEarned: (count: number) => void;
  onDone: () => void;
  activeSession: SpellingSession | null;
  onSaveSession: (session: SpellingSession | null) => void;
}

// Utility to decode base64 into bytes
function decodeBase64(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Fixed decoding logic for raw PCM 16-bit audio
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

const SpellingPractice: React.FC<SpellingPracticeProps> = ({ onXpEarned, onDone, activeSession, onSaveSession }) => {
  const [step, setStep] = useState<'UPLOAD_LIST' | 'READY_AUDIO' | 'PRACTICE' | 'UPLOAD_ANSWERS' | 'RESULT'>(activeSession ? 'READY_AUDIO' : 'UPLOAD_LIST');
  const [ttsMode, setTtsMode] = useState<'AI' | 'BROWSER'>('BROWSER');
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<SpellingSession | null>(activeSession);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [listImages, setListImages] = useState<string[]>([]);
  const [answerImages, setAnswerImages] = useState<string[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  // Filtered voices based on current list language
  const filteredVoices = useRef<SpeechSynthesisVoice[]>([]);
  
  const isSessionChinese = sessionData ? 
    sessionData.sessions[sessionData.currentSessionIndex]?.words?.some(w => /[\u4e00-\u9fa5]/.test(w)) : 
    false;

  filteredVoices.current = sessionData
    ? isSessionChinese
      ? filterChineseSystemVoices(availableVoices)
      : availableVoices.filter((v) => v.lang.toLowerCase().startsWith('en'))
    : availableVoices;

  const audioContextRef = useRef<AudioContext | null>(null);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  
  const [result, setResult] = useState<{
    correctWords: string[];
    incorrectWords: { original: string; student: string }[];
    feedback: string;
  } | null>(null);

  const listInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLInputElement>(null);

  // Initialize AudioContext on first interaction (do not touch SpeechSynthesis here —
  // cancel/silent speak races cause interrupted errors on fallback).
  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  };

  // Load available system voices
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const voices = await getSpeechVoices();
      if (!cancelled) setAvailableVoices(voices);
    };
    load();
    const synth = window.speechSynthesis;
    const updateVoices = () => setAvailableVoices(synth.getVoices());
    synth.addEventListener('voiceschanged', updateVoices);
    return () => {
      cancelled = true;
      synth.removeEventListener('voiceschanged', updateVoices);
    };
  }, []);

  const stopAudio = () => {
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop();
      } catch (e) {}
      currentSourceRef.current = null;
    }
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    setIsPlaying(false);
  };

  const playBrowserTTS = async (word: string) => {
    if (window.speechSynthesis.getVoices().length === 0) {
      await getSpeechVoices();
    }

    setIsPlaying(true);
    speakTextWithSystemVoice(word, {
      preferredVoiceName: selectedVoiceName,
      onEnd: () => setIsPlaying(false),
      onError: (errorType) => {
        // not-allowed usually means autoplay lost the user gesture — ask for a tap.
        if (errorType === 'not-allowed') {
          console.warn('System TTS blocked; tap REPLAY AUDIO to play.');
        } else {
          console.warn('System TTS error:', errorType);
        }
      },
    });
  };

  // Handle Audio Generation and Playback
  const playWord = async (word: string) => {
    const ctx = initAudio();
    stopAudio();
    setIsPlaying(true);

    const isChinese = /[\u4e00-\u9fa5]/.test(word);

    // System mode, or Chinese in AI mode: Gemini TTS is unreliable for Chinese.
    if (ttsMode === 'BROWSER' || isChinese) {
      await playBrowserTTS(word);
      return;
    }

    try {
      const audioData = await generateSpellingAudio(word);

      if (audioData === '__BROWSER_TTS__') {
        await playBrowserTTS(word);
        return;
      }

      const bytes = decodeBase64(audioData);
      const buffer = await decodeAudioData(bytes, ctx, 24000, 1);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlaying(false);

      currentSourceRef.current = source;
      source.start(0);
    } catch (err) {
      console.warn('AI TTS failed, using system voice fallback');
      await playBrowserTTS(word);
    }
  };

  // Auto-play effect
  useEffect(() => {
    if (step === 'PRACTICE' && sessionData) {
      const currentWords = sessionData.sessions[sessionData.currentSessionIndex].words;
      if (currentWords && currentWords[currentIndex]) {
        // Delay slightly to allow transition
        const timer = setTimeout(() => {
          playWord(currentWords[currentIndex]);
        }, 600);
        return () => clearTimeout(timer);
      }
    }
  }, [currentIndex, step, sessionData?.currentSessionIndex]);

  const processUploadedFile = async (file: File): Promise<string> => {
    if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
      const mammoth = (await import('mammoth')).default;
      const arrayBuffer = await file.arrayBuffer();
      try {
        const result = await mammoth.extractRawText({ arrayBuffer });
        return 'text:' + result.value;
      } catch (err) {
        console.error("Mammoth text extraction error:", err);
        throw new Error("Failed to read Word document.");
      }
    } else {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
          if (reader.result) {
            try {
              const compressed = await compressDataUrl(reader.result as string);
              resolve(compressed);
            } catch {
              resolve(reader.result as string);
            }
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = () => reject(new Error("File read error"));
        reader.readAsDataURL(file);
      });
    }
  };

  const handleListPhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      for (const file of files) {
        try {
          const processed = await processUploadedFile(file);
          setListImages(prev => [...prev, processed]);
        } catch (err) {
          alert(`Failed to load file: ${file.name}`);
        }
      }
    }
    e.target.value = '';
  };

  const removeListImage = (index: number) => {
    setListImages(prev => prev.filter((_, i) => i !== index));
  };

  const processList = async () => {
    if (listImages.length === 0) return;
    setIsProcessing(true);
    try {
      const extracted = await extractSpellingList(listImages);
      if (extracted.length === 0) throw new Error("No words found");
      
      // Session splitting logic:
      // Chunks of 20. 
      // If remainder >= 10, new session.
      // If remainder < 10, merge into last session.
      const sessions: Session[] = [];
      const chunkSize = 20;
      
      for (let i = 0; i < extracted.length; i += chunkSize) {
        sessions.push({ words: extracted.slice(i, i + chunkSize) });
      }

      if (sessions.length > 1) {
        const last = sessions[sessions.length - 1].words;
        if (last.length < 10) {
          const popped = sessions.pop()!;
          sessions[sessions.length - 1].words = [...sessions[sessions.length - 1].words, ...popped.words];
        }
      }

      const detectedIsChinese = extracted.some(w => /[\u4e00-\u9fa5]/.test(w));
      const sessionName = extracted.length > 0 ? 
        (detectedIsChinese ? `Spelling: ${extracted[0]}...` : `Spelling: ${extracted[0]}...`) : 
        `Spelling ${new Date().toLocaleDateString()}`;

      const newSession: SpellingSession = {
        id: Math.random().toString(36).substr(2, 9),
        name: sessionName,
        createdAt: Date.now(),
        allWords: extracted,
        listImages: listImages,
        sessions: sessions,
        currentSessionIndex: 0,
        isCompleted: false
      };

      setSessionData(newSession);
      onSaveSession(newSession);
      setStep('READY_AUDIO');
    } catch (err) {
      alert("Couldn't read the spelling list. Try clearer photos!");
    } finally {
      setIsProcessing(false);
    }
  };

  const startPractice = () => {
    const ctx = initAudio();
    
    // Final foolproof check for mobile: speak a tiny silent sound immediately 
    // on this click handler to "bless" the auth for SpeechSynthesis.
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    const utterance = new SpeechSynthesisUtterance("Go");
    utterance.volume = 0.001; // Nearly silent
    utterance.rate = 10;
    synth.speak(utterance);
    
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    
    setStep('PRACTICE');
  };

  const handleNextWord = () => {
    const currentSessionWords = sessionData!.sessions[sessionData!.currentSessionIndex].words;
    if (currentIndex < currentSessionWords.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setStep('UPLOAD_ANSWERS');
    }
  };

  const handlePrevWord = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleAnswerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      for (const file of files) {
        try {
          const processed = await processUploadedFile(file);
          setAnswerImages(prev => [...prev, processed]);
        } catch (err) {
          alert(`Failed to load file: ${file.name}`);
        }
      }
    }
    e.target.value = '';
  };

  const removeAnswerImage = (index: number) => {
    setAnswerImages(prev => prev.filter((_, i) => i !== index));
  };

  const submitAnswers = async () => {
    if (answerImages.length === 0 || !sessionData) return;
    setIsProcessing(true);
    try {
      const currentWords = sessionData.sessions[sessionData.currentSessionIndex].words;
      
      const evalResult = await evaluateSpellingAnswers(
        sessionData.listImages,
        answerImages,
        currentWords
      );
      setResult(evalResult);
      onXpEarned(evalResult.correctWords.length);
      
      const isLastSession = sessionData.currentSessionIndex >= sessionData.sessions.length - 1;

      const updatedSession: SpellingSession = { 
        ...sessionData, 
        currentSessionIndex: sessionData.currentSessionIndex + 1,
        isCompleted: isLastSession
      };
      
      if (isLastSession) {
        onSaveSession(null); // Signal removal from active sessions
      } else {
        onSaveSession(updatedSession);
      }
      
      setSessionData(updatedSession);
      setStep('RESULT');
      setAnswerImages([]); // Clear for next session
    } catch (err) {
      alert("Error checking answers. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuit = () => {
    if (sessionData && !sessionData.isCompleted) {
        onSaveSession(sessionData);
    }
    onDone();
  };

  const handleResultContinue = () => {
    if (sessionData && !sessionData.isCompleted && sessionData.currentSessionIndex < sessionData.sessions.length) {
      setCurrentIndex(0);
      setResult(null);
      setStep('PRACTICE');
      return;
    }
    onDone();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500 relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
          <button 
            onClick={handleQuit}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <ChevronLeft size={16} />
            BACK TO DASHBOARD
          </button>
      {/* Voice Selection Dropdown (Only when a list is loaded and voices are found) */}
      {sessionData && ttsMode === 'BROWSER' && filteredVoices.current.length > 0 && (
        <div className="flex items-center gap-2 z-20">
          <div className="group relative">
            <button className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-indigo-300 transition-colors shadow-sm">
              <Volume2 size={14} className="text-indigo-500" />
              <span className="truncate max-w-[120px]">
                {selectedVoiceName || "Auto Voice"}
              </span>
            </button>
            <div className="absolute top-full right-0 mt-2 w-64 bg-white border border-slate-200 rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all max-h-60 overflow-y-auto p-2 scrollbar-hide">
              <div className="px-2 py-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 mb-1">
                Select {isSessionChinese ? 'Chinese' : 'English'} Voice
              </div>
              <button 
                onClick={() => setSelectedVoiceName(null)}
                className={`w-full text-left px-3 py-2 rounded-xl text-sm font-bold transition-colors mb-1 ${!selectedVoiceName ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                Auto (Recommended)
              </button>
              {filteredVoices.current.map((voice) => (
                <button 
                  key={`${voice.name}-${voice.lang}`}
                  onClick={() => setSelectedVoiceName(voice.name)}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-medium transition-colors mb-0.5 ${selectedVoiceName === voice.name ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  <div className="font-bold text-sm truncate">{voice.name}</div>
                  <div className="text-[10px] opacity-60 uppercase">{voice.lang}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>

      {/* Step 1: Upload List(s) */}
      {step === 'UPLOAD_LIST' && (
        <div className="text-center space-y-6">
          <div className="bg-emerald-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-emerald-600">
            <List size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800">Spelling Prep</h2>
            <p className="text-slate-500">Snap photos of your spelling list. We'll split it into sessions of 20!</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {listImages.map((img, i) => {
                const isPdf = img.startsWith('data:application/pdf');
                const isText = img.startsWith('text:');
                return (
                  <div key={i} className="relative aspect-[3/4] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 group flex items-center justify-center p-2">
                    {isText ? (
                      <div className="flex flex-col items-center justify-center w-full h-full p-2 bg-indigo-50 rounded-xl text-center">
                        <List size={24} className="text-indigo-400 mb-2" />
                        <span className="text-[10px] font-black text-indigo-600 uppercase">Word Document</span>
                      </div>
                    ) : isPdf ? (
                      <div className="flex flex-col items-center justify-center w-full h-full p-2 bg-rose-50 rounded-xl text-center">
                        <List size={24} className="text-rose-400 mb-2" />
                        <span className="text-[10px] font-black text-rose-600 uppercase">PDF Document</span>
                      </div>
                    ) : (
                      <img src={img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}`} alt={`List ${i+1}`} className="w-full h-full object-cover rounded-xl" />
                    )}
                    <button 
                      onClick={() => removeListImage(i)}
                      className="absolute top-2 right-2 bg-red-500 text-white p-1.5 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-10"
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
              
              <button 
                onClick={() => listInputRef.current?.click()}
                className="aspect-[3/4] border-4 border-dashed border-slate-100 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
              >
                <Plus size={32} className="group-hover:scale-110 transition-transform" />
                <span className="text-xs font-black mt-2">ADD PHOTO</span>
              </button>
            </div>

            <input type="file" ref={listInputRef} className="hidden" accept="image/*,application/pdf,.doc,.docx" onChange={handleListPhotoChange} multiple />

            <button 
              disabled={listImages.length === 0 || isProcessing}
              onClick={() => {
                initAudio();
                processList();
              }}
              className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all flex items-center justify-center gap-3
                ${listImages.length === 0 || isProcessing ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-100'}
              `}
            >
              {isProcessing ? (
                <><Loader2 className="animate-spin" size={20} /> Analyzing Photos...</>
              ) : (
                <><Send size={20} /> Start Practice Session</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Ready for Audio (Capture gesture) */}
      {step === 'READY_AUDIO' && (
        <div className="text-center space-y-8 animate-in zoom-in duration-500 py-12">
          <div className="bg-indigo-100 w-24 h-24 rounded-[40px] flex items-center justify-center mx-auto text-indigo-600 animate-bounce">
            <Volume2 size={48} />
          </div>
          <div className="space-y-4">
            <h2 className="text-3xl font-black text-slate-800">Audio Check</h2>
            <p className="text-slate-500 max-w-sm mx-auto">Tap the button below to enable sound for this session. This is required for mobile devices.</p>
          </div>
          
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm max-w-sm mx-auto space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="font-bold text-slate-600">Voice Mode</span>
              <div className="flex bg-slate-200 p-1 rounded-xl">
                <button 
                  onClick={() => setTtsMode('BROWSER')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${ttsMode === 'BROWSER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                >
                  SYSTEM
                </button>
                <button 
                  onClick={() => setTtsMode('AI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${ttsMode === 'AI' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                  AI
                </button>
              </div>
            </div>
            
            <button 
              onClick={startPractice}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black text-xl shadow-xl shadow-indigo-100 transition-all"
            >
              I'M READY!
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Practice Session */}
      {step === 'PRACTICE' && sessionData && (
        <div className="space-y-8 animate-in slide-in-from-bottom duration-500">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div className="bg-indigo-100 px-4 py-1.5 rounded-full text-indigo-700 font-black text-sm">
              SESSION {sessionData.currentSessionIndex + 1} OF {sessionData.sessions.length}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex bg-slate-200 p-1 rounded-xl">
                <button
                  onClick={() => setTtsMode('BROWSER')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${ttsMode === 'BROWSER' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
                >
                  SYSTEM
                </button>
                <button
                  onClick={() => setTtsMode('AI')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${ttsMode === 'AI' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
                >
                  AI
                </button>
              </div>
              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                WORD {currentIndex + 1} OF {sessionData.sessions[sessionData.currentSessionIndex].words.length}
              </div>
            </div>
          </div>

          <div className="bg-white p-16 rounded-[40px] border border-slate-200 shadow-xl text-center space-y-10">
            <div 
              className={`w-36 h-36 rounded-full flex items-center justify-center mx-auto shadow-lg transition-all duration-300
              ${isPlaying ? 'bg-emerald-500 shadow-emerald-200 scale-110 animate-pulse' : 'bg-indigo-600 shadow-indigo-200'}`}
            >
              <Volume2 size={80} className="text-white" />
            </div>
            
            <div className="space-y-2">
              <h3 className="text-3xl font-black text-slate-800">Listen Carefully</h3>
              <p className="text-slate-500 font-medium italic text-lg">Write it down on your paper...</p>
            </div>

            <button 
              onClick={() => playWord(sessionData.sessions[sessionData.currentSessionIndex].words[currentIndex])}
              className="text-indigo-600 font-black hover:text-indigo-700 flex items-center justify-center gap-2 mx-auto transition-colors"
            >
              <RotateCcw size={20} /> REPLAY AUDIO
            </button>
          </div>

          <div className="flex gap-4">
            <button 
              onClick={handlePrevWord}
              disabled={currentIndex === 0}
              className="w-1/3 py-6 rounded-3xl font-black text-xl transition-all border-2 border-slate-200 text-slate-400 disabled:opacity-30 enabled:hover:bg-slate-50 enabled:hover:text-slate-600 enabled:border-slate-300 flex items-center justify-center gap-2"
            >
              <ChevronLeft size={24} /> BACK
            </button>
            
            <button 
              onClick={handleNextWord}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-6 rounded-3xl font-black text-xl shadow-lg shadow-emerald-100 transition-all flex items-center justify-center gap-3"
            >
              {currentIndex === sessionData.sessions[sessionData.currentSessionIndex].words.length - 1 ? "I'M FINISHED!" : "NEXT WORD"}
              <SkipForward size={24} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Upload Answers */}
      {step === 'UPLOAD_ANSWERS' && (
        <div className="text-center space-y-6">
          <div className="bg-indigo-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-indigo-600">
            <PenTool size={40} />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800">Session Complete!</h2>
            <p className="text-slate-500">Upload a photo of your session {sessionData?.currentSessionIndex! + 1} answers.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="flex justify-between items-end">
              <div>
                <h3 className="font-bold text-slate-800 text-lg mb-1">Your Handwritten Answers</h3>
                <p className="text-slate-500 text-sm">Upload images of your handwritten spelling test</p>
              </div>
              {answerImages.length > 0 && (
                <button 
                  onClick={submitAnswers}
                  disabled={isProcessing}
                  className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white px-6 py-2 rounded-xl font-bold transition-colors flex items-center gap-2"
                >
                  {isProcessing ? <><Loader2 size={18} className="animate-spin" /> Marking...</> : <><CheckCircle2 size={18} /> Submit Answers</>}
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {answerImages.map((data, idx) => (
                <div key={idx} className="relative aspect-square rounded-2xl border-2 border-slate-100 overflow-hidden group bg-slate-50 flex items-center justify-center">
                  <img src={data} alt={`Answer ${idx + 1}`} className="w-full h-full object-cover" />
                  <button 
                    onClick={() => removeAnswerImage(idx)}
                    className="absolute top-2 right-2 bg-white/90 backdrop-blur p-1.5 rounded-full shadow-sm opacity-0 group-hover:opacity-100 transition-opacity hover:bg-rose-50 text-rose-500"
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
              
              <button 
                onClick={() => answerInputRef.current?.click()}
                className="aspect-square rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/50 flex flex-col items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors gap-2"
              >
                <Plus size={32} />
                <span className="font-medium text-sm">Add Page</span>
              </button>
              <input type="file" ref={answerInputRef} className="hidden" accept="image/*" capture="environment" multiple onChange={handleAnswerUpload} />
            </div>
          </div>
          <button onClick={() => setStep('PRACTICE')} className="text-slate-400 font-bold hover:text-slate-600">
            ← Wait, I need to check one word
          </button>
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'RESULT' && result && (
        <div className="space-y-8 animate-in zoom-in duration-500">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto">
              <CheckCircle2 size={48} />
            </div>
            <h2 className="text-4xl font-black text-slate-800">Session Marked!</h2>
            <div className="text-6xl font-black text-emerald-600">+{result.correctWords.length * 5} XP</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
              <h3 className="font-bold text-emerald-600 flex items-center gap-2">
                <CheckCircle2 size={18} /> Correct Words
              </h3>
              <div className="flex flex-wrap gap-2">
                {result.correctWords.map(w => (
                  <span key={w} className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full font-bold text-sm">
                    {w}
                  </span>
                ))}
                {result.correctWords.length === 0 && <p className="text-slate-400 italic text-sm">Keep practicing!</p>}
              </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
              <h3 className="font-bold text-red-500 flex items-center gap-2">
                <RotateCcw size={18} /> Needs Practice
              </h3>
              <div className="space-y-2">
                {result.incorrectWords.map((w, i) => (
                  <div key={i} className="flex justify-between text-sm items-center bg-red-50 p-2 rounded-xl">
                    <span className="font-black text-red-700">{w.original}</span>
                    <span className="text-slate-400">→</span>
                    <span className="font-bold text-slate-500">{w.student || "(missing)"}</span>
                  </div>
                ))}
                {result.incorrectWords.length === 0 && <p className="text-slate-400 italic text-sm">Perfect score!</p>}
              </div>
            </div>
          </div>

          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 text-indigo-900 italic text-center font-medium">
            "{result.feedback}"
          </div>

          <button 
            onClick={handleResultContinue}
            className="w-full bg-slate-800 hover:bg-slate-900 text-white font-black text-lg py-5 rounded-2xl transition-all"
          >
            {sessionData && !sessionData.isCompleted && sessionData.currentSessionIndex < sessionData.sessions.length
              ? "CONTINUE NEXT SESSION"
              : "BACK TO DASHBOARD"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SpellingPractice;
