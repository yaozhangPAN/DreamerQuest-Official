import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RubricScore, OralEvaluation, OralNotesEvaluation, OralAnswerGuide, OralPracticeAnswerFeedback, OralPracticeSummary } from "./types";

const FLASH_MODEL = 'gemini-3.5-flash';
const PRO_MODEL = 'gemini-3.1-pro-preview';
const TTS_MODEL = 'gemini-2.5-flash-preview-tts';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
console.log("Gemini AI initialized with API Key present:", !!process.env.GEMINI_API_KEY);

/**
 * Helper to wrap API calls with retry for quota errors (429/RESOURCE_EXHAUSTED).
 * Uses exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    console.error("Gemini API Error details:", error);
    const errorMsg = error?.message || "";
    // Check for standard 429 error or RESOURCE_EXHAUSTED status
    if (errorMsg.includes('429') || errorMsg.includes('RESOURCE_EXHAUSTED') || (error?.status === "RESOURCE_EXHAUSTED")) {
      if (retries > 0) {
        // Backoff: 1st retry ~2s, 2nd ~4s, 3rd ~8s
        const delay = (4 - retries) * 2000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return withRetry(fn, retries - 1);
      }
    }
    throw error;
  }
}

/**
 * Extracts the assignment topic or instructions from an image.
 */
export async function extractTopicFromImage(imageB64s: string[]): Promise<string> {
  return withRetry(async () => {
    const parts = imageB64s.map(base64 => ({
      inlineData: {
        mimeType: 'image/jpeg',
        data: base64,
      }
    }));
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          ...parts,
          {
            text: "Read these homework assignment or essay prompt images. Extract and summarize the main topic or question the student needs to write about. Be concise.",
          },
        ],
      },
    });

    return response.text || "Could not identify topic.";
  });
}

/**
 * Evaluates the handwritten essay image based on the provided topic.
 */
export async function evaluateEssay(imagesBase64: string[], topic: string): Promise<{
  scores: RubricScore;
  feedback: string;
}> {
  return withRetry(async () => {
    const imageParts = imagesBase64.map(data => ({
      inlineData: { mimeType: 'image/jpeg', data }
    }));

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          ...imageParts,
          {
            text: `Evaluate this student's essay submission based on the topic: "${topic}".
            
            STRICT REQUIREMENTS: 
            1. CONTENT TYPE CHECK: Check if the work is an ESSAY or COMPOSITION. If the image(s) contain something else (e.g., math problems, science diagrams, random drawings, or a list of unrelated words that do not form a story or essay), you MUST give a score of 0 for EVERY category.
            2. HANDWRITING CHECK: Check if the essay in the image(s) is HANDWRITTEN. If the text is TYPED (digital font, printed, or computer-generated text), you MUST give a score of 0 for EVERY category.
            3. If the work IS a handwritten essay/composition, evaluate it honestly using the rubric. Read across all the provided pages if there are multiple.
            
            Rubric (0-20 points each):
            A. Relevance & Central Idea (Idea)
            B. Structure & Paragraphing (Structure)
            C. Content & Details / Evidence (Content & Evidence)
            D. Language Clarity & Accuracy (Language)
            E. Voice, Style, and Emotional Impact (Voice)
            
            Return the response in JSON format. If you give 0 points due to requirements 1 or 2, explain this clearly in the feedback.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            scores: {
              type: Type.OBJECT,
              properties: {
                idea: { type: Type.NUMBER },
                structure: { type: Type.NUMBER },
                content: { type: Type.NUMBER },
                language: { type: Type.NUMBER },
                voice: { type: Type.NUMBER },
              },
              required: ['idea', 'structure', 'content', 'language', 'voice'],
            },
            feedback: { type: Type.STRING },
          },
          required: ['scores', 'feedback'],
        },
      },
    });

    try {
      const result = JSON.parse(response.text || '{}');
      return result;
    } catch (e) {
      console.error("Failed to parse evaluation response", e);
      throw new Error("Evaluation failed. Please try again.");
    }
  });
}

export async function getCoPilotInspiration(
  chatHistory: { role: 'user' | 'ai'; text: string }[],
  currentPrompt: string,
  topic: string
): Promise<string> {
  return withRetry(async () => {
    const historyParts = chatHistory.map(msg => ({
      text: `${msg.role === 'user' ? 'Student' : 'Assistant'}: ${msg.text}`
    }));

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          ...historyParts,
          { text: `Topic of the essay: ${topic}. Student's current request: ${currentPrompt}` }
        ]
      },
      config: {
        systemInstruction: `You are a creative writing co-pilot for a student aged 11-16. 
        The essay topic is: "${topic}".
        Your goal is to give inspiration, themes, metaphors, or starting questions based on this topic. 
        
        STRICT RULES:
        1. Keep your responses CONCISE and SHORT (aim for under 100 words).
        2. Do not use complex language; be punchy and encouraging.
        3. Use simple Markdown formatting (bullet points, bold text) to make it easy to read.
        4. Do not give the student direct answers or write the essay for them.
        5. If they ask for an answer or a specific paragraph, politely refuse and instead suggest an idea for them to explore.`
      }
    });

    return response.text || "I'm sorry, I couldn't generate an inspiration right now.";
  });
}

/**
 * Spelling Services
 */

/**
 * CRITICAL: DO NOT MODIFY THIS EXTRACTION LOGIC.
 * This prompt and cleansing logic is tuned for maximum accuracy with Singapore school spelling lists.
 * Uses FLASH_MODEL for vision-to-json extraction.
 */
export async function extractSpellingList(items: string[]): Promise<string[]> {
  return withRetry(async () => {
    const parts = items.map(item => {
      if (item.startsWith('text:')) {
        return { text: item.substring(5) };
      }
      const match = item.match(/^data:(.+);base64,(.*)$/);
      if (match) {
        return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      return { inlineData: { mimeType: 'image/jpeg', data: item } };
    });

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          ...parts,
          {
            text: `Extract the spelling/vocabulary list from these Singapore school worksheet image(s).

Rules:
1. Return ONLY a JSON array of strings, e.g. ["风俗","连续","象征"].
2. For Chinese worksheets with columns (生词/拼音, 解释, 搭配, 例句): extract ONLY the Chinese characters from the vocabulary column (生词). Do NOT include pinyin, definitions, or example sentences.
3. Remove trailing asterisks (*) from words.
4. For English lists, extract each spelling word only.
5. Preserve multi-character phrases as single entries (e.g. "辞旧迎新", "翩翩起舞").
6. If no list is found, return [].`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
    });

    try {
      const parsed = JSON.parse(response.text || '[]');
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((item): item is string => typeof item === 'string' && item.length > 0)
          .map((s) => s.replace(/\*$/, '').trim());
      }
      console.warn('Spelling list extraction returned empty array');
      return [];
    } catch (e) {
      console.error('Critical failure in AI extraction parsing:', e);
      return [];
    }
  });
}

export async function generateSpeech(text: string): Promise<string> {
  const cleanText = text.trim();
  if (!cleanText) throw new Error("Cannot generate audio for empty text");

  try {
    const response = await withRetry(async () => {
      return await ai.models.generateContent({
        model: TTS_MODEL,
        contents: [{ parts: [{ text: cleanText }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Aoede' }, // Aoede is a higher-pitched female voice
            },
          },
        },
      });
    });

    const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
    const base64Audio = audioPart?.inlineData?.data;

    if (base64Audio) return base64Audio;
  } catch (e: any) {
    console.warn("TTS Error mapping to browser fallback:", e);
  }
  return "__BROWSER_TTS__";
}

export async function generateSpellingAudio(word: string): Promise<string> {
  const cleanWord = word.trim();
  if (!cleanWord) throw new Error("Cannot generate audio for empty word");

  const isChinese = /[\u4e00-\u9fa5]/.test(cleanWord);

  // More specific prompts to ensure the model focuses on pure pronunciation
  const strategies = isChinese ? [
    `请朗读这个词：${cleanWord}`,
    cleanWord
  ] : [
    `Please say the word: ${cleanWord}`,
    cleanWord
  ];

  let lastError: any;

  for (const text of strategies) {
    try {
      const response = await withRetry(async () => {
        return await ai.models.generateContent({
          model: TTS_MODEL,
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Aoede' },
              },
            },
          },
        });
      });

      const audioPart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
      const base64Audio = audioPart?.inlineData?.data;

      if (base64Audio) {
        return base64Audio;
      }
      
      const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
      console.warn(`TTS Strategy failed for "${cleanWord}" with prompt "${text}". Model returned text: ${textPart?.text}`);
      
    } catch (e: any) {
      console.warn(`TTS Strategy error for "${cleanWord}" with prompt "${text}":`, e);
      lastError = e;
      
      if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.status === "RESOURCE_EXHAUSTED") {
         throw new Error("Service is busy (Quota Exceeded). Please try again later.");
      }
    }
  }

  console.warn(`All Gemini TTS strategies failed for "${cleanWord}". Falling back to browser TTS.`); 
  return "__BROWSER_TTS__";
}

export async function evaluateSpellingAnswers(
  listItems: string[],
  answerItems: string[],
  words: string[]
): Promise<{
  correctWords: string[];
  incorrectWords: { original: string; student: string }[];
  feedback: string;
}> {
  return withRetry(async () => {
    const masterListParts = listItems.map(item => {
      if (item.startsWith('text:')) {
        return { text: item.substring(5) };
      }
      const match = item.match(/^data:(.+);base64,(.*)$/);
      if (match) {
        return { inlineData: { mimeType: match[1], data: match[2] } };
      }
      return { inlineData: { mimeType: 'image/jpeg', data: item } };
    });

    const answerParts = answerItems.map(answerItem => {
      if (answerItem.startsWith('text:')) {
        return { text: answerItem.substring(5) };
      } else {
        const match = answerItem.match(/^data:(.+);base64,(.*)$/);
        if (match) {
          return { inlineData: { mimeType: match[1], data: match[2] } };
        } else {
          return { inlineData: { mimeType: 'image/jpeg', data: answerItem } };
        }
      }
    });

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: {
        parts: [
          ...masterListParts,
          ...answerParts,
          { 
            text: `The first set of content are the master spelling lists (can be English or Chinese). The remaining content is the student's handwritten answers (can be multiple pages). 
            Check the spelling accuracy for each of these words: ${words.join(', ')}. 
            
            STRICT HANDWRITING REQUIREMENT: 
            - You MUST only mark a word as 'correct' if it is HANDWRITTEN by a human. 
            - If any word in the student's answers appears to be TYPED (digital text, computer font, or printed text), you MUST mark it as INCORRECT. 
            - Be very strict. Read the student's handwriting carefully across all the provided answer pages.
            - If you suspect the student submitted typed images instead of their natural handwriting, penalize them by adding feedback that handwriting is required.
            
            Compare the student's answers carefully against the master spelling list words.
            If the word is misspelled, incorrect, not handwritten, or completely missing, place it in the incorrectWords array.
            
            Return a JSON object with:
            1. correctWords: Array of strings that the student spelled exactly right AND were handwritten.
            2. incorrectWords: Array of objects with 'original' and 'student' (what the student wrote).
            3. feedback: A short encouraging message.`
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correctWords: { type: Type.ARRAY, items: { type: Type.STRING } },
            incorrectWords: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  original: { type: Type.STRING },
                  student: { type: Type.STRING }
                }
              }
            },
            feedback: { type: Type.STRING }
          },
          required: ['correctWords', 'incorrectWords', 'feedback']
        }
      }
    });

    return JSON.parse(response.text || "{}");
  });
}

export async function evaluateOralPerformance(options: {
  practiceType: 'O_LEVEL' | 'PSLE';
  mainQuestion: string;
  summaryTranscript: string;
  answersTranscripts: string[];
  questions: string[];
  readingTranscript?: string;
  readingTextOrigin?: string;
}): Promise<OralEvaluation> {
  return withRetry(async () => {
    const { practiceType, mainQuestion, summaryTranscript, answersTranscripts, questions, readingTranscript, readingTextOrigin } = options;
    
    let textPrompt = '';
    
    if (practiceType === 'PSLE') {
      textPrompt = `Evaluate a student's PSLE oral practice performance.
            
            Context:
            1. Part 1: Reading Aloud (朗读短文)
               - Original Text: "${readingTextOrigin}"
               - Student's Reading: "${readingTranscript}"
               
            2. Part 2: Video Conversation (录像会话)
               - Main Question starting the conversation: "${mainQuestion}"
               - Student's Summary/Response: "${summaryTranscript}"
               
               - Follow-up Questions and Student's Answers:
               ${questions.map((q, i) => `Question ${i+1}: ${q}\nAnswer ${i+1} (may include follow-ups): ${answersTranscripts[i]}`).join('\n\n')}
            
            Rubric & Scoring:
            Total 50 marks (Part 1 is out of 20, Part 2 is out of 30)
            
            I. Part 1: Reading Aloud 朗读短文 (20 marks total):
            IMPORTANT: The reading transcript comes from automatic speech recognition (ASR), which often invents wrong characters / 错别字. Do NOT treat ASR text mismatches as pronunciation or character errors.
            - Accuracy 准确性 (10 marks): Give a fair mid-to-high score unless the student clearly failed to attempt reading. Do NOT deduct for apparent typos, homophones, or "mispronunciation" inferred from ASR.
            - Fluency & Emotion 流利度与感情 (10 marks): Focus on whether the answer suggests continuous reading with reasonable pacing; do not nitpick ASR artifacts.
            
            II. Part 2: Video Conversation 录像会话 (30 marks total):
            - Content Understanding 内容理解 (10 marks): Can the student accurately describe the video and answer questions directly? (Based on main response and follow-ups)
            - Personal Experience & Depth 个人经验与深度 (10 marks): Does the student provide concrete personal examples/stories? Are they detailed?
            - Opinion & Suggestion 观点与建议 (10 marks): Can the student give a clear opinion? Do they offer practical suggestions across different roles (school, home, self)?
            
            CRITICAL FEEDBACK RULES (ASR):
            - Do NOT correct pronunciation / 发音.
            - Do NOT correct typos / 错别字 or point out wrong characters in the transcript.
            - Do NOT mention "pronunciation errors" or "错别字" in feedback.
            - Focus feedback on content, structure, depth, examples, and answering strategy only.
            - Treat transcripts as approximate meaning, not exact wording.
            
            Return the evaluation in JSON format with categories, feedback, totalMarks (out of 50), maxMarks (50), modelAnswer, and goodWords.
            "categories" MUST be an array of exactly two elements: 
            [
               { title: "Reading Aloud 朗读短文", items: [{ label: "Accuracy", score: Number, max: 10 }, { label: "Fluency & Emotion", score: Number, max: 10 }] },
               { title: "Video Conversation 录像会话", items: [{ label: "Understanding", score: Number, max: 10 }, { label: "Personal Experience", score: Number, max: 10 }, { label: "Opinion & Suggestion", score: Number, max: 10 }] }
            ]
            
            Additionally, provide:
            - "modelAnswer": A high-quality model response (in Chinese) for the video conversation part, covering the main themes and typical questions.
            - "goodWords": An array of 3-5 advanced Chinese vocabulary, idioms (成语), or sentence structures relevant to the topic with brief explanations.`;
    } else {
      textPrompt = `Evaluate a student's Singapore O-Level Chinese oral exam performance (高级华文口语).

Context:
1. Part 1 — 口头报告 (Oral Report): The candidate gave a solo presentation of up to ~2 minutes on the assigned topic, combining the video stimulus.
   Topic / prompt shown with the video: "${mainQuestion}"
   Student's oral report transcript: "${summaryTranscript}"

2. Part 2 — 讨论 (Discussion): The examiner asked 2–3 follow-up questions extending from the oral report (not repeating the report prompt).
   Examiner questions and student answers:
   ${questions.map((q, i) => `Question ${i + 1}: ${q}\nAnswer ${i + 1} (may include further follow-ups): ${answersTranscripts[i] || '(no answer)'}`).join('\n\n')}

════════════════════════════════════
SCORING RUBRIC — Total 40 marks
════════════════════════════════════

【第一部分：口头报告】满分 20 分
考生需针对指定话题，结合录像内容进行不超过 2 分钟的单人陈述。

评分维度：
A) 内容与组织架构（核心分，满分 12）
B) 语言表达与流利度（印象分，满分 8）
两部分相加为口头报告总分（0–20），并对照下列档次：

• 优异 (A级) 17–20 分
  - 切题深刻：完美扣紧话题，精准引用录像细节；具有深刻思辨力，能提出独到分论点。
  - 架构严谨：采用“总—分—总”，运用 PEEL（Point 论点, Explanation 阐述, Example 举例, Link 总结），过渡自然。
  - 用词精炼：大量运用高级词汇与成语。
  - 行云流水：表达连贯自信；几乎没有“呃、啊”等犹豫性停顿。（注意：ASR 文本不可靠，勿因错别字/“发音错误”扣分；根据内容完整度、结构与词汇丰富度判断。）

• 良好 (B级) 13–16 分
  - 切题务实：内容切题，能结合录像大体内容；论点清晰，例子较有说服力。
  - 条理分明：结构较完整，分论点之间有基本逻辑过渡。
  - 用词恰当：词汇量足够，偶有小语病但不影响理解。
  - 表达流利：语速适中，有少量自然停顿。

• 及格 (C/D级) 10–12 分
  - 内容流于表面：基本切题，但停留在录像表面现象，缺乏深层原因分析；例子口号化或单一。
  - 结构松散：没有清晰论点划分，主次不分明。
  - 词汇匮乏：重复或过于大白话，语病较明显。
  - 停顿较多：边想边说导致不连贯。

• 不及格 (E/F级) 9 分及以下
  - 离题/空洞：基本不切题或严重误解话题；无法结合录像；陈述过短、无话可说。
  - 错误频出 / 极度不流利：严重无法理解，或明显照稿生硬朗读式表达（从结构僵硬、内容空洞判断，勿凭 ASR 错字）。

【第二部分：讨论】满分 20 分
考官根据口头报告进行 2–3 个问题的深度延伸互动（自由提问，不是重复口头报告题）。

评分维度：
A) 互动、思辨与内容（核心分，满分 12）
B) 语言基本功（印象分，满分 8）
两部分相加为讨论总分（0–20），并对照下列档次：

• 优异 (A级) 17–20 分
  - 反应敏捷：能听懂高难度追问并直接作答。
  - 见解精辟：从宏观（国家政策、社会转型）到微观（个人、学校、家庭）多角度剖析，批判性思维强。
  - 对答如流：能灵活运用复杂句式及政策性/社会性高频词汇；语气大方得体。

• 良好 (B级) 13–16 分
  - 对答切题：正确理解问题，多维度回答；能对质疑作合理补充。
  - 论证有效：能举出录像之外的新加坡本地社会实例。
  - 句式完整：表达流利连贯，语病很少。

• 及格 (C/D级) 10–12 分
  - 被动应答：勉强听懂，思考很久；回答单一，多为“同意/不同意”，缺乏展开。
  - 例子局限：只能重复口头报告用过的例子，或全谈个人经验，缺乏社会高度。
  - 表达生硬：断句多、自我纠正多，或夹杂英文思维翻译病句；缺乏互动感。

• 不及格 (E/F级) 9 分及以下
  - 无法沟通：完全误解问题或无法作答。
  - 逻辑混乱：前言不搭后语，无法自圆其说。
  - 语言破碎：只能蹦出单词，无法成句。

CRITICAL FEEDBACK RULES (ASR):
- Transcripts come from automatic speech recognition and often invent wrong characters / 错别字.
- Do NOT correct pronunciation / 发音 or typos / 错别字 in feedback.
- Do NOT deduct for apparent “mispronunciation” inferred from ASR text.
- Score language/fluency from coherence of ideas, vocabulary richness, structure, and length — not from ASR character accuracy.
- Treat transcripts as approximate meaning, not exact wording.

Return JSON with:
- categories: exactly two elements:
  [
    {
      title: "第一部分：口头报告",
      items: [
        { label: "内容与组织架构（核心）", score: Number, max: 12 },
        { label: "语言表达与流利度（印象）", score: Number, max: 8 }
      ]
    },
    {
      title: "第二部分：讨论",
      items: [
        { label: "互动、思辨与内容（核心）", score: Number, max: 12 },
        { label: "语言基本功（印象）", score: Number, max: 8 }
      ]
    }
  ]
- feedback: overall examiner feedback in Chinese (mention grade band for each part if helpful; no pronunciation/typo nitpicking)
- totalMarks: sum of all item scores (out of 40)
- maxMarks: 40
- modelAnswer: high-quality Chinese model oral report + sample discussion answers for this topic
- goodWords: 3–5 advanced vocabulary / 成语 / sentence patterns with brief explanations`;
    }
    
    textPrompt += `\n\nSTRICT LANGUAGE RULE:
            - The student MUST answer in Chinese.
            - For every 4 English words found in the transcripts, you MUST deduct 1 mark from the totalMarks.
            - Mention this deduction clearly in the feedback if it occurs.`;

    const response = await ai.models.generateContent({
      model: PRO_MODEL,
      contents: [
        {
          role: 'user',
          parts: [{ text: textPrompt }],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            categories: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        score: { type: Type.NUMBER },
                        max: { type: Type.NUMBER }
                      },
                      required: ['label', 'score', 'max']
                    }
                  }
                },
                required: ['title', 'items']
              }
            },
            feedback: { type: Type.STRING },
            totalMarks: { type: Type.NUMBER },
            maxMarks: { type: Type.NUMBER },
            modelAnswer: { type: Type.STRING },
            goodWords: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
          },
          required: ['categories', 'feedback', 'totalMarks', 'maxMarks', 'modelAnswer', 'goodWords'],
        },
      },
    });

    const parsed = JSON.parse(response.text || "{}") as OralEvaluation;

    // Normalize O-Level scores to the 20+20 rubric (content 12 + language 8 each part).
    if (practiceType === 'O_LEVEL' && parsed?.categories?.length) {
      const clamp = (n: number, max: number) =>
        Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
      parsed.categories = parsed.categories.map((cat, ci) => ({
        ...cat,
        items: (cat.items || []).map((item, ii) => {
          const expectedMax = ii === 0 ? 12 : 8;
          const max = Number(item.max) || expectedMax;
          return { ...item, max, score: clamp(item.score, max) };
        }),
      }));
      parsed.maxMarks = 40;
      parsed.totalMarks = parsed.categories.reduce(
        (sum, cat) => sum + cat.items.reduce((s, it) => s + (it.score || 0), 0),
        0,
      );
    }

    return parsed;
  });
}

export async function generateFollowUpQuestion(question: string, transcript: string, subQuestionCount: number): Promise<string | null> {
  if (subQuestionCount >= 2) return null;

  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            {
              text: `You are an oral examiner for a Chinese language test.
              The student was asked the following question: "${question}"
              The student's response so far is: "${transcript}"
              
              Based on the following rubric, determine if the student's response is sufficient, relevant, and provides enough depth.
              Rubric:
              - Relevance & Depth (6 marks): Does the student actually answer the question? Provides personal stories/examples. Deep engagement with the prompt.
              - Range of Expression (6 marks): Discusses abstract ideas (values, society). Tight grammar.
              - Fluency & Engagement (3 marks): Natural, fluent, engaging.
              
              If the response is insufficient, off-topic, or lacks detail, generate 1 short follow-up sub-question in Chinese to prompt the student for more information or to bring them back to the topic.
              If the response is already sufficient and relevant, return an empty string.
              
              Return the result in JSON format with a "followUp" field (string, empty if no follow-up needed).`,
            },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            followUp: { type: Type.STRING },
          },
          required: ['followUp'],
        },
      },
    });

    const result = JSON.parse(response.text || "{}");
    return result.followUp || null;
  });
}

export async function evaluateOralNotes(options: {
  imageBase64: string;
  practiceType: 'O_LEVEL' | 'PSLE';
  mainQuestion: string;
  readingText?: string;
}): Promise<OralNotesEvaluation> {
  return withRetry(async () => {
    const { imageBase64, practiceType, mainQuestion, readingText } = options;
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
            },
          },
          {
            text: `You are a Chinese oral exam coach. The student watched a ${practiceType} oral stimulus video and took handwritten notes (photo attached).

Main topic / question: "${mainQuestion}"
${readingText ? `Reading passage context: "${readingText}"` : ''}

Evaluate whether the notes are:
1. Organized (有条理) — clear structure, headings, logical grouping
2. Complete (完整) — covers key video points, main ideas, useful details for answering

Return JSON in Chinese for feedback fields:
- score: 1-10 overall note quality
- isOrganized: boolean
- isComplete: boolean
- strengths: array of 2-4 short bullet strings (what they did well)
- improvements: array of 2-4 actionable improvement suggestions
- feedback: 2-4 sentences overall summary`,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            isOrganized: { type: Type.BOOLEAN },
            isComplete: { type: Type.BOOLEAN },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            feedback: { type: Type.STRING },
          },
          required: ['score', 'isOrganized', 'isComplete', 'strengths', 'improvements', 'feedback'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function generateOralAnswerGuide(options: {
  practiceType: 'O_LEVEL' | 'PSLE';
  mainQuestion: string;
  questions: string[];
  readingText?: string;
  notesFeedback?: string;
}): Promise<OralAnswerGuide> {
  return withRetry(async () => {
    const { practiceType, mainQuestion, questions, readingText, notesFeedback } = options;
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are a Chinese oral exam tutor helping a ${practiceType} student prepare answers.

Main question: "${mainQuestion}"
Follow-up questions: ${questions.map((q, i) => `${i + 1}. ${q}`).join('\n')}
${readingText ? `Reading passage: "${readingText}"` : ''}
${notesFeedback ? `Notes feedback from coach: ${notesFeedback}` : ''}

Provide a study guide in Chinese to help the student answer well:
- mindMapOutline: A clear mind-map style outline (use indentation/bullets, 中文)
- usefulPhrases: 5-8 useful phrases/词语
- usefulSentences: 3-5 useful example sentences/句式 starters
- tips: Brief answering strategy (PEEL, personal examples, etc.)`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            mindMapOutline: { type: Type.STRING },
            usefulPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
            usefulSentences: { type: Type.ARRAY, items: { type: Type.STRING } },
            tips: { type: Type.STRING },
          },
          required: ['mindMapOutline', 'usefulPhrases', 'usefulSentences', 'tips'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function evaluateOralPracticeAnswer(options: {
  practiceType: 'O_LEVEL' | 'PSLE';
  questionLabel: string;
  question: string;
  transcript: string;
  attemptNumber: number;
  isSummary?: boolean;
}): Promise<OralPracticeAnswerFeedback> {
  return withRetry(async () => {
    const { practiceType, questionLabel, question, transcript, attemptNumber, isSummary } = options;
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are a supportive Chinese oral exam coach (${practiceType}). The student is in GUIDED PRACTICE mode.

${questionLabel}: "${question}"
Student's spoken answer (transcript): "${transcript}"
Attempt number: ${attemptNumber}
${isSummary ? 'This is their main video summary / opening response.' : 'This is an follow-up question answer.'}

Evaluate if the answer is "good enough" to pass this practice round:
- Relevant to the question
- Has some depth (personal example or clear opinion)
- Understandable Chinese with reasonable fluency of ideas

Be encouraging but honest. Pass threshold: score >= 6/10.

CRITICAL — Speech recognition caveat:
- The transcript comes from automatic speech recognition (ASR) and often invents wrong characters / 错别字 or looks like pronunciation mistakes.
- Do NOT correct pronunciation / 发音.
- Do NOT correct typos / 错别字 or criticize wrong characters in the transcript.
- Do NOT list pronunciation or character fixes in "improvements".
- Focus improvements on content, structure, examples, opinions, and answering strategy only.
- Treat the transcript as approximate meaning, not exact wording.
- suggestedRevision (if any) should improve content/structure, not "fix" ASR text.

Return JSON in Chinese:
- passed: boolean
- score: 1-10
- feedback: 2-3 sentences on overall performance (no pronunciation/typo remarks)
- improvements: 2-4 specific content/strategy improvements (no pronunciation/typo remarks)
- suggestedRevision: optional 1-2 sentence model snippet showing how to improve (if not passed)`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            passed: { type: Type.BOOLEAN },
            score: { type: Type.NUMBER },
            feedback: { type: Type.STRING },
            improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
            suggestedRevision: { type: Type.STRING },
          },
          required: ['passed', 'score', 'feedback', 'improvements'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function generateOralPracticeSummary(options: {
  practiceType: 'O_LEVEL' | 'PSLE';
  mainQuestion: string;
  questions: string[];
  summaryTranscript: string;
  answersTranscripts: string[];
  readingTranscript?: string;
}): Promise<OralPracticeSummary> {
  return withRetry(async () => {
    const { practiceType, mainQuestion, questions, summaryTranscript, answersTranscripts, readingTranscript } = options;
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are a Chinese oral exam tutor. The student completed a GUIDED PRACTICE session (${practiceType}).

Main question: "${mainQuestion}"
Student summary: "${summaryTranscript}"
${readingTranscript ? `Reading transcript: "${readingTranscript}"` : ''}

Questions and final accepted answers:
${questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answersTranscripts[i] || '(no answer)'}`).join('\n\n')}

Provide a comprehensive learning summary in Chinese:
- modelAnswer: High-quality model response for the main summary/opening
- modelAnswersByQuestion: array of model answers, one per follow-up question (same order)
- usefulPhrases: 5-8 key vocabulary/词语
- usefulSentences: 3-5 good example sentences
- sentencePatterns: 2-4 reusable sentence patterns/句式 with brief explanation
- overallFeedback: encouraging overall feedback and next steps

CRITICAL: Do NOT comment on pronunciation / 发音 or typos / 错别字. Transcripts are from ASR and are unreliable for wording. Focus on content, structure, and useful language for answering.`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            modelAnswer: { type: Type.STRING },
            modelAnswersByQuestion: { type: Type.ARRAY, items: { type: Type.STRING } },
            usefulPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
            usefulSentences: { type: Type.ARRAY, items: { type: Type.STRING } },
            sentencePatterns: { type: Type.ARRAY, items: { type: Type.STRING } },
            overallFeedback: { type: Type.STRING },
          },
          required: ['modelAnswer', 'modelAnswersByQuestion', 'usefulPhrases', 'usefulSentences', 'sentencePatterns', 'overallFeedback'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function generateArticleMcqs(options: {
  article: string;
  title?: string;
  questionCount?: number;
}): Promise<{ title: string; questions: Array<{
  prompt: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}> }> {
  return withRetry(async () => {
    const { article, title, questionCount = 5 } = options;
    const count = Math.min(12, Math.max(3, questionCount));

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are creating a reading-comprehension MCQ quiz for students aged 11–16.

Article title (optional): ${title || '(none)'}
Article:
"""
${article.slice(0, 12000)}
"""

Create exactly ${count} multiple-choice questions based ONLY on the article.
Rules:
- Each question must have exactly 4 options.
- Exactly one correct answer per question.
- Mix difficulty: factual recall, inference, vocabulary-in-context.
- Keep language clear for secondary students.
- Explanations should briefly say why the correct option is right.

Return JSON with:
- title: a short quiz title
- questions: array of { prompt, options (4 strings), correctIndex (0-3), explanation }`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  prompt: { type: Type.STRING },
                  options: { type: Type.ARRAY, items: { type: Type.STRING } },
                  correctIndex: { type: Type.NUMBER },
                  explanation: { type: Type.STRING },
                },
                required: ['prompt', 'options', 'correctIndex', 'explanation'],
              },
            },
          },
          required: ['title', 'questions'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}

export async function markArticleQuizAnswers(options: {
  article: string;
  title: string;
  questions: Array<{
    id: string;
    prompt: string;
    options: Array<{ id: string; text: string }>;
    correctOptionId: string;
    explanation?: string;
    studentOptionId: string;
  }>;
}): Promise<{
  score: number;
  maxScore: number;
  overallFeedback: string;
  questionResults: Array<{
    questionId: string;
    isCorrect: boolean;
    studentAnswerText: string;
    suggestedAnswerText: string;
    explanation: string;
  }>;
}> {
  return withRetry(async () => {
    const { article, title, questions } = options;
    const payload = questions.map((q, i) => {
      const student = q.options.find((o) => o.id === q.studentOptionId);
      const correct = q.options.find((o) => o.id === q.correctOptionId);
      return {
        index: i + 1,
        questionId: q.id,
        prompt: q.prompt,
        options: q.options.map((o) => o.text),
        studentAnswer: student?.text || '(blank)',
        correctAnswer: correct?.text || '',
        rubricHint: q.explanation || '',
      };
    });

    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are an English reading-comprehension examiner for ages 11–16.

Quiz: ${title}
Article (excerpt):
"""
${article.slice(0, 8000)}
"""

Student answers to mark:
${JSON.stringify(payload, null, 2)}

For EACH question:
- Decide if the student's chosen answer is correct (must match the intended correct answer; be fair if wording is equivalent).
- Provide a clear suggested/model answer (the best option text).
- Write a short explanation (1–2 sentences) suitable for the student.
- Also write overallFeedback: encouraging, specific, 2–4 sentences.

Return JSON:
{
  score: number of correct,
  maxScore: total questions,
  overallFeedback: string,
  questionResults: [{ questionId, isCorrect, studentAnswerText, suggestedAnswerText, explanation }]
}`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            score: { type: Type.NUMBER },
            maxScore: { type: Type.NUMBER },
            overallFeedback: { type: Type.STRING },
            questionResults: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionId: { type: Type.STRING },
                  isCorrect: { type: Type.BOOLEAN },
                  studentAnswerText: { type: Type.STRING },
                  suggestedAnswerText: { type: Type.STRING },
                  explanation: { type: Type.STRING },
                },
                required: ['questionId', 'isCorrect', 'studentAnswerText', 'suggestedAnswerText', 'explanation'],
              },
            },
          },
          required: ['score', 'maxScore', 'overallFeedback', 'questionResults'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    // Safety: align score with boolean results if present
    if (Array.isArray(parsed.questionResults)) {
      const correctCount = parsed.questionResults.filter((r: { isCorrect?: boolean }) => r.isCorrect).length;
      parsed.score = correctCount;
      parsed.maxScore = parsed.questionResults.length || questions.length;
    } else {
      parsed.maxScore = questions.length;
      parsed.score = Math.min(parsed.score || 0, questions.length);
    }
    return parsed;
  });
}

export async function consolidateArticleQuizStats(options: {
  title: string;
  questions: Array<{ id: string; prompt: string }>;
  submissions: Array<{
    studentName: string;
    score: number;
    maxScore: number;
    questionResults?: Array<{ questionId: string; isCorrect: boolean; studentAnswerText: string }>;
  }>;
  unsubmittedNames: string[];
}): Promise<{
  aiSummary: string;
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  questionAccuracy: Array<{
    questionId: string;
    prompt: string;
    correctRate: number;
    commonWrongAnswer?: string;
  }>;
}> {
  return withRetry(async () => {
    const { title, questions, submissions, unsubmittedNames } = options;
    const response = await ai.models.generateContent({
      model: FLASH_MODEL,
      contents: {
        parts: [{
          text: `You are an education analytics assistant. Consolidate class performance for a reading quiz.

Quiz: ${title}
Questions: ${JSON.stringify(questions)}
Submissions: ${JSON.stringify(submissions)}
Unsubmitted students: ${JSON.stringify(unsubmittedNames)}

Return JSON with:
- aiSummary: 3–5 sentence class overview for the teacher/admin
- strengths: 2–4 bullet strings (class strengths)
- weaknesses: 2–4 bullet strings (common struggles)
- recommendations: 2–4 teaching next-steps
- questionAccuracy: one entry per question with questionId, prompt, correctRate (0–100), optional commonWrongAnswer`,
        }],
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            aiSummary: { type: Type.STRING },
            strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
            weaknesses: { type: Type.ARRAY, items: { type: Type.STRING } },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
            questionAccuracy: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  questionId: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                  correctRate: { type: Type.NUMBER },
                  commonWrongAnswer: { type: Type.STRING },
                },
                required: ['questionId', 'prompt', 'correctRate'],
              },
            },
          },
          required: ['aiSummary', 'strengths', 'weaknesses', 'recommendations', 'questionAccuracy'],
        },
      },
    });

    return JSON.parse(response.text || '{}');
  });
}
