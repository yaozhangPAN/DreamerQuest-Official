import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RubricScore, OralEvaluation } from "./types";

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
      model: 'gemini-1.5-flash',
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
      model: 'gemini-1.5-pro',
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
      model: 'gemini-1.5-flash',
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
 * It uses gemini-1.5-flash for robust vision-to-json extraction.
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
      // fallback for old saved sessions
      return { inlineData: { mimeType: 'image/jpeg', data: item } };
    });

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-flash', 
      contents: {
        parts: [
          ...parts,
          { text: `System: You are an expert at extracting Singapore primary/secondary school spelling lists (Chinese and English).
          
          Instructions:
          1. Scan the image(s) for a list of words, phrases, or characters.
          2. Return ONLY a JSON array of strings: ["word1", "word2", ...].
          3. NO MARKDOWN. NO CODE BLOCKS. NO PREAMBLE.
          4. If text is in a table, focus on the primary word column.
          5. If no list is found, return [].` }
        ]
      },
      config: {
        responseMimeType: "text/plain",
      }
    });

    try {
      const candidates = response.candidates;
      if (!candidates || candidates.length === 0) throw new Error("No AI candidates returned");
      
      const part = candidates[0].content.parts.find(p => p.text);
      let text = (part?.text || "[]").trim();
      
      // Sanitization: remove markdown etc.
      text = text.replace(/```json|```/g, '').trim();
      
      let list: string[] = [];
      if (text.startsWith('[') && text.endsWith(']')) {
        list = JSON.parse(text);
      } else {
        // Advanced extraction of array if AI added commentary
        const start = text.indexOf('[');
        const end = text.lastIndexOf(']');
        if (start !== -1 && end !== -1) {
          list = JSON.parse(text.substring(start, end + 1));
        }
      }
      
      if (Array.isArray(list) && list.length > 0) {
        return list.filter(item => typeof item === 'string' && item.length > 0).map(s => s.trim());
      }

      console.warn("Spelling List Extraction fallback needed. AI text:", text);
      return [];
    } catch (e) {
      console.error("Critical failure in AI extraction parsing:", e);
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
        model: "gemini-1.5-flash",
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
          model: "gemini-1.5-flash",
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
      model: 'gemini-1.5-pro',
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
            - Accuracy 准确性 (10 marks): Pronunciation, skipped/added words, clarity. Is it accurate compared to original text?
            - Fluency & Emotion 流利度与感情 (10 marks): Phrasing, punctuation pauses, appropriate emotions.
            
            II. Part 2: Video Conversation 录像会话 (30 marks total):
            - Content Understanding 内容理解 (10 marks): Can the student accurately describe the video and answer questions directly? (Based on main response and follow-ups)
            - Personal Experience & Depth 个人经验与深度 (10 marks): Does the student provide concrete personal examples/stories? Are they detailed?
            - Opinion & Suggestion 观点与建议 (10 marks): Can the student give a clear opinion? Do they offer practical suggestions across different roles (school, home, self)?
            
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
      textPrompt = `Evaluate a student's O-Level oral practice performance.
            
            Context:
            The student watched a video stimulus and was asked to:
            1. Respond to the question: "${mainQuestion}"
            2. Answer 3 specific follow-up questions.
            
            Student's Main Response Transcript: "${summaryTranscript}"
            
            Questions and Student's Answers:
            ${questions.map((q, i) => `Question ${i+1}: ${q}\nAnswer ${i+1} (may include follow-ups): ${answersTranscripts[i]}`).join('\n\n')}
            
            Rubric & Scoring:
            Total 30 marks
            
            I. Part 1: Main Response (15 marks total):
            - Relevance & Personal Response (6 marks): Deep, original insights. Explains why it matters. Uses PEEL structure.
            - Language & Vocabulary (6 marks): Uses advanced vocabulary. Varied sentences.
            - Delivery & Tone (3 marks): Confident, clear, good pace.
            
            II. Part 2: Video Response (15 marks total):
            - Interaction & Depth (6 marks): Provides personal stories/examples. Deep engagement with questions.
            - Range of Expression (6 marks): Discusses abstract ideas (values, society). Tight grammar.
            - Fluency & Engagement (3 marks): Natural, fluent, engaging.
            
            Return the evaluation in JSON format with categories, feedback, totalMarks (out of 30), maxMarks (30), modelAnswer, and goodWords.
            "categories" MUST be an array of exactly two elements: 
            [
               { title: "Main Response", items: [{ label: "Personal Response", score: Number, max: 6 }, { label: "Language", score: Number, max: 6 }, { label: "Delivery", score: Number, max: 3 }] },
               { title: "Video Response", items: [{ label: "Interaction & Depth", score: Number, max: 6 }, { label: "Range of Expression", score: Number, max: 6 }, { label: "Fluency", score: Number, max: 3 }] }
            ]
            
            Additionally, provide:
            - "modelAnswer": A high-quality model response (in Chinese) for the conversation, covering the main themes and typical questions.
            - "goodWords": An array of 3-5 advanced Chinese vocabulary, idioms (成语), or sentence structures relevant to the topic with brief explanations.`;
    }
    
    textPrompt += `\n\nSTRICT LANGUAGE RULE:
            - The student MUST answer in Chinese.
            - For every 4 English words found in the transcripts, you MUST deduct 1 mark from the totalMarks.
            - Mention this deduction clearly in the feedback if it occurs.`;

    const response = await ai.models.generateContent({
      model: 'gemini-1.5-pro',
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

    return JSON.parse(response.text || "{}");
  });
}

export async function generateFollowUpQuestion(question: string, transcript: string, subQuestionCount: number): Promise<string | null> {
  if (subQuestionCount >= 2) return null;

  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-1.5-flash",
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
