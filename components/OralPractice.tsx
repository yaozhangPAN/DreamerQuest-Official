
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, Play, PenTool, Save, Trash2, Info, Timer, Mic, Square, CheckCircle, Loader2, Star, Award } from 'lucide-react';
import { evaluateOralPerformance, generateFollowUpQuestion } from '../geminiService';
import { OralEvaluation } from '../types';

interface OralPracticeProps {
  onDone: () => void;
  onXpEarned: (marks: number) => void;
  practiceId?: number;
}

type PracticePhase = 'PREPARING' | 'ANSWERING_SUMMARY' | 'ANSWERING_QUESTIONS' | 'EVALUATING' | 'RESULT';

interface PracticeContent {
  mainQuestion: string;
  videoUrl: string;
  questions: string[];
}

const PRACTICE_SETS: Record<number, PracticeContent> = {
  1: {
    mainQuestion: "你对自拍并上传到社交媒体有何看法？",
    videoUrl: "https://www.youtube.com/embed/mvvfkT_k5Rg?end=94&autoplay=1",
    questions: [
      "你听过哪些关于自拍的负面新闻？",
      "你认为那些自拍是不能容忍的？",
      "有的人是希望依靠自拍或者点赞，得到他人认同，你认同 these 人的做法吗？"
    ]
  },
  2: {
    mainQuestion: "如果你去食阁吃饭时，看到视频中的机器人，你会有什么样的感受？",
    videoUrl: "https://players.brightcove.net/6057984932001/default_default/index.html?videoId=6376827437112&autoplay=true&muted=true",
    questions: [
      "如果你去食阁吃饭时，看到视频中的机器人，你会有什么样的感受？",
      "你觉得食阁引用人工智能科技，有哪些好处呢？",
      "人工智能的发展会导致许多人失业。谈谈你的看法。"
    ]
  },
  3: {
    mainQuestion: "看到商家推出这些环保创新的福物来吸引年轻人参与中元节活动，你有什么感受？",
    videoUrl: "https://players.brightcove.net/6057984932001/default_default/index.html?videoId=6376909932112&autoplay=true&muted=true",
    questions: [
      "看到商家推出这些环保创新的福物来吸引年轻人参与中元节活动，你有什么感受？",
      "年轻人对中元会兴趣不高，你觉得造成这种情况的原因可能有哪些呢？",
      "年轻人有责任把传统文化传承下去。谈谈你的看法。"
    ]
  },
  4: {
    mainQuestion: "你是如何处理旧电子设备的？",
    videoUrl: "https://players.brightcove.net/6057984932001/default_default/index.html?videoId=6363205051112&autoplay=true&muted=true",
    questions: [
      "你是如何处理旧电子设备的？",
      "电子垃圾对环境和社会有哪些影响？",
      "减少电子垃圾比回收更重要，你同意吗？为什么？"
    ]
  },
  5: {
    mainQuestion: "预防洪灾是每个人的责任。你同意吗？",
    videoUrl: "https://players.brightcove.net/6057984932001/default_default/index.html?videoId=6364231583112&autoplay=true&muted=true",
    questions: [
      "你本身是否经历过洪灾？为什么洪灾很可怕？",
      "你认为新加坡人对洪灾有足够的防范意识吗？从哪里可以看出来？",
      "政府和社区可以采取哪些措施来更好地预防和应对洪灾？"
    ]
  },
  6: {
    mainQuestion: "我们可以如何减少食物浪费？",
    videoUrl: "https://players.brightcove.net/6057984932001/default_default/index.html?videoId=6364744317112&autoplay=true&muted=true",
    questions: [
      "关于如何减少食物浪费，你提到个人和家庭层面。你可以进一步说明你或你的家人是怎么做的吗？",
      "视频里提到店家利用剩余食物应用程序来减少食物浪费，你对这个做法有什么看法？",
      "谈了这么多，减少食物浪费到底为什么那么重要呢？"
    ]
  }
};

const OralPractice: React.FC<OralPracticeProps> = ({ onDone, onXpEarned, practiceId = 1 }) => {
  const content = PRACTICE_SETS[practiceId] || PRACTICE_SETS[1];
  const QUESTIONS = content.questions;

  const [isStarted, setIsStarted] = useState(false);
  const [phase, setPhase] = useState<PracticePhase>('PREPARING');
  const [notes, setNotes] = useState('');
  const [prepTimeLeft, setPrepTimeLeft] = useState(600); // 10 minutes
  const [isRecording, setIsRecording] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [summaryTranscript, setSummaryTranscript] = useState('');
  const [answersTranscripts, setAnswersTranscripts] = useState<string[]>(['', '', '']);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [task1TimeLeft, setTask1TimeLeft] = useState(120); // 2 minutes for Task 1
  const [subQuestionCount, setSubQuestionCount] = useState(0);
  const [currentSubQuestion, setCurrentSubQuestion] = useState<string | null>(null);
  const [isCheckingFollowUp, setIsCheckingFollowUp] = useState(false);
  const [evaluation, setEvaluation] = useState<OralEvaluation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isStarted && phase === 'PREPARING' && prepTimeLeft > 0) {
      timer = setInterval(() => {
        setPrepTimeLeft(prev => {
          if (prev <= 1) {
            setPhase('ANSWERING_SUMMARY');
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isStarted, phase, prepTimeLeft]);

  useEffect(() => {
    if (phase === 'ANSWERING_QUESTIONS') {
      speakQuestion(QUESTIONS[currentQuestionIndex]);
    }
  }, [phase, currentQuestionIndex]);

  const speakQuestion = (text: string) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    window.speechSynthesis.speak(utterance);
  };

  const startRecording = () => {
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      let currentInterim = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          currentInterim += event.results[i][0].transcript;
        }
      }

      setInterimTranscript(currentInterim);

      if (finalTranscript) {
        if (phase === 'ANSWERING_SUMMARY') {
          setSummaryTranscript(prev => prev + finalTranscript);
        } else if (phase === 'ANSWERING_QUESTIONS') {
          setAnswersTranscripts(prev => {
            const newAnswers = [...prev];
            newAnswers[currentQuestionIndex] += finalTranscript;
            return newAnswers;
          });
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'not-allowed') {
        alert("Microphone access was denied. Please enable it in your browser settings.");
      } else if (event.error === 'no-speech') {
        // Just ignore no-speech errors, they happen if the user is quiet
      } else {
        alert(`Speech recognition error: ${event.error}`);
      }
      stopRecording();
    };

    recognition.onend = () => {
      if (isRecording) {
        // If it ended unexpectedly while we thought it was recording, restart it
        try {
          recognition.start();
        } catch (e) {
          setIsRecording(false);
        }
      }
    };

    recognition.start();
    recognitionRef.current = recognition;
    setIsRecording(true);
  };

  const stopRecording = async () => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent restart
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setInterimTranscript('');
    await handleNext();
  };

  const handleNext = async () => {
    if (isRecording) {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      setIsRecording(false);
      setInterimTranscript('');
    }

    if (phase === 'ANSWERING_SUMMARY') {
      setSubQuestionCount(0);
      setCurrentSubQuestion(null);
      setPhase('ANSWERING_QUESTIONS');
      setCurrentQuestionIndex(0);
    } else if (phase === 'ANSWERING_QUESTIONS') {
      // Check for follow-up if we haven't reached the limit
      if (subQuestionCount < 2) {
        setIsCheckingFollowUp(true);
        try {
          const followUp = await generateFollowUpQuestion(
            currentSubQuestion || QUESTIONS[currentQuestionIndex],
            answersTranscripts[currentQuestionIndex],
            subQuestionCount
          );
          
          if (followUp) {
            setAnswersTranscripts(prev => {
              const newAnswers = [...prev];
              newAnswers[currentQuestionIndex] += `\n[考官追问：${followUp}]\n`;
              return newAnswers;
            });
            setCurrentSubQuestion(followUp);
            setSubQuestionCount(prev => prev + 1);
            speakQuestion(followUp);
            setIsCheckingFollowUp(false);
            return; // Stay on current question but with follow-up
          }
        } catch (error) {
          console.error("Follow-up check failed:", error);
        }
        setIsCheckingFollowUp(false);
      }

      // No follow-up or limit reached, move to next main question
      setSubQuestionCount(0);
      setCurrentSubQuestion(null);

      if (currentQuestionIndex < QUESTIONS.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        await submitForEvaluation();
      }
    }
  };

  const submitForEvaluation = async () => {
    setPhase('EVALUATING');
    setIsProcessing(true);
    try {
      const result = await evaluateOralPerformance(summaryTranscript, answersTranscripts, QUESTIONS);
      setEvaluation(result);
      onXpEarned(result.totalMarks);
      setPhase('RESULT');
    } catch (error) {
      alert("Evaluation failed. Please try again.");
      setPhase('ANSWERING_QUESTIONS');
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isRecording && phase === 'ANSWERING_SUMMARY' && task1TimeLeft > 0) {
      timer = setInterval(() => {
        setTask1TimeLeft(prev => {
          if (prev === 31) {
            playBell();
          }
          if (prev <= 1) {
            handleNext();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording, phase, task1TimeLeft, handleNext]);

  const playBell = () => {
    try {
      const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const audioCtx = new AudioContextClass();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.5);

      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1);

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 1);
    } catch (e) {
      console.error("Failed to play bell sound", e);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setIsStarted(true);
  };

  const clearNotes = () => {
    if (window.confirm('Are you sure you want to clear your notes?')) {
      setNotes('');
    }
  };

  if (!isStarted) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-6">
          <div className="bg-amber-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-amber-600">
            <Play size={40} fill="currentColor" />
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-black text-slate-800">Oral Practice</h2>
            <p className="text-slate-500">Watch the video stimulus and take notes on the scratch pad to prepare your response.</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="text-left space-y-4">
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600 shrink-0">
                  <Info size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">How it works</h4>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    1. Click "Start Practice" to begin.<br/>
                    2. You have 10 minutes to watch and take notes.<br/>
                    3. After 10 minutes (or when you're ready), the answering phase begins.<br/>
                    4. Summarize the video first, then answer 3 questions by speaking.
                  </p>
                </div>
              </div>
            </div>

            <button 
              onClick={handleStart}
              className="w-full py-5 bg-amber-600 hover:bg-amber-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-amber-100 transition-all flex items-center justify-center gap-3 transform hover:-translate-y-1 active:scale-[0.98]"
            >
              <Play size={20} fill="currentColor" />
              START ORAL PRACTICE
            </button>
            
            <button 
              onClick={onDone}
              className="w-full py-4 text-slate-400 font-bold hover:text-slate-600 transition-colors"
            >
              BACK TO DASHBOARD
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'EVALUATING') {
    return (
      <div className="max-w-md mx-auto py-20 text-center space-y-8 animate-in fade-in duration-500">
        <div className="relative">
          <div className="w-24 h-24 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mx-auto"></div>
          <div className="absolute inset-0 flex items-center justify-center text-indigo-600">
            <Award size={32} className="animate-pulse" />
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-800">Evaluating Performance...</h2>
          <p className="text-slate-500 font-medium">Our AI examiner is marking your summary and responses based on the rubric.</p>
        </div>
      </div>
    );
  }

  if (phase === 'RESULT' && evaluation) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-[2.5rem] p-10 text-white text-center relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-white/10 rounded-full blur-3xl"></div>
          <div className="relative z-10 space-y-4">
            <div className="bg-white/20 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6">
              <Trophy size={40} className="text-amber-300" />
            </div>
            <h2 className="text-4xl font-black tracking-tight">Practice Complete!</h2>
            <div className="flex justify-center items-baseline gap-2">
              <span className="text-6xl font-black tracking-tighter">{evaluation.totalMarks}</span>
              <span className="text-2xl font-bold opacity-70">/ 30 Marks</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md inline-flex items-center gap-2 px-6 py-2 rounded-full border border-white/20">
              <Star size={18} className="text-amber-400 fill-current" />
              <span className="font-black tracking-wider">+{evaluation.totalMarks * 15} XP EARNED</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                <CheckCircle size={20} />
              </div>
              Summary Scores
            </h3>
            <div className="space-y-4">
              <ScoreItem label="Personal Response" score={evaluation.summaryScores.personalResponse} max={6} />
              <ScoreItem label="Language & Vocabulary" score={evaluation.summaryScores.language} max={6} />
              <ScoreItem label="Delivery & Tone" score={evaluation.summaryScores.delivery} max={3} />
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
            <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
              <div className="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                <CheckCircle size={20} />
              </div>
              Video Response Scores
            </h3>
            <div className="space-y-4">
              <ScoreItem label="Interaction & Depth" score={evaluation.videoResponseScores.interaction} max={6} />
              <ScoreItem label="Range of Expression" score={evaluation.videoResponseScores.range} max={6} />
              <ScoreItem label="Fluency & Engagement" score={evaluation.videoResponseScores.fluency} max={3} />
            </div>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xl font-black text-slate-800">Examiner's Feedback</h3>
          <p className="text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{evaluation.feedback}</p>
        </div>

        <button 
          onClick={onDone}
          className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 transition-all transform hover:-translate-y-1"
        >
          RETURN TO DASHBOARD
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-12rem)] flex flex-col gap-6 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex justify-between items-center">
        <button 
          onClick={() => setIsStarted(false)} 
          className="text-slate-400 hover:text-slate-600 font-bold flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} /> EXIT PRACTICE
        </button>
        
        <div className="flex items-center gap-4">
          {phase === 'PREPARING' && (
            <div className={`px-4 py-1.5 rounded-full font-black text-sm flex items-center gap-2 ${prepTimeLeft < 60 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-indigo-100 text-indigo-700'}`}>
              <Timer size={16} />
              PREP TIME: {formatTime(prepTimeLeft)}
            </div>
          )}
          
          <div className="bg-amber-100 px-4 py-1.5 rounded-full text-amber-700 font-black text-sm flex items-center gap-2">
            <Play size={14} fill="currentColor" />
            {phase === 'PREPARING' ? 'PREPARATION PHASE' : 'ANSWERING PHASE'}
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Side: Stimulus or Question */}
        <div className="flex-1 bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 relative flex flex-col">
          {phase === 'PREPARING' ? (
            <>
              <div className="bg-indigo-600 p-4 text-white">
                <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">Main Question</p>
                <p className="text-lg font-bold">{content.mainQuestion}</p>
              </div>
              <iframe 
                className="flex-1 w-full"
                src={content.videoUrl} 
                title="Oral Stimulus Video"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                allowFullScreen
              ></iframe>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-8 min-h-full">
                <div className="bg-indigo-50 p-6 rounded-full text-indigo-600">
                  <Mic size={48} className={isRecording ? 'animate-pulse' : ''} />
                </div>
                
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest">
                    {phase === 'ANSWERING_SUMMARY' ? 'Task 1: Main Response' : `Task 2: Question ${currentQuestionIndex + 1}`}
                  </h3>
                  <p className="text-3xl font-black text-slate-800 leading-tight">
                    {phase === 'ANSWERING_SUMMARY' 
                      ? content.mainQuestion 
                      : (currentSubQuestion ? '考官追问：' : '请听考官提问。')}
                  </p>
                  {phase === 'ANSWERING_QUESTIONS' && (
                    <button 
                      onClick={() => speakQuestion(currentSubQuestion || QUESTIONS[currentQuestionIndex])}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-xs font-black transition-all"
                    >
                      <Play size={14} fill="currentColor" /> REPEAT {currentSubQuestion ? 'FOLLOW-UP' : 'QUESTION'}
                    </button>
                  )}
                  <p className="text-slate-500 font-medium">
                    {isRecording ? 'Recording your answer... Press stop when finished.' : 'Press the record button below to start speaking.'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {isCheckingFollowUp ? (
                    <div className="bg-slate-100 text-slate-400 w-20 h-20 rounded-full flex items-center justify-center shadow-inner">
                      <Loader2 size={32} className="animate-spin" />
                    </div>
                  ) : !isRecording ? (
                    <button 
                      onClick={startRecording}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white w-20 h-20 rounded-full flex items-center justify-center shadow-xl shadow-indigo-100 transition-all transform hover:scale-110 active:scale-95"
                    >
                      <Mic size={32} />
                    </button>
                  ) : (
                    <button 
                      onClick={stopRecording}
                      className="bg-rose-600 hover:bg-rose-700 text-white w-20 h-20 rounded-full flex items-center justify-center shadow-xl shadow-rose-100 transition-all transform hover:scale-110 active:scale-95 animate-pulse"
                    >
                      <Square size={32} />
                    </button>
                  )}
                </div>

                <div className="w-full max-w-lg bg-slate-50 p-4 rounded-2xl border border-slate-100 text-left">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Live Transcript</p>
                  <p className="text-slate-600 text-sm font-medium italic min-h-[3rem]">
                    {phase === 'ANSWERING_SUMMARY' ? (
                      <>
                        {summaryTranscript}
                        <span className="text-indigo-400">{interimTranscript}</span>
                        {!summaryTranscript && !interimTranscript && 'Waiting for speech...'}
                      </>
                    ) : (
                      <>
                        {answersTranscripts[currentQuestionIndex]}
                        <span className="text-indigo-400">{interimTranscript}</span>
                        {!answersTranscripts[currentQuestionIndex] && !interimTranscript && 'Waiting for speech...'}
                      </>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {phase === 'PREPARING' && (
            <div className="absolute bottom-6 right-6">
              <button 
                onClick={() => setPhase('ANSWERING_SUMMARY')}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black shadow-xl shadow-indigo-200 transition-all flex items-center gap-2 transform hover:-translate-y-1"
              >
                GO TO ANSWERING <Play size={18} fill="currentColor" />
              </button>
            </div>
          )}
        </div>

        {/* Right Side: Scratch Pad (Always visible) */}
        <div className="w-1/3 flex flex-col bg-white rounded-3xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PenTool size={18} className="text-indigo-600" />
              <h3 className="font-black text-slate-800 text-sm uppercase tracking-wider">Scratch Pad</h3>
            </div>
            {phase === 'PREPARING' && (
              <button 
                onClick={clearNotes}
                className="p-2 text-slate-400 hover:text-rose-500 transition-colors rounded-lg hover:bg-rose-50"
                title="Clear Notes"
              >
                <Trash2 size={18} />
              </button>
            )}
          </div>
          <div className="flex-1 relative">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              readOnly={phase !== 'PREPARING'}
              placeholder="Jot down your ideas here... 
- What do you see?
- How do they feel?
- What is happening?
- Personal experience?"
              className={`w-full h-full p-6 focus:outline-none resize-none font-medium text-slate-700 bg-amber-50/20 selection:bg-amber-100 ${phase !== 'PREPARING' ? 'cursor-default' : ''}`}
            ></textarea>
            <div className="absolute bottom-4 right-4 pointer-events-none opacity-20">
              <PenTool size={48} className="text-slate-400" />
            </div>
          </div>
          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              {notes.length} Characters
            </span>
            {phase === 'PREPARING' && (
              <div className="flex gap-2">
                <button className="p-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:border-indigo-500 hover:text-indigo-600 transition-all shadow-sm">
                  <Save size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ScoreItem: React.FC<{ label: string; score: number; max: number }> = ({ label, score, max }) => (
  <div className="space-y-2">
    <div className="flex justify-between text-sm font-bold">
      <span className="text-slate-600">{label}</span>
      <span className="text-indigo-600">{score} / {max}</span>
    </div>
    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
      <div 
        className="h-full bg-indigo-600 rounded-full transition-all duration-1000"
        style={{ width: `${(score / max) * 100}%` }}
      />
    </div>
  </div>
);

const Trophy: React.FC<{ size?: number; className?: string }> = ({ size = 24, className = "" }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round" 
    className={className}
  >
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 22V18" />
    <path d="M14 22V18" />
    <path d="M18 4H6v7a6 6 0 0 0 12 0V4Z" />
  </svg>
);

export default OralPractice;
