import { GoogleGenAI, Type, Modality } from "@google/genai";
import { RubricScore, OralEvaluation } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

/**
 * Helper to wrap API calls with retry for quota errors (429/RESOURCE_EXHAUSTED).
 * Uses exponential backoff.
 */
async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
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
      model: 'gemini-3-flash-preview',
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
      model: 'gemini-3-pro-preview',
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
      model: 'gemini-3-flash-preview',
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
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          ...parts,
          { text: "Extract all the unique spelling words from these documents/images. They could be English words or Chinese characters. Return only the list of words/characters as a JSON array of strings. Do not include duplicates." }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    
    return JSON.parse(response.text || "[]");
  });
}

export async function generateSpellingAudio(word: string): Promise<string> {
  const cleanWord = word.trim();
  if (!cleanWord) throw new Error("Cannot generate audio for empty word");

  const isChinese = /[\u4e00-\u9fa5]/.test(cleanWord);

  const strategies = isChinese ? [
    // Chinese Strategies
    `请读这个词：${cleanWord}`,
    `中文单词：${cleanWord}`,
    cleanWord
  ] : [
    // English Strategies
    `The word is ${cleanWord}`,
    cleanWord,
    `Say the word: ${cleanWord}`
  ];

  let lastError: any;

  for (const text of strategies) {
    try {
      const response = await withRetry(async () => {
        return await ai.models.generateContent({
          model: "gemini-3.1-flash-tts-preview",
          contents: [{ parts: [{ text }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
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
      
      // Check if we got a text refusal
      const textPart = response.candidates?.[0]?.content?.parts?.find(p => p.text);
      console.warn(`TTS Strategy failed for "${cleanWord}" with prompt "${text}". Model returned text: ${textPart?.text}`);
      
    } catch (e: any) {
      console.warn(`TTS Strategy error for "${cleanWord}" with prompt "${text}":`, e);
      lastError = e;
      
      // If it's a quota error that persisted despite retries, we should probably stop trying other strategies 
      // because they will likely fail too.
      if (e.message?.includes('429') || e.message?.includes('RESOURCE_EXHAUSTED') || e.status === "RESOURCE_EXHAUSTED") {
         throw new Error("Service is busy (Quota Exceeded). Please try again later.");
      }
    }
  }

  console.warn(`All Gemini TTS strategies failed for "${cleanWord}". Falling back to browser TTS.`); return "__BROWSER_TTS__";
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
      model: 'gemini-3-pro-preview',
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

export async function evaluateOralPerformance(
  summaryTranscript: string,
  answersTranscripts: string[],
  questions: string[]
): Promise<OralEvaluation> {
  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: {
        parts: [
          {
            text: `Evaluate a student's oral practice performance.
            
            Context:
            The student watched a video stimulus (about selfies/social media) and was asked to:
            1. Respond to the question: "你对自拍并上传到社交媒体有何看法？" (What is your opinion on taking selfies and uploading them to social media?)
            2. Answer 3 specific follow-up questions.
            
            Student's Main Response Transcript: "${summaryTranscript}"
            
            Questions and Student's Answers:
            ${questions.map((q, i) => `Question ${i+1}: ${q}\nAnswer ${i+1} (may include follow-ups): ${answersTranscripts[i]}`).join('\n\n')}
            
            Rubric & Scoring (Total 30 marks):
            
            I. Main Response (15 marks total):
            - Relevance & Personal Response (6 marks): Does the student actually answer the main question? Deep, original insights. Explains why it matters. Uses PEEL structure.
            - Language & Vocabulary (6 marks): Uses advanced vocabulary (e.g., resilience, multifaceted, detrimental). Varied/complex sentences.
            - Delivery & Tone (3 marks): Confident, clear, good pace.
            
            II. Video Response (15 marks total):
            - Interaction & Depth (6 marks): Provides personal stories/examples. Deep engagement with questions.
            - Range of Expression (6 marks): Discusses abstract ideas (values, society). Tight grammar.
            - Fluency & Engagement (3 marks): Natural, fluent, engaging.
            
            Scoring Guide:
            - High Performance: 4-5 marks (for 6m criteria) or 3 marks (for 3m criteria)
            - Solid Effort: 2-3 marks (for 6m criteria) or 2 marks (for 3m criteria)
            - Needs Rehearsal: 0-1 marks
            
            Return the evaluation in JSON format with summaryScores, videoResponseScores, feedback, and totalMarks.
            
            STRICT LANGUAGE RULE:
            - The student MUST answer in Chinese.
            - For every 4 English words found in the transcripts, you MUST deduct 1 mark from the totalMarks.
            - Mention this deduction clearly in the feedback if it occurs.
            
            STRICT RELEVANCE RULE:
            - If the student's response to the main question is completely irrelevant or does not address "你对自拍并上传到社交媒体有何看法？", you MUST award 0 marks for the "Relevance & Personal Response" criterion.`,
          },
        ],
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaryScores: {
              type: Type.OBJECT,
              properties: {
                personalResponse: { type: Type.NUMBER },
                language: { type: Type.NUMBER },
                delivery: { type: Type.NUMBER },
              },
              required: ['personalResponse', 'language', 'delivery'],
            },
            videoResponseScores: {
              type: Type.OBJECT,
              properties: {
                interaction: { type: Type.NUMBER },
                range: { type: Type.NUMBER },
                fluency: { type: Type.NUMBER },
              },
              required: ['interaction', 'range', 'fluency'],
            },
            feedback: { type: Type.STRING },
            totalMarks: { type: Type.NUMBER },
          },
          required: ['summaryScores', 'videoResponseScores', 'feedback', 'totalMarks'],
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
      model: "gemini-3-flash-preview",
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