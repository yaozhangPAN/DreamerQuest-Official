import { RubricScore, OralEvaluation } from "./types";

/**
 * Client-side proxy service calling server-side API endpoints for Gemini operations.
 * This guarantees that the GEMINI_API_KEY is never exposed to the client browser.
 */

async function postToApi<T>(path: string, body: any): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
  }

  return response.json();
}

/**
 * Extracts the assignment topic or instructions from an image.
 */
export async function extractTopicFromImage(imageB64s: string[]): Promise<string> {
  const data = await postToApi<{ topic: string }>("/api/gemini/extract-topic", { imageB64s });
  return data.topic;
}

/**
 * Evaluates the handwritten essay image based on the provided topic.
 */
export async function evaluateEssay(imagesBase64: string[], topic: string): Promise<{
  scores: RubricScore;
  feedback: string;
}> {
  return postToApi<{ scores: RubricScore; feedback: string }>("/api/gemini/evaluate-essay", { imagesBase64, topic });
}

export async function getCoPilotInspiration(
  chatHistory: { role: 'user' | 'ai'; text: string }[],
  currentPrompt: string,
  topic: string
): Promise<string> {
  const data = await postToApi<{ inspiration: string }>("/api/gemini/copilot-inspiration", {
    chatHistory,
    currentPrompt,
    topic,
  });
  return data.inspiration;
}

/**
 * Spelling Services
 */
export async function extractSpellingList(items: string[]): Promise<string[]> {
  const data = await postToApi<{ list: string[] }>("/api/gemini/extract-spelling-list", { items });
  return data.list;
}

export async function generateSpeech(text: string): Promise<string> {
  const data = await postToApi<{ audioBase64: string }>("/api/gemini/generate-speech", { text });
  return data.audioBase64;
}

export async function generateSpellingAudio(word: string): Promise<string> {
  const data = await postToApi<{ audioBase64: string }>("/api/gemini/generate-spelling-audio", { word });
  return data.audioBase64;
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
  return postToApi<{
    correctWords: string[];
    incorrectWords: { original: string; student: string }[];
    feedback: string;
  }>("/api/gemini/evaluate-spelling-answers", { listItems, answerItems, words });
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
  return postToApi<OralEvaluation>("/api/gemini/evaluate-oral-performance", { options });
}

export async function generateFollowUpQuestion(
  question: string,
  transcript: string,
  subQuestionCount: number
): Promise<string | null> {
  const data = await postToApi<{ followUp: string | null }>("/api/gemini/generate-followup-question", {
    question,
    transcript,
    subQuestionCount,
  });
  return data.followUp;
}
