
import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowRight, Play, PenTool, Save, Trash2, Info, Timer, Mic, Square, CheckCircle, Loader2, Star, Award, Volume2, Camera, BookOpen, GitBranch, RotateCcw } from 'lucide-react';
import { getOLevelOralSet } from '../lib/olevelOralSets';
import {
  evaluateOralPerformance,
  generateFollowUpQuestion,
  generateSpeech,
  evaluateOralNotes,
  generateOralAnswerGuide,
  evaluateOralPracticeAnswer,
  generateOralPracticeSummary,
} from '../geminiService';
import { getSpeechVoices, speakTextWithSystemVoice } from '../lib/systemTtsVoices';
import { compressDataUrl } from '../lib/imageUtils';
import {
  OralEvaluation,
  OralSessionMode,
  OralNotesEvaluation,
  OralAnswerGuide,
  OralPracticeAnswerFeedback,
  OralPracticeSummary,
} from '../types';

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

// Ensure AudioContext is managed properly
let audioCtx: AudioContext | null = null;
function initAudio() {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

interface OralPracticeProps {
  onDone: () => void;
  onXpEarned: (marks: number) => void;
  practiceId?: number;
  youtubeUrl?: string;
}

type PracticePhase =
  | 'PREPARING'
  | 'UPLOAD_NOTES'
  | 'NOTES_FEEDBACK'
  | 'READING_ALOUD'
  | 'ANSWERING_SUMMARY'
  | 'ANSWERING_QUESTIONS'
  | 'ANSWER_FEEDBACK'
  | 'EVALUATING'
  | 'RESULT'
  | 'PRACTICE_RESULT';

export type PracticeType = 'O_LEVEL' | 'PSLE';

interface PracticeContent {
  type?: PracticeType;
  mainQuestion: string;
  videoUrl: string;
  questions: string[];
  readingText?: string;
  sourceUrl?: string;
  hasEmbeddedVideo?: boolean;
  title?: string;
}

const PRACTICE_SETS: Record<number, PracticeContent> = {
  // O-Level sets are loaded from lib/olevelOralSets.ts (SO YOUNG 8world collection).
  101: {
    type: 'PSLE',
    mainQuestion: "录像中发生了什么事？",
    readingText: "下课铃声一响，同学们像快乐的小鸟，开心地跑出课室，冲向食堂。食堂里人山人海，大家排队买食物。有的同学在买杂菜饭，有的同学在买面条。休息时间结束了，大家都陆陆续续回到课室。但是有些同学却没有把碗盘整理好，桌面很乱。\n\n这时候，有一位平时很热心的同学小明，看见了清洁工阿姨正辛苦地收拾。他赶快走上前，主动帮助阿姨清理桌面。阿姨感激地对小明笑了。其他同学看到后，也觉得很惭愧，纷纷过来一起帮忙。",
    videoUrl: "https://www.youtube.com/embed/HuFqRniF0r4?autoplay=1",
    questions: [
      "你觉得那位主动帮忙的学生做得好吗？为什么？",
      "你有没有在学校帮助过别人？",
      "你认为学校可以怎样鼓励学生保持食堂清洁？",
    ]
  },
  102: {
    type: 'PSLE',
    mainQuestion: "在日常生活中，我们应该如何节省资源，保护环境呢？",
    readingText: "我们生活的地球资源有限。如果我们不节约使用，资源总有一天会枯竭。在学校里，我们应该养成随手关灯、关风扇的好习惯。在家里，我们可以缩短洗澡的时间，或者把洗过菜的水用来浇花、冲厕所。\n\n除了节省水电，我们还要减少使用塑料袋和一次性餐具。出门购物时，我们可以自备购物袋。只要每个人都做出一份小小的努力，聚沙成塔，我们就能保护美丽的环境，为未来出一分力。",
    videoUrl: "https://www.youtube.com/embed/phOHslTtg6M?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在平时的生活中，你有哪些节省资源的小习惯？",
      "你认为学校可以怎样鼓励学生养成节省资源的好习惯？",
    ]
  },
  103: {
    type: 'PSLE',
    mainQuestion: "我们应该如何关爱身边的弱势群体？",
    readingText: "做一个有爱心的人，能让社会变得更温暖。在邻里之间，我们要互相关怀，主动慰问独居老人。在学校里，我们要关心有需要的同学，给他们鼓励和支持。\n\n哪怕只是一个微笑、一句问候、或者一次小小的让路，都是关爱他人的表现。关爱不仅能帮助别人，也能让自己感到快乐。我们要时刻记得：赠人玫瑰，手有余香。",
    videoUrl: "https://www.youtube.com/embed/ZFQbsN2clH8?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在平时的生活中，你有哪些关爱他人的小动作？",
      "你认为学校可以怎样培养学生的同情心和爱心？",
    ]
  },
  104: {
    type: 'PSLE',
    mainQuestion: "多做运动对身体和心理有哪些好处？",
    readingText: "生命在于运动。经常运动不仅能增强体魄，提高抵抗力，还能让我们心情愉快。我们可以根据自己的兴趣选择运动，比如游泳、打球、跳绳或是骑脚踏车。\n\n每天运动三十分钟，能帮助我们保持健康的体型。运动还能让我们结交志同道合的朋友，学会团队精神。不管学习多忙，我们也要抽出时间去户外活动，呼吸新鲜空气，让身体动起来。",
    videoUrl: "https://www.youtube.com/embed/r8UPj0NFWck?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你最喜欢的运动是什么？为什么？",
      "你认为学校可以怎样鼓励不爱动的学生积极参与体育活动？",
    ]
  },
  105: {
    type: 'PSLE',
    mainQuestion: "邻里之间和睦相处有什么重要性？",
    readingText: "俗话说：远亲不如近邻。邻里之间和睦相处，能让我们的居住环境更加和谐。在走廊遇到邻居时，我们要主动打招呼。当邻居遇到困难时，我们应该伸出援手，互帮互助。\n\n邻里关系就像一把伞，雨天能互相遮挡，晴天能共同分享快乐。我们要多参加民众俱乐部举办的活动，加深邻居之间的了解。只要每个人都多一点沟通，少一点争执，社区就会像一个温馨的大大家庭。",
    videoUrl: "https://www.youtube.com/embed/tbqbVZmblKw?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你和邻居的关系怎么样？谈谈你的经历。",
      "你认为举办邻里活动对增强社区凝聚力有什么帮助？",
    ]
  },
  106: {
    type: 'PSLE',
    mainQuestion: "为什么要提倡“零浪费”的生活方式？",
    readingText: "勤俭节约是中华民族的传统美德。在日常生活中，我们不应该随意浪费资源。在食堂吃饭时，我们要量力而为，尽量把盘里的食物吃光。在买东西时，我们也要考虑清楚是否真的有需要，避免乱买。\n\n我们要学会物尽其用。家里旧了的衣服或玩具，可以捐给慈善机构。我们要减少使用一次性物品，比如塑料吸管和纸盒。如果每个人都能做到减少浪费，我们就能为保护地球环境尽一份力。",
    videoUrl: "https://www.youtube.com/embed/CFdcR4_rYs4?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你是如何处理不再使用的旧物品的？",
      "你认为学校食堂可以采取什么措施来减少厨余？",
    ]
  },
  107: {
    type: 'PSLE',
    mainQuestion: "我们该如何从小事做起，保护我们的环境？",
    readingText: "保护环境是每个公民的责任。我们可以从身边的小事做起，比如不乱丢垃圾，看到地上有纸屑就随手捡起。在公园游玩时，我们也要爱护花草树木。节约水电、回收旧物，这些都是环保的具体表现。\n\n大自然给了我们美丽的风景，我们要懂得珍惜和爱护。如果大家都能养成环保的好习惯，我们的空气就会更清新，水源就会更洁净。为了子孙后代，让我们一起建设一个绿色家园吧！",
    videoUrl: "https://www.youtube.com/embed/HMDmUz9acdE?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在日常生活中，你有做过哪些环保的事情吗？",
      "你认为如何才能有效地提高公众的环保意识？",
    ]
  },
  108: {
    type: 'PSLE',
    mainQuestion: "同学之间互助友爱对学习和生活有什么帮助？",
    readingText: "学校是我们学习的乐园，也是我们成长的地方。同学之间应该和睦相处，互相学习。当同学遇到难题时，我们要热心地帮他讲解。当同学难过时，我们要给予安慰，让他感受到友谊的温暖。\n\n良好的同学关系能让我们在快乐中度过校园生活。大家团一结致，不仅能提高学习效率，还能学会如何与人合作。让我们珍惜和同学在一起的时光，互相关心，共同度过难忘的童年。",
    videoUrl: "https://www.youtube.com/embed/jL2tmF1C9AY?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "如果有同学因为成绩不好而难过，你会怎么安慰他？",
      "你认为班级里发生矛盾时，同学们应该如何化解纠纷？",
    ]
  },
  109: {
    type: 'PSLE',
    mainQuestion: "为什么做人要诚实守信？",
    readingText: "诚实是做人的基本准则。说谎虽然能暂时掩盖某些错误，但它会破坏他人对我们的信任。做错事情并不是最可怕的，可怕的是没有勇气承认错误。只有勇于负责，我们才能从错误中学习，获得进步。\n\n诚实的人会受到他人的尊重，拥有良好的口碑。无论在学习还是游戏中，都要遵守规则。一个守信用的人，大家才愿意和他交朋友。让我们做一个言行一致的人，诚实面对每一天。",
    videoUrl: "https://www.youtube.com/embed/9KQr2FRlJqA?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "如果你不小心打破了学校的东西，但没人看见，你会怎么做？",
      "你认为父母和老师可以如何培养孩子诚实的品格？",
    ]
  },
  110: {
    type: 'PSLE',
    mainQuestion: "在公共场所，我们该注意哪些安全事项？",
    readingText: "安全第一，预防为主。在公共场所活动时，我们要时刻提高警惕。在电动扶梯上，我们要紧握扶手，不要靠在边缘。在地铁站台上，我们要在黄线后排队，不要推挤。看到湿滑的地面时，我们要格外小心，避免滑倒。\n\n我们要了解基本的安全常识，比如火警发生时该如何逃生。家长和老师也要常提醒我们注意安全，避免发生意外伤害。只有养成良好的安全意识，我们才能开开心心地出门，平平安安地回家。",
    videoUrl: "https://www.youtube.com/embed/tOEQAie5C4I?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在学校里，你认为哪些地方潜伏着安全隐患？",
      "你认为举办安全演习对学生有什么教育意义？",
    ]
  },
  111: {
    type: 'PSLE',
    mainQuestion: "敬老爱幼是中华传统文化，你对此有何看法？",
    readingText: "尊老爱幼是中华民族的传统美德。在公共交通工具上，我们要主动给老人、孕妇和小孩让座。回到家里，我们要孝敬祖父母，主动帮他们做家务。在学校里，我们要爱护低年级的弟妹，帮他们解决困难。\n\n长辈为家庭和补社会做出了巨大贡献，值得我们敬重；小孩是未来的希望，需要我们的呵护。关爱老人和小孩能体现一个人的修养。让我们把这份温情传递下去，让社会处处充满爱。",
    videoUrl: "https://www.youtube.com/embed/ksFJcBhjgzQ?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在家里，你是如何表现对长辈的孝心的？",
      "你认为我们可以怎样在学校里推广‘尊老爱幼’的风气？",
    ]
  },
  112: {
    type: 'PSLE',
    mainQuestion: "我们如何才能确保公路安全？",
    readingText: "马路如虎口，公路安全关系到每个人的生命。在过马路时，我们一定要走人行道，不要贪图方便乱穿马路。我们要看清交通信号灯，做到红灯停、绿灯行。尤其是在下雨天，路面湿滑，更要加倍小心。\n\n作为行人，我们过马路时不要低头玩手机，要时刻留意身边的车辆。作为乘客，我们要系好安全带。交通规则是保护我们的防线，每个人都必须自觉遵守。只要大家都多一份细心，少一份冲动，交通事故就能大大减少。",
    videoUrl: "https://www.youtube.com/embed/Zkwqt1Sm_jM?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你有没有见过乱穿马路的行为？你觉得这样做有什么危险？",
      "你认为交通安全教育应该如何从幼儿园阶段就开始吗？",
    ]
  },
  113: {
    type: 'PSLE',
    mainQuestion: "良好的邻里关系对建设和谐社会有何作用？",
    readingText: "好的邻居就像亲人一样。现在大家都住在组屋里，门挨着门，更有机会互相照应。我们要保持安静，不要在休息时间大声喧哗，以免打扰邻居。如果邻居外出，我们可以帮忙留意家门安全，这就是邻里守望相助的精神。\n\n我们要多参加社区组织的烧烤会或运动日，增加彼此的交流。当矛盾发生时，要冷静沟通，互相体谅。一份微笑、一只援手，不仅温暖了邻里的心，也缩短了人与人之间的距离。构建和谐和谐社区，从和谐的邻里关系开始。",
    videoUrl: "https://www.youtube.com/embed/qApAkrys8Mk?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "如果你家的邻居装修很吵，或者堆放杂物挡路，你会怎么处理？",
      "你认为民众俱乐部（Community Club）在增进邻里感情方面起到了什么作用？",
    ]
  },
  114: {
    type: 'PSLE',
    mainQuestion: "户外学习活动对扩展视野有什么好处？",
    readingText: "读万卷书，不如行万里路。户外学习让我们走出课室，亲亲近近大自然。在博物馆里，我们可以近距离观察历史文物；在植物园中，我们可以学习各种花草树木的知识。户外学习比书本学习更生动、更有趣，能激发我们的好奇心。\n\n户外活动不仅能让我们学到新知识，还能锻炼我们的观察能力。大家在一起探索未知世界，能增强团队凝聚力。我们要珍惜每一次户外学习的机会，认真记录，用心体会。大自然就是我们最好的课堂。",
    videoUrl: "https://www.youtube.com/embed/sBJLe51jjhs?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你最深刻的一次校外教学考察（Learning Journey）是去哪里？学到了什么？",
      "你认为户外学习和课室教学，哪一种更能让你专注学习？",
    ]
  },
  115: {
    type: 'PSLE',
    mainQuestion: "节约用水的重要性体现在哪里？",
    readingText: "水是生命之源，每一滴水都来之不易。虽然新加坡的科技很先进，但资源依然珍贵。我们要养成节约用水的好习惯，刷牙时要关上水龙头，不要让水一直流。洗澡的时间不宜太长，要学会缩短洗澡的时间。\n\n我们可以把洗菜、洗澡的水收集起来冲厕所或拖地。作为国家的一份子，我们要有危机意识。节约用水不仅是省钱，更是对未来负责。保护水资源，就是保护我们的地球，让我们从今天就开始行动吧！",
    videoUrl: "https://www.youtube.com/embed/4sngExXDvW0?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "在日常生活中，你还知道哪些省水的小贴士？",
      "你认为政府可以如何进一步宣传全民省水运动？",
    ]
  },
  116: {
    type: 'PSLE',
    mainQuestion: "行人应该如何遵守马路规则以确保安全？",
    readingText: "公路安全，人人有责。我们要养成自觉遵守交通规则的好习惯。过马路时，我们要选择行人天桥或是斑马线。即使在没有车的时候，也绝对不能乱闯红灯。这种守法精神反映了一个国民的素质，也是对自己生命负责的表现。\n\n作为学生，我们要带头做好榜样。看到年龄更小的学弟学妹在乱跑，要及时提醒。看到老人家行动不便，要主动搀扶他们过马路。大家齐心协力维护公路秩序，就能营造一个安全、文明的交通环境。",
    videoUrl: "https://www.youtube.com/embed/LmqWPYVIiSQ?autoplay=1",
    questions: [
      "录像中发生了什么事？",
      "你认为手机分心过马路，是否应该立法惩罚？",
      "你认为可以通过哪些有趣的方式，让交通安全教育深入人心？",
    ]
  }
};

/** Normalize for comparing oral-report vs free questions. */
function normalizeOralQuestion(text: string): string {
  return text.replace(/\s+/g, '').trim().toLowerCase();
}

/**
 * Free questions (自由提问) come after the oral report (口头报告).
 * Never reuse the main video/report question; shuffle like an examiner.
 */
function buildExaminerQuestions(content: PracticeContent): string[] {
  const mainKey = normalizeOralQuestion(content.mainQuestion);
  const distinct = content.questions.filter(
    (q) => normalizeOralQuestion(q) !== mainKey,
  );
  const pool = distinct.length > 0 ? [...distinct] : [...content.questions];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

const OralPractice: React.FC<OralPracticeProps> = ({ onDone, onXpEarned, practiceId = 1, youtubeUrl }) => {
  const olevelSet = getOLevelOralSet(practiceId);
  const content: PracticeContent = youtubeUrl ? {
    type: 'O_LEVEL',
    mainQuestion: "请根据视频内容回答问题。",
    videoUrl: youtubeUrl.replace("watch?v=", "embed/"),
    questions: ["这是视频的主题是什么？", "对于视频内容，你有什么看法？", "你从视频中学到了什么？"],
    readingText: "",
    hasEmbeddedVideo: true,
  } : olevelSet ? {
    type: 'O_LEVEL',
    title: olevelSet.title,
    mainQuestion: olevelSet.mainQuestion,
    videoUrl: olevelSet.videoUrl,
    questions: olevelSet.questions,
    sourceUrl: olevelSet.sourceUrl,
    hasEmbeddedVideo: olevelSet.hasEmbeddedVideo,
  } : (PRACTICE_SETS[practiceId] || PRACTICE_SETS[101]);

  const [isStarted, setIsStarted] = useState(false);
  const [phase, setPhase] = useState<PracticePhase>('PREPARING');
  const [notes, setNotes] = useState('');
  const [prepTimeLeft, setPrepTimeLeft] = useState(600); // 10 minutes
  const [isRecording, setIsRecording] = useState(false);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [summaryTranscript, setSummaryTranscript] = useState('');
  /** Free questions after oral report — never duplicates mainQuestion. */
  const [examinerQuestions, setExaminerQuestions] = useState<string[]>([]);
  const [answersTranscripts, setAnswersTranscripts] = useState<string[]>([]);
  const [readingTranscript, setReadingTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [task1TimeLeft, setTask1TimeLeft] = useState(120); // 2 minutes for Task 1
  const [subQuestionCount, setSubQuestionCount] = useState(0);
  const [currentSubQuestion, setCurrentSubQuestion] = useState<string | null>(null);
  const [isCheckingFollowUp, setIsCheckingFollowUp] = useState(false);
  const [evaluation, setEvaluation] = useState<OralEvaluation | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [prepTab, setPrepTab] = useState<'READING' | 'VIDEO'>('READING');
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [useAIVoice, setUseAIVoice] = useState(false);
  const [sessionMode, setSessionMode] = useState<OralSessionMode>('MOCK_EXAM');
  const [notesImage, setNotesImage] = useState<string | null>(null);
  const [notesEvaluation, setNotesEvaluation] = useState<OralNotesEvaluation | null>(null);
  const [answerGuide, setAnswerGuide] = useState<OralAnswerGuide | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<OralPracticeAnswerFeedback | null>(null);
  const [practiceSummary, setPracticeSummary] = useState<OralPracticeSummary | null>(null);
  const [feedbackContext, setFeedbackContext] = useState<{ phase: 'ANSWERING_SUMMARY' | 'ANSWERING_QUESTIONS'; questionIndex: number } | null>(null);
  const [attemptCounts, setAttemptCounts] = useState<Record<string, number>>({});
  const notesInputRef = useRef<HTMLInputElement>(null);

  const isGuided = sessionMode === 'GUIDED_PRACTICE';

  const getNextPhaseAfterPrep = (): PracticePhase => {
    if (isGuided) return 'UPLOAD_NOTES';
    return content.type === 'PSLE' ? 'READING_ALOUD' : 'ANSWERING_SUMMARY';
  };

  const getNextPhaseAfterNotes = (): PracticePhase => {
    return content.type === 'PSLE' ? 'READING_ALOUD' : 'ANSWERING_SUMMARY';
  };

  const recognitionRef = useRef<any>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isStarted && phase === 'PREPARING' && prepTimeLeft > 0) {
      timer = setInterval(() => {
        setPrepTimeLeft(prev => {
          if (prev <= 1) {
            setPhase(getNextPhaseAfterPrep());
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isStarted, phase, prepTimeLeft]);

  useEffect(() => {
    if (phase === 'ANSWERING_QUESTIONS' && examinerQuestions[currentQuestionIndex]) {
      speakQuestion(examinerQuestions[currentQuestionIndex]);
    }
  }, [phase, currentQuestionIndex]);

  const speakWithSystemVoice = async (text: string) => {
    if (window.speechSynthesis.getVoices().length === 0) {
      await getSpeechVoices();
    }

    speakTextWithSystemVoice(text, {
      onEnd: () => setIsPlayingAudio(false),
      onError: (errorType) => {
        if (errorType !== 'not-allowed') {
          console.warn('System TTS error:', errorType);
        }
      },
    });
  };

  const speakQuestion = async (text: string) => {
    // Stop any existing audio
    if (audioSourceRef.current) {
      try {
        audioSourceRef.current.stop();
      } catch (e) {}
      audioSourceRef.current = null;
    }
    
    setIsPlayingAudio(true);
    
    if (!useAIVoice) {
      await speakWithSystemVoice(text);
      return;
    }

    try {
      const base64 = await generateSpeech(text);
      
      if (base64 === '__BROWSER_TTS__') {
        await speakWithSystemVoice(text);
        return;
      }

      const audioBytes = decodeBase64(base64);
      const ctx = initAudio();
      const audioBuffer = await decodeAudioData(audioBytes, ctx, 24000, 1);
      
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => setIsPlayingAudio(false);
      audioSourceRef.current = source;
      source.start();
    } catch (err: any) {
      console.error("Audio playback error:", err);
      // Fallback to browser TTS if decoding fails
      await speakWithSystemVoice(text);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
    } catch (e) {
      console.warn("Failed to get microphone stream:", e);
    }

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
        if (phase === 'READING_ALOUD') {
          setReadingTranscript(prev => prev + finalTranscript);
        } else if (phase === 'ANSWERING_SUMMARY') {
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
        alert("Microphone access was denied. Please allow it in your browser. If you get this error in the preview, please click 'Open in new tab' at the top right.");
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
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
    }
    setIsRecording(false);
    setInterimTranscript('');

    if (isGuided && (phase === 'ANSWERING_SUMMARY' || phase === 'ANSWERING_QUESTIONS')) {
      await evaluateCurrentAnswer();
      return;
    }

    await handleNext();
  };

  const loadAnswerGuide = async (notesFeedbackText?: string) => {
    if (answerGuide) return answerGuide;
    const guide = await generateOralAnswerGuide({
      practiceType: content.type || 'O_LEVEL',
      mainQuestion: content.mainQuestion,
      questions: examinerQuestions,
      readingText: content.readingText,
      notesFeedback: notesFeedbackText,
    });
    setAnswerGuide(guide);
    return guide;
  };

  const evaluateCurrentAnswer = async () => {
    setIsProcessing(true);
    try {
      const isSummary = phase === 'ANSWERING_SUMMARY';
      const question = isSummary ? content.mainQuestion : examinerQuestions[currentQuestionIndex];
      const transcript = isSummary ? summaryTranscript : answersTranscripts[currentQuestionIndex];
      const attemptKey = isSummary ? 'summary' : `q${currentQuestionIndex}`;
      const attemptNumber = (attemptCounts[attemptKey] || 0) + 1;

      const feedback = await evaluateOralPracticeAnswer({
        practiceType: content.type || 'O_LEVEL',
        questionLabel: isSummary ? '主题回答 / 录像总结' : `问题 ${currentQuestionIndex + 1}`,
        question,
        transcript,
        attemptNumber,
        isSummary,
      });

      setAttemptCounts((prev) => ({ ...prev, [attemptKey]: attemptNumber }));
      setAnswerFeedback(feedback);
      setFeedbackContext({
        phase: isSummary ? 'ANSWERING_SUMMARY' : 'ANSWERING_QUESTIONS',
        questionIndex: currentQuestionIndex,
      });
      setPhase('ANSWER_FEEDBACK');
    } catch (error) {
      console.error(error);
      alert('无法评估回答，请重试。');
    } finally {
      setIsProcessing(false);
    }
  };

  const retryCurrentAnswer = () => {
    if (!feedbackContext) return;
    setAnswerFeedback(null);
    if (feedbackContext.phase === 'ANSWERING_SUMMARY') {
      setSummaryTranscript('');
      setPhase('ANSWERING_SUMMARY');
    } else {
      setAnswersTranscripts((prev) => {
        const next = [...prev];
        next[feedbackContext.questionIndex] = '';
        return next;
      });
      setCurrentQuestionIndex(feedbackContext.questionIndex);
      setPhase('ANSWERING_QUESTIONS');
    }
  };

  const continueAfterPassedAnswer = async () => {
    if (!feedbackContext) return;
    setAnswerFeedback(null);

    if (feedbackContext.phase === 'ANSWERING_SUMMARY') {
      setPhase('ANSWERING_QUESTIONS');
      setCurrentQuestionIndex(0);
      return;
    }

    if (currentQuestionIndex < examinerQuestions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setPhase('ANSWERING_QUESTIONS');
    } else {
      await submitGuidedSummary();
    }
  };

  const handleNotesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = async () => {
      if (!reader.result) return;
      try {
        const compressed = await compressDataUrl(reader.result as string);
        setNotesImage(compressed);
      } catch {
        setNotesImage(reader.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const submitNotesForEvaluation = async () => {
    if (!notesImage) return;
    setIsProcessing(true);
    try {
      const base64 = notesImage.includes(',') ? notesImage.split(',')[1] : notesImage;
      const result = await evaluateOralNotes({
        imageBase64: base64,
        practiceType: content.type || 'O_LEVEL',
        mainQuestion: content.mainQuestion,
        readingText: content.readingText,
      });
      setNotesEvaluation(result);
      setPhase('NOTES_FEEDBACK');
    } catch (error) {
      alert('笔记评估失败，请重试。');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const proceedFromNotesFeedback = async () => {
    setIsProcessing(true);
    try {
      await loadAnswerGuide(notesEvaluation?.feedback);
      setPhase(getNextPhaseAfterNotes());
    } catch (error) {
      alert('无法生成答题引导，请重试。');
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const submitGuidedSummary = async () => {
    setPhase('EVALUATING');
    setIsProcessing(true);
    try {
      const result = await generateOralPracticeSummary({
        practiceType: content.type || 'O_LEVEL',
        mainQuestion: content.mainQuestion,
        questions: examinerQuestions,
        summaryTranscript,
        answersTranscripts,
        readingTranscript,
      });
      setPracticeSummary(result);
      const passedCount = Object.values(attemptCounts).length;
      onXpEarned(Math.max(15, passedCount * 10));
      setPhase('PRACTICE_RESULT');
    } catch (error) {
      alert('生成总结失败，请重试。');
      console.error(error);
      setPhase('ANSWERING_QUESTIONS');
    } finally {
      setIsProcessing(false);
    }
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

    if (phase === 'READING_ALOUD') {
      setPhase('ANSWERING_SUMMARY');
    } else if (phase === 'ANSWERING_SUMMARY') {
      setSubQuestionCount(0);
      setCurrentSubQuestion(null);
      setPhase('ANSWERING_QUESTIONS');
      setCurrentQuestionIndex(0);
    } else if (phase === 'ANSWERING_QUESTIONS') {
      if (isGuided) {
        setSubQuestionCount(0);
        setCurrentSubQuestion(null);
        if (currentQuestionIndex < examinerQuestions.length - 1) {
          setCurrentQuestionIndex((prev) => prev + 1);
        } else {
          await submitGuidedSummary();
        }
        return;
      }

      // Check for follow-up if we haven't reached the limit
      if (subQuestionCount < 2) {
        setIsCheckingFollowUp(true);
        try {
          const followUp = await generateFollowUpQuestion(
            currentSubQuestion || examinerQuestions[currentQuestionIndex],
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

      if (currentQuestionIndex < examinerQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        await submitForEvaluation();
      }
    }
  };

  const handleNextRef = useRef(handleNext);
  handleNextRef.current = handleNext;

  const submitForEvaluation = async () => {
    setPhase('EVALUATING');
    setIsProcessing(true);
    try {
      const result = await evaluateOralPerformance({
        practiceType: content.type || 'O_LEVEL',
        mainQuestion: content.mainQuestion,
        summaryTranscript,
        answersTranscripts,
        questions: examinerQuestions,
        readingTranscript,
        readingTextOrigin: content.readingText
      });
      setEvaluation(result);
      onXpEarned(typeof result.totalMarks === 'number' ? result.totalMarks : 0);
      setPhase('RESULT');
    } catch (error) {
      alert("Evaluation failed. Please try again.");
      console.error(error);
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
            handleNextRef.current();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRecording, phase]);

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
    const freeQs = buildExaminerQuestions(content);
    setExaminerQuestions(freeQs);
    setAnswersTranscripts(freeQs.map(() => ''));
    setCurrentQuestionIndex(0);
    setCurrentSubQuestion(null);
    setSubQuestionCount(0);
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
            <p className="text-slate-500">Choose a mode, then watch the video stimulus to prepare.</p>
          </div>
          
          <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
            <div className="space-y-3">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest text-left">Select Mode</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => setSessionMode('MOCK_EXAM')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${sessionMode === 'MOCK_EXAM' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="font-black text-slate-800">模拟考试模式</p>
                  <p className="text-xs text-slate-500 mt-1">完整考试流程，最后统一评分</p>
                </button>
                <button
                  onClick={() => setSessionMode('GUIDED_PRACTICE')}
                  className={`p-4 rounded-2xl border-2 text-left transition-all ${sessionMode === 'GUIDED_PRACTICE' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="font-black text-slate-800">练习模式</p>
                  <p className="text-xs text-slate-500 mt-1">笔记反馈、答题引导、逐题改进</p>
                </button>
              </div>
            </div>

            <div className="text-left space-y-4">
              <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-2xl">
                <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600 shrink-0">
                  <Info size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">How it works</h4>
                  <p className="text-slate-600 text-xs leading-relaxed">
                    {sessionMode === 'MOCK_EXAM' ? (
                      <>
                        1. Click &quot;Start Practice&quot; to begin.<br/>
                        2. You have 10 minutes to watch the stimulus.<br/>
                        3. After preparation, complete the oral exam flow.<br/>
                        4. Receive a final score and examiner feedback.
                      </>
                    ) : (
                      <>
                        1. Watch the video and take notes on paper.<br/>
                        2. Upload a photo of your notes for AI feedback.<br/>
                        3. Get a mind-map guide and useful phrases before answering.<br/>
                        4. Retry each answer until it passes, then see model answers.
                      </>
                    )}
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
          <h2 className="text-2xl font-black text-slate-800">
            {isGuided ? 'Generating Learning Summary...' : 'Evaluating Performance...'}
          </h2>
          <p className="text-slate-500 font-medium">
            {isGuided
              ? 'AI tutor is preparing model answers and vocabulary summary.'
              : 'Our AI examiner is marking your summary and responses based on the rubric.'}
          </p>
        </div>
      </div>
    );
  }

  if (phase === 'UPLOAD_NOTES') {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-8 animate-in fade-in duration-500">
        <div className="text-center space-y-3">
          <div className="bg-emerald-100 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto text-emerald-600">
            <Camera size={36} />
          </div>
          <h2 className="text-3xl font-black text-slate-800">Upload Your Notes</h2>
          <p className="text-slate-500">Take a photo of the notes you wrote while watching the video.</p>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          {notesImage ? (
            <img src={notesImage} alt="Notes" className="w-full rounded-2xl border border-slate-200" />
          ) : (
            <button
              onClick={() => notesInputRef.current?.click()}
              className="w-full aspect-[4/3] border-4 border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center text-slate-400 hover:border-emerald-300 hover:bg-emerald-50/30 transition-all"
            >
              <Camera size={40} />
              <span className="font-black mt-3">TAKE / UPLOAD PHOTO</span>
            </button>
          )}
          <input ref={notesInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleNotesUpload} />
          <div className="flex gap-3">
            {notesImage && (
              <button onClick={() => setNotesImage(null)} className="flex-1 py-4 border-2 border-slate-200 rounded-2xl font-bold text-slate-500">
                RETAKE
              </button>
            )}
            <button
              disabled={!notesImage || isProcessing}
              onClick={submitNotesForEvaluation}
              className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white rounded-2xl font-black"
            >
              {isProcessing ? 'ANALYSING...' : 'SUBMIT NOTES'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'NOTES_FEEDBACK' && notesEvaluation) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-slate-800">Notes Feedback</h2>
          <p className="text-slate-500">Review your note-taking before answering.</p>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="flex gap-4">
            <div className="flex-1 bg-indigo-50 p-4 rounded-2xl text-center">
              <p className="text-xs font-black text-indigo-400 uppercase">Score</p>
              <p className="text-3xl font-black text-indigo-700">{notesEvaluation.score}/10</p>
            </div>
            <div className="flex-1 bg-emerald-50 p-4 rounded-2xl text-center">
              <p className="text-xs font-black text-emerald-400 uppercase">Organized</p>
              <p className="text-lg font-black text-emerald-700">{notesEvaluation.isOrganized ? '✓ Yes' : '✗ Needs work'}</p>
            </div>
            <div className="flex-1 bg-amber-50 p-4 rounded-2xl text-center">
              <p className="text-xs font-black text-amber-400 uppercase">Complete</p>
              <p className="text-lg font-black text-amber-700">{notesEvaluation.isComplete ? '✓ Yes' : '✗ Needs work'}</p>
            </div>
          </div>
          <p className="text-slate-700 leading-relaxed">{notesEvaluation.feedback}</p>
          {notesEvaluation.strengths.length > 0 && (
            <div>
              <h4 className="font-black text-emerald-700 mb-2">Strengths</h4>
              <ul className="list-disc list-inside text-slate-600 space-y-1">
                {notesEvaluation.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          {notesEvaluation.improvements.length > 0 && (
            <div>
              <h4 className="font-black text-amber-700 mb-2">Improvements</h4>
              <ul className="list-disc list-inside text-slate-600 space-y-1">
                {notesEvaluation.improvements.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
          <button
            disabled={isProcessing}
            onClick={proceedFromNotesFeedback}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black"
          >
            {isProcessing ? 'PREPARING GUIDE...' : 'START ANSWERING'}
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'ANSWER_FEEDBACK' && answerFeedback) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-6 animate-in fade-in duration-500">
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-black text-slate-800">Answer Feedback</h2>
          <p className={`font-bold ${answerFeedback.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
            {answerFeedback.passed ? '✓ Passed — good job!' : 'Keep trying — you can do better!'}
          </p>
        </div>
        <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
          <div className="text-center">
            <span className="text-4xl font-black text-indigo-600">{answerFeedback.score}</span>
            <span className="text-slate-400 font-bold"> / 10</span>
          </div>
          <p className="text-slate-700 leading-relaxed">{answerFeedback.feedback}</p>
          {answerFeedback.improvements.length > 0 && (
            <ul className="list-disc list-inside text-slate-600 space-y-1">
              {answerFeedback.improvements.map((item, i) => <li key={i}>{item}</li>)}
            </ul>
          )}
          {answerFeedback.suggestedRevision && (
            <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100">
              <p className="text-xs font-black text-indigo-400 uppercase mb-2">Suggested revision</p>
              <p className="text-indigo-900">{answerFeedback.suggestedRevision}</p>
            </div>
          )}
          <div className="flex gap-3">
            {!answerFeedback.passed && (
              <button onClick={retryCurrentAnswer} className="flex-1 py-4 border-2 border-amber-300 text-amber-700 rounded-2xl font-black flex items-center justify-center gap-2">
                <RotateCcw size={18} /> TRY AGAIN
              </button>
            )}
            {answerFeedback.passed && (
              <button onClick={continueAfterPassedAnswer} className="flex-1 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black">
                CONTINUE
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'PRACTICE_RESULT' && practiceSummary) {
    return (
      <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-8 duration-700">
        <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-[2.5rem] p-10 text-white text-center">
          <BookOpen size={48} className="mx-auto mb-4 opacity-90" />
          <h2 className="text-4xl font-black">Practice Complete!</h2>
          <p className="mt-2 opacity-90">Here are model answers and useful language for this topic.</p>
        </div>
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xl font-black text-slate-800">Overall Feedback</h3>
          <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{practiceSummary.overallFeedback}</p>
        </div>
        <div className="bg-indigo-50 p-8 rounded-[2rem] border border-indigo-100 space-y-4">
          <h3 className="text-xl font-black text-indigo-900">Model Answer (主题回答)</h3>
          <p className="text-indigo-800 leading-relaxed whitespace-pre-wrap">{practiceSummary.modelAnswer}</p>
        </div>
        {practiceSummary.modelAnswersByQuestion?.map((ans, i) => (
          <div key={i} className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
            <h4 className="font-black text-slate-700 mb-2">Q{i + 1}: {examinerQuestions[i]}</h4>
            <p className="text-slate-600 whitespace-pre-wrap">{ans}</p>
          </div>
        ))}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
            <h3 className="font-black text-emerald-900 mb-3">Useful Phrases 词语</h3>
            <ul className="list-disc list-inside text-emerald-800 space-y-1">
              {practiceSummary.usefulPhrases.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
          <div className="bg-amber-50 p-6 rounded-2xl border border-amber-100">
            <h3 className="font-black text-amber-900 mb-3">Useful Sentences 句子</h3>
            <ul className="list-disc list-inside text-amber-800 space-y-1">
              {practiceSummary.usefulSentences.map((s, i) => <li key={i}>{s}</li>)}
            </ul>
          </div>
        </div>
        {practiceSummary.sentencePatterns?.length > 0 && (
          <div className="bg-violet-50 p-6 rounded-2xl border border-violet-100">
            <h3 className="font-black text-violet-900 mb-3">Sentence Patterns 句式</h3>
            <ul className="list-disc list-inside text-violet-800 space-y-2">
              {practiceSummary.sentencePatterns.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
          </div>
        )}
        <button onClick={onDone} className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black text-lg">
          RETURN TO DASHBOARD
        </button>
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
              <span className="text-2xl font-bold opacity-70">/ {evaluation.maxMarks || 40} Marks</span>
            </div>
            <div className="bg-white/10 backdrop-blur-md inline-flex items-center gap-2 px-6 py-2 rounded-full border border-white/20">
              <Star size={18} className="text-amber-400 fill-current" />
              <span className="font-black tracking-wider">+{evaluation.totalMarks * 15} XP EARNED</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {evaluation.categories?.map((cat, i) => (
            <div key={i} className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-6">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2">
                <div className={`p-2 rounded-lg ${i % 2 === 0 ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                  <CheckCircle size={20} />
                </div>
                {cat.title}
              </h3>
              <div className="space-y-4">
                {cat.items.map((item, j) => (
                  <ScoreItem key={j} label={item.label} score={item.score} max={item.max} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xl font-black text-slate-800">Examiner's Feedback</h3>
          <p className="text-slate-600 leading-relaxed font-medium whitespace-pre-wrap">{evaluation.feedback}</p>
        </div>

        {evaluation.modelAnswer && (
          <div className="bg-indigo-50 p-8 rounded-[2rem] border border-indigo-100 shadow-sm space-y-4">
            <h3 className="text-xl font-black text-indigo-900">Model Answer (参考答案)</h3>
            <p className="text-indigo-800 leading-relaxed font-medium whitespace-pre-wrap">{evaluation.modelAnswer}</p>
          </div>
        )}

        {evaluation.goodWords && evaluation.goodWords.length > 0 && (
          <div className="bg-emerald-50 p-8 rounded-[2rem] border border-emerald-100 shadow-sm space-y-4">
            <h3 className="text-xl font-black text-emerald-900">Vocabulary & Sentences (好词好句推荐)</h3>
            <ul className="list-disc list-inside text-emerald-800 leading-relaxed font-medium space-y-2">
              {evaluation.goodWords.map((word, idx) => (
                <li key={idx} className="whitespace-pre-wrap">{word}</li>
              ))}
            </ul>
          </div>
        )}

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
    <div className="w-full max-w-6xl mx-auto h-[calc(100vh-12rem)] flex flex-col gap-4 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button 
          onClick={() => setIsStarted(false)} 
          className="text-slate-400 hover:text-slate-600 font-bold flex items-center gap-2 transition-colors"
        >
          <ArrowLeft size={20} /> EXIT PRACTICE
        </button>
        
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          {phase === 'PREPARING' && (
            <div className={`px-4 py-1.5 rounded-full font-black text-sm flex items-center gap-2 ${prepTimeLeft < 60 ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-indigo-100 text-indigo-700'}`}>
              <Timer size={16} />
              PREP TIME: {formatTime(prepTimeLeft)}
            </div>
          )}
          
          <div className="bg-amber-100 px-4 py-1.5 rounded-full text-amber-700 font-black text-sm flex items-center gap-2">
            <Play size={14} fill="currentColor" />
            {isGuided ? '练习模式' : '模拟考试'} · {phase === 'PREPARING' ? 'PREPARATION' : 'ANSWERING'}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500 hidden sm:inline">Voice</span>
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button
                onClick={() => setUseAIVoice(false)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${!useAIVoice ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}
              >
                SYSTEM
              </button>
              <button
                onClick={() => setUseAIVoice(true)}
                className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${useAIVoice ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'}`}
              >
                AI
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left Side: Stimulus or Question */}
        <div className="flex-1 bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 relative flex flex-col">
          {phase === 'PREPARING' ? (
            <>
              <div className="bg-indigo-600 p-4 text-white flex flex-wrap justify-between items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">
                    {content.type === 'PSLE' ? 'Topic Overview' : 'Main Question'}
                  </p>
                  <p className="text-lg font-bold">
                    {content.type === 'PSLE' ? "请看下面的短文和录像" : content.mainQuestion}
                  </p>
                </div>
                {content.type === 'PSLE' && (
                  <div className="flex bg-indigo-700/50 p-1 rounded-xl shrink-0">
                    <button
                      onClick={() => setPrepTab('READING')}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${prepTab === 'READING' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:text-white'}`}
                    >
                      1. Reading
                    </button>
                    <button
                      onClick={() => setPrepTab('VIDEO')}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-colors ${prepTab === 'VIDEO' ? 'bg-white text-indigo-600 shadow-sm' : 'text-indigo-100 hover:text-white'}`}
                    >
                      2. Video
                    </button>
                  </div>
                )}
              </div>
              {content.type === 'PSLE' ? (
                <div className="flex-1 flex flex-col overflow-hidden bg-slate-50 relative min-h-0">
                  {prepTab === 'READING' ? (
                    <div className="flex-1 p-8 overflow-y-auto animate-in fade-in duration-300">
                      <div className="max-w-2xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6 border-b border-slate-100 pb-4">Reading Passage 朗读篇章</h4>
                        <p className="text-slate-800 text-lg sm:text-xl leading-[2.5] font-medium whitespace-pre-wrap">{content.readingText}</p>
                      </div>
                      <div className="mt-8 flex justify-end max-w-2xl mx-auto">
                        <button 
                          onClick={() => setPrepTab('VIDEO')} 
                          className="bg-indigo-100 text-indigo-700 px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-200 transition-colors"
                        >
                          Next: Watch Video <ArrowRight size={18} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col h-full animate-in fade-in duration-300 relative min-h-0">
                      <div className="bg-slate-50 p-3 border-b border-slate-200 flex justify-between items-center z-10 shrink-0">
                        <button 
                          onClick={() => setPrepTab('READING')} 
                          className="text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-2 text-sm transition-colors"
                        >
                          <ArrowLeft size={16} /> Back to Reading
                        </button>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest hidden sm:inline-block">Video Stimulus 录像短片</span>
                        <div className="w-24"></div>
                      </div>
                      <iframe 
                        className="flex-1 w-full min-h-0"
                        src={content.videoUrl} 
                        title="Oral Stimulus Video"
                        frameBorder="0"
                        allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                        allowFullScreen
                      ></iframe>
                    </div>
                  )}
                </div>
              ) : (
                <iframe 
                  className="flex-1 w-full min-h-0"
                  src={content.videoUrl} 
                  title="Oral Stimulus Video"
                  frameBorder="0"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                ></iframe>
              )}
              <div className="shrink-0 border-t border-slate-100 bg-white px-4 py-3 flex justify-end">
                <button 
                  onClick={() => setPhase(getNextPhaseAfterPrep())}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl font-black shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
                >
                  {isGuided ? 'UPLOAD NOTES' : `GO TO ${content.type === 'PSLE' ? 'READING ALOUD' : 'ANSWERING'}`} <Play size={18} fill="currentColor" />
                </button>
              </div>
            </>
          ) : phase === 'READING_ALOUD' ? (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center p-12 text-center space-y-8 min-h-full">
                
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest">
                    Part 1: Reading Aloud 朗读篇章
                  </h3>
                  <div className="max-w-2xl text-left bg-slate-50 p-6 rounded-2xl border border-slate-200">
                    <p className="text-lg font-medium text-slate-800 leading-loose whitespace-pre-wrap">
                      {content.readingText}
                    </p>
                  </div>
                  <p className="text-slate-500 font-medium">
                    {isRecording ? 'Recording your reading... Press stop when finished.' : 'Press the record button below to start reading.'}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  {!isRecording ? (
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
                    {readingTranscript}
                    <span className="text-indigo-400">{interimTranscript}</span>
                    {!readingTranscript && !interimTranscript && 'Waiting for speech...'}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div className="flex flex-col items-center justify-center p-12 text-center space-y-8 min-h-full">
                
                <div className="space-y-4">
                  <h3 className="text-xs font-black text-indigo-500 uppercase tracking-widest">
                    {phase === 'ANSWERING_SUMMARY' ? (content.type === 'PSLE' ? 'Part 2: Video Conversation 录像会话' : '第一部分：口头报告') : (content.type === 'PSLE' ? `Task 2: Question ${currentQuestionIndex + 1}` : `第二部分：讨论 · 问题 ${currentQuestionIndex + 1}`)}
                  </h3>
                  <p className="text-3xl font-black text-slate-800 leading-tight">
                    {phase === 'ANSWERING_SUMMARY' 
                      ? content.mainQuestion 
                      : (currentSubQuestion ? '考官追问：' : '请听考官提问。')}
                  </p>
                  {phase === 'ANSWERING_QUESTIONS' && (
                    <button 
                      onClick={() => speakQuestion(currentSubQuestion || examinerQuestions[currentQuestionIndex])}
                      disabled={isPlayingAudio}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full text-xs font-black transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isPlayingAudio ? (
                         <><Volume2 size={14} className="animate-pulse" /> PLAYING...</>
                      ) : (
                         <><Play size={14} fill="currentColor" /> REPEAT {currentSubQuestion ? 'FOLLOW-UP' : 'QUESTION'}</>
                      )}
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
        </div>

        {isGuided && answerGuide && (phase === 'ANSWERING_SUMMARY' || phase === 'ANSWERING_QUESTIONS' || phase === 'READING_ALOUD') && (
          <div className="w-80 shrink-0 bg-white rounded-3xl border border-slate-200 shadow-lg overflow-hidden flex flex-col max-h-full hidden lg:flex">
            <div className="bg-emerald-600 p-4 text-white">
              <div className="flex items-center gap-2 font-black text-sm">
                <GitBranch size={16} /> 答题引导
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Mind Map 思维导图</p>
                <pre className="text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">{answerGuide.mindMapOutline}</pre>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Useful Phrases 词语</p>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  {answerGuide.usefulPhrases.map((p, i) => <li key={i}>{p}</li>)}
                </ul>
              </div>
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Useful Sentences 句子</p>
                <ul className="list-disc list-inside text-slate-600 space-y-1">
                  {answerGuide.usefulSentences.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
              <div className="bg-amber-50 p-3 rounded-xl border border-amber-100 text-amber-900 text-xs leading-relaxed">
                {answerGuide.tips}
              </div>
            </div>
          </div>
        )}
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
