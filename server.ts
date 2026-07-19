import express from "express";
import path from "path";
import Stripe from "stripe";
import { fileURLToPath } from "url";
import { readFileSync, existsSync } from "fs";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

import {
  extractTopicFromImage,
  evaluateEssay,
  getCoPilotInspiration,
  extractSpellingList,
  generateSpeech,
  generateSpellingAudio,
  evaluateSpellingAnswers,
  evaluateOralPerformance,
  generateFollowUpQuestion,
  evaluateOralNotes,
  generateOralAnswerGuide,
  evaluateOralPracticeAnswer,
  generateOralPracticeSummary,
  generateArticleMcqs,
  markArticleQuizAnswers,
  consolidateArticleQuizStats,
  extractTextFromUploadedFile,
} from "./serverGeminiService";
import {
  approveGroupMembership,
  computeQuestionAccuracyFromSubmissions,
  createGroup,
  deleteGroup,
  deleteQuiz,
  getGroupForUser,
  getPendingGroupForUser,
  getQuiz,
  getRoster,
  getSubmissionForUser,
  leaveGroup,
  listAdminNotifications,
  listApprovedMembers,
  listCompletedQuizIdsForUser,
  listGroups,
  listPendingMemberships,
  listQuizzes,
  listSubmissionsForQuiz,
  markAdminNotificationsRead,
  rejectGroupMembership,
  requestJoinGroupByCode,
  saveQuizClassStats,
  startArticleQuizRead,
  submitQuizAnswers,
  updateQuizQuestions,
  upsertQuiz,
} from "./lib/articleQuizStore";
import type { ArticleQuiz, ArticleQuizClassStats } from "./types";
import { fetchArticleFromUrl } from "./lib/fetchArticleFromUrl";
import {
  ARTICLE_READ_XP,
  calculateArticleQuizCompletionXp,
} from "./lib/xpSystem";

const __filenameSaved = typeof import.meta !== "undefined" && import.meta.url
  ? fileURLToPath(import.meta.url)
  : (typeof __filename !== "undefined" ? __filename : "");

const resolvedDirname = typeof import.meta !== "undefined" && import.meta.url
  ? path.dirname(__filenameSaved)
  : (typeof __dirname !== "undefined" ? __dirname : process.cwd());

const firebaseConfigPath = [
  path.join(resolvedDirname, "firebase-applet-config.json"),
  path.join(process.cwd(), "firebase-applet-config.json"),
].find((candidate) => existsSync(candidate));

if (!firebaseConfigPath) {
  throw new Error("firebase-applet-config.json not found");
}

const firebaseConfig = JSON.parse(readFileSync(firebaseConfigPath, "utf-8")) as {
  firestoreDatabaseId: string;
  projectId: string;
};

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
  });
}
const authAdmin = admin.auth();
const dbAdmin = getFirestore(undefined, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  // Cloud Run / most hosts inject PORT; fall back for local prod runs.
  const PORT = Number(process.env.PORT) || 8080;
  
  // Lazy init stripe
  let stripeClient: Stripe | null = null;
  const getStripe = () => {
    if (!stripeClient) {
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
      stripeClient = new Stripe(key);
    }
    return stripeClient;
  };

  app.get("/api/config", (req, res) => {
    res.json({
      stripePaymentLink: process.env.VITE_STRIPE_PAYMENT_LINK || process.env.STRIPE_PAYMENT_LINK
    });
  });

  // Stripe Webhook needs raw body
  app.post("/api/webhook", express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    let event;

    try {
      if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
      event = getStripe().webhooks.constructEvent(req.body as Buffer, sig, webhookSecret);
    } catch (err: any) {
      console.error(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;

      if (userId) {
        console.log(`Payment successful for user: ${userId}`);
        try {
          await dbAdmin.collection('users').doc(userId).update({
            isSubscribed: true
          });
          console.log(`User ${userId} subscription status updated.`);
        } catch (dbErr) {
          console.error(`Database Error updating user ${userId}:`, dbErr);
        }
      }
    }

    res.json({ received: true });
  });

  // Large limit for base64 image uploads (spelling lists, essays, etc.)
  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ limit: '100mb', extended: true }));

  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err?.type === 'entity.too.large') {
      return res.status(413).json({ error: 'Upload too large. Try fewer or smaller photos.' });
    }
    next(err);
  });

  // Gemini AI Endpoints
  app.post("/api/gemini/extract-topic", async (req, res) => {
    try {
      const { imagesBase64 } = req.body;
      if (!imagesBase64 || !Array.isArray(imagesBase64)) {
        return res.status(400).json({ error: "imagesBase64 array is required" });
      }
      const topic = await extractTopicFromImage(imagesBase64);
      res.json({ topic });
    } catch (err: any) {
      console.error("Error in extract-topic endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to extract topic" });
    }
  });

  app.post("/api/gemini/evaluate-essay", async (req, res) => {
    try {
      const { imagesBase64, topic } = req.body;
      if (!imagesBase64 || !Array.isArray(imagesBase64) || !topic) {
        return res.status(400).json({ error: "imagesBase64 array and topic are required" });
      }
      const result = await evaluateEssay(imagesBase64, topic);
      res.json(result);
    } catch (err: any) {
      console.error("Error in evaluate-essay endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate essay" });
    }
  });

  app.post("/api/gemini/copilot-inspiration", async (req, res) => {
    try {
      const { chatHistory, currentPrompt, topic } = req.body;
      if (!chatHistory || !currentPrompt || !topic) {
        return res.status(400).json({ error: "chatHistory, currentPrompt, and topic are required" });
      }
      const inspiration = await getCoPilotInspiration(chatHistory, currentPrompt, topic);
      res.json({ inspiration });
    } catch (err: any) {
      console.error("Error in copilot-inspiration endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to get copilot inspiration" });
    }
  });

  app.post("/api/gemini/extract-spelling-list", async (req, res) => {
    try {
      const { items } = req.body;
      if (!items || !Array.isArray(items)) {
        return res.status(400).json({ error: "items array is required" });
      }
      const list = await extractSpellingList(items);
      res.json({ list });
    } catch (err: any) {
      console.error("Error in extract-spelling-list endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to extract spelling list" });
    }
  });

  app.post("/api/gemini/generate-speech", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "text is required" });
      }
      const audioBase64 = await generateSpeech(text);
      res.json({ audioBase64 });
    } catch (err: any) {
      console.error("Error in generate-speech endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate speech" });
    }
  });

  app.post("/api/gemini/generate-spelling-audio", async (req, res) => {
    try {
      const { word } = req.body;
      if (!word) {
        return res.status(400).json({ error: "word is required" });
      }
      const audioBase64 = await generateSpellingAudio(word);
      res.json({ audioBase64 });
    } catch (err: any) {
      console.error("Error in generate-spelling-audio endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate spelling audio" });
    }
  });

  app.post("/api/gemini/evaluate-spelling-answers", async (req, res) => {
    try {
      const { listItems, answerItems, words } = req.body;
      if (!listItems || !answerItems || !words) {
        return res.status(400).json({ error: "listItems, answerItems, and words are required" });
      }
      const result = await evaluateSpellingAnswers(listItems, answerItems, words);
      res.json(result);
    } catch (err: any) {
      console.error("Error in evaluate-spelling-answers endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate spelling answers" });
    }
  });

  app.post("/api/gemini/evaluate-oral-performance", async (req, res) => {
    try {
      const { options } = req.body;
      if (!options) {
        return res.status(400).json({ error: "options object is required" });
      }
      const evaluation = await evaluateOralPerformance(options);
      res.json(evaluation);
    } catch (err: any) {
      console.error("Error in evaluate-oral-performance endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate oral performance" });
    }
  });

  app.post("/api/gemini/generate-followup-question", async (req, res) => {
    try {
      const { question, transcript, subQuestionCount } = req.body;
      if (question === undefined || transcript === undefined || subQuestionCount === undefined) {
        return res.status(400).json({ error: "question, transcript, and subQuestionCount are required" });
      }
      const followUp = await generateFollowUpQuestion(question, transcript, subQuestionCount);
      res.json({ followUp });
    } catch (err: any) {
      console.error("Error in generate-followup-question endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate follow-up question" });
    }
  });

  app.post("/api/gemini/evaluate-oral-notes", async (req, res) => {
    try {
      const { options } = req.body;
      if (!options?.imageBase64) {
        return res.status(400).json({ error: "options.imageBase64 is required" });
      }
      const result = await evaluateOralNotes(options);
      res.json(result);
    } catch (err: any) {
      console.error("Error in evaluate-oral-notes endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate oral notes" });
    }
  });

  app.post("/api/gemini/generate-oral-answer-guide", async (req, res) => {
    try {
      const { options } = req.body;
      if (!options) {
        return res.status(400).json({ error: "options is required" });
      }
      const result = await generateOralAnswerGuide(options);
      res.json(result);
    } catch (err: any) {
      console.error("Error in generate-oral-answer-guide endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate oral answer guide" });
    }
  });

  app.post("/api/gemini/evaluate-oral-practice-answer", async (req, res) => {
    try {
      const { options } = req.body;
      if (!options) {
        return res.status(400).json({ error: "options is required" });
      }
      const result = await evaluateOralPracticeAnswer(options);
      res.json(result);
    } catch (err: any) {
      console.error("Error in evaluate-oral-practice-answer endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to evaluate practice answer" });
    }
  });

  app.post("/api/gemini/generate-oral-practice-summary", async (req, res) => {
    try {
      const { options } = req.body;
      if (!options) {
        return res.status(400).json({ error: "options is required" });
      }
      const result = await generateOralPracticeSummary(options);
      res.json(result);
    } catch (err: any) {
      console.error("Error in generate-oral-practice-summary endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate practice summary" });
    }
  });

  app.post("/api/gemini/generate-article-mcqs", async (req, res) => {
    try {
      const { article, title, questionCount, mcqCount, openCount } = req.body;
      if (!article || typeof article !== "string" || !article.trim()) {
        return res.status(400).json({ error: "article is required" });
      }
      const result = await generateArticleMcqs({
        article,
        title,
        questionCount,
        mcqCount: typeof mcqCount === "number" ? mcqCount : undefined,
        openCount: typeof openCount === "number" ? openCount : undefined,
      });
      res.json(result);
    } catch (err: any) {
      console.error("Error in generate-article-mcqs endpoint:", err);
      res.status(500).json({ error: err.message || "Failed to generate MCQs" });
    }
  });

  app.get("/api/article-quizzes", async (req, res) => {
    try {
      const publishedOnly = req.query.published === "1" || req.query.published === "true";
      const uid = typeof req.query.uid === "string" ? req.query.uid : "";
      const groupIdParam = typeof req.query.groupId === "string" ? req.query.groupId : "";

      // Student list: filter by joined group (via uid or explicit groupId).
      if (publishedOnly && (uid || groupIdParam)) {
        let groupId: string | null = groupIdParam || null;
        let pendingGroup = null as ReturnType<typeof getPendingGroupForUser>;
        if (uid && !groupIdParam) {
          groupId = getGroupForUser(uid)?.id ?? null;
          pendingGroup = getPendingGroupForUser(uid);
        }
        if (!groupId) {
          return res.json({ quizzes: [], group: null, pendingGroup });
        }
        const group = listGroups().find((g) => g.id === groupId) || null;
        return res.json({
          quizzes: listQuizzes(true, { groupId }),
          group,
          pendingGroup: null,
        });
      }

      res.json({ quizzes: listQuizzes(publishedOnly) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to list quizzes" });
    }
  });

  app.get("/api/article-groups", async (_req, res) => {
    try {
      res.json({ groups: listGroups() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to list groups" });
    }
  });

  app.post("/api/article-groups", async (req, res) => {
    try {
      const { name, code } = req.body || {};
      if (!name || typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ error: "name is required" });
      }
      const group = createGroup(
        String(name),
        typeof code === "string" && code.trim() ? String(code) : undefined,
      );
      res.json({ group });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to create group" });
    }
  });

  app.delete("/api/article-groups/:id", async (req, res) => {
    try {
      const ok = deleteGroup(req.params.id);
      if (!ok) return res.status(404).json({ error: "Group not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete group" });
    }
  });

  app.get("/api/article-groups/membership/:uid", async (req, res) => {
    try {
      const uid = String(req.params.uid);
      const group = getGroupForUser(uid);
      const pendingGroup = getPendingGroupForUser(uid);
      res.json({ group, pendingGroup });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load membership" });
    }
  });

  app.post("/api/article-groups/join", async (req, res) => {
    try {
      const { uid, code, studentName } = req.body || {};
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ error: "uid is required" });
      }
      if (!code || typeof code !== "string") {
        return res.status(400).json({ error: "code is required" });
      }
      const result = requestJoinGroupByCode(
        String(uid),
        String(code),
        typeof studentName === "string" ? studentName : undefined,
      );
      res.json({
        group: result.group,
        status: result.status,
        alreadyMember: result.alreadyMember,
        pending: result.status === "pending",
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to join group" });
    }
  });

  app.get("/api/article-groups/pending", async (_req, res) => {
    try {
      res.json({ pending: listPendingMemberships() });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to list pending joins" });
    }
  });

  app.post("/api/article-groups/approve", async (req, res) => {
    try {
      const { uid } = req.body || {};
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ error: "uid is required" });
      }
      const group = approveGroupMembership(String(uid));
      res.json({ group, status: "approved" });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to approve join" });
    }
  });

  app.post("/api/article-groups/reject", async (req, res) => {
    try {
      const { uid } = req.body || {};
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ error: "uid is required" });
      }
      const ok = rejectGroupMembership(String(uid));
      if (!ok) return res.status(404).json({ error: "No pending join request found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to reject join" });
    }
  });

  app.get("/api/admin/notifications", async (_req, res) => {
    try {
      const notifications = listAdminNotifications();
      res.json({
        notifications,
        unreadCount: notifications.filter((n) => !n.read).length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load notifications" });
    }
  });

  app.post("/api/admin/notifications/read", async (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : undefined;
      const marked = markAdminNotificationsRead(ids);
      res.json({ marked });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to mark notifications read" });
    }
  });

  app.post("/api/article-groups/leave", async (req, res) => {
    try {
      const { uid } = req.body || {};
      if (!uid || typeof uid !== "string") {
        return res.status(400).json({ error: "uid is required" });
      }
      leaveGroup(String(uid));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to leave group" });
    }
  });

  app.get("/api/article-quizzes/progress/:uid", async (req, res) => {
    try {
      const completedQuizIds = listCompletedQuizIdsForUser(String(req.params.uid));
      res.json({ completedQuizIds });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load progress" });
    }
  });

  app.get("/api/article-quizzes/:id/my-submission", async (req, res) => {
    try {
      const uid = typeof req.query.uid === "string" ? req.query.uid : "";
      if (!uid) return res.status(400).json({ error: "uid is required" });
      const quiz = getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const submission = getSubmissionForUser(req.params.id, uid);
      if (!submission) {
        return res.status(404).json({ error: "No submission found for this quiz" });
      }
      res.json({
        quiz: {
          id: quiz.id,
          title: quiz.title,
          article: quiz.article,
          sourceUrl: quiz.sourceUrl,
          questions: quiz.questions.map((q) => ({
            id: q.id,
            type: q.type || "mcq",
            prompt: q.prompt,
            options: q.options,
          })),
        },
        submission,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load submission review" });
    }
  });

  app.get("/api/article-quizzes/:id", async (req, res) => {
    try {
      const quiz = getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const hideAnswers = req.query.student === "1" || req.query.student === "true";
      const uid = typeof req.query.uid === "string" ? req.query.uid : "";
      if (hideAnswers && uid) {
        const group = getGroupForUser(uid);
        if (!quiz.groupId || !group || group.id !== quiz.groupId) {
          return res.status(403).json({ error: "Join this quiz's group to access it" });
        }
      }
      if (hideAnswers) {
        const safe = {
          ...quiz,
          questions: quiz.questions.map(({ correctOptionId, explanation, suggestedAnswer, ...rest }) => rest),
        };
        return res.json({ quiz: safe });
      }
      res.json({ quiz });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to get quiz" });
    }
  });

  app.post("/api/article-quizzes/fetch-url", async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== "string") {
        return res.status(400).json({ error: "url is required" });
      }
      const result = await fetchArticleFromUrl(url);
      res.json(result);
    } catch (err: any) {
      console.error("Error fetching article URL:", err);
      res.status(400).json({ error: err.message || "Failed to open article link" });
    }
  });

  app.post("/api/article-quizzes/extract-file", async (req, res) => {
    try {
      const { filename, mimeType, dataBase64 } = req.body || {};
      if (!filename || !dataBase64) {
        return res.status(400).json({ error: "filename and dataBase64 are required" });
      }
      const result = await extractTextFromUploadedFile({
        filename: String(filename),
        mimeType: mimeType ? String(mimeType) : undefined,
        dataBase64: String(dataBase64),
      });
      res.json(result);
    } catch (err: any) {
      console.error("Error extracting uploaded article file:", err);
      res.status(400).json({ error: err.message || "Failed to extract text from file" });
    }
  });

  app.post("/api/article-quizzes", async (req, res) => {
    try {
      const { title, article, questions, published, sourceUrl, groupId } = req.body;
      if (!article?.trim()) return res.status(400).json({ error: "article is required" });
      const now = Date.now();
      const quiz: ArticleQuiz = {
        id: `quiz_${now}_${Math.random().toString(36).slice(2, 8)}`,
        title: (title || "Untitled Article Quiz").trim(),
        article: String(article),
        sourceUrl: sourceUrl ? String(sourceUrl) : undefined,
        groupId: groupId ? String(groupId) : undefined,
        questions: Array.isArray(questions) ? questions : [],
        published: !!published,
        createdAt: now,
        updatedAt: now,
      };
      upsertQuiz(quiz);
      res.json({ quiz });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to create quiz" });
    }
  });

  app.put("/api/article-quizzes/:id", async (req, res) => {
    try {
      const { title, article, questions, published, sourceUrl, groupId } = req.body;
      const existing = getQuiz(req.params.id);
      if (!existing) return res.status(404).json({ error: "Quiz not found" });
      const updated = updateQuizQuestions(
        req.params.id,
        Array.isArray(questions) ? questions : existing.questions,
        {
          title: title !== undefined ? String(title) : existing.title,
          article: article !== undefined ? String(article) : existing.article,
          published: published !== undefined ? !!published : existing.published,
          sourceUrl:
            sourceUrl !== undefined
              ? sourceUrl
                ? String(sourceUrl)
                : undefined
              : existing.sourceUrl,
          groupId:
            groupId !== undefined
              ? groupId
                ? String(groupId)
                : undefined
              : existing.groupId,
        },
      );
      res.json({ quiz: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update quiz" });
    }
  });

  app.delete("/api/article-quizzes/:id", async (req, res) => {
    try {
      const ok = deleteQuiz(req.params.id);
      if (!ok) return res.status(404).json({ error: "Quiz not found" });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to delete quiz" });
    }
  });

  app.post("/api/article-quizzes/:id/start-read", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) return res.status(400).json({ error: "uid is required" });

      const quiz = getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      const membershipGroup = getGroupForUser(String(uid));
      if (!quiz.groupId || !membershipGroup || membershipGroup.id !== quiz.groupId) {
        return res.status(403).json({ error: "Join this quiz's group to access it" });
      }

      const existing = getSubmissionForUser(req.params.id, String(uid));
      if (existing) {
        return res.json({
          alreadyCompleted: true,
          readXp: 0,
          submission: existing,
        });
      }

      const result = startArticleQuizRead(req.params.id, String(uid));
      res.json({
        alreadyCompleted: false,
        alreadyRead: result.alreadyRead,
        readXp: result.readXpAwarded ? ARTICLE_READ_XP : 0,
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to start reading" });
    }
  });

  app.post("/api/article-quizzes/:id/submit", async (req, res) => {
    try {
      const { uid, studentName, answers } = req.body;
      if (!uid || !studentName || !answers) {
        return res.status(400).json({ error: "uid, studentName, and answers are required" });
      }
      const quiz = getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });
      if (!quiz.published) return res.status(400).json({ error: "Quiz is not published" });

      const membershipGroup = getGroupForUser(String(uid));
      if (!quiz.groupId || !membershipGroup || membershipGroup.id !== quiz.groupId) {
        return res.status(403).json({ error: "Join this quiz's group to access it" });
      }

      if (getSubmissionForUser(req.params.id, String(uid))) {
        return res.status(409).json({ error: "This account already completed this quiz. Only one attempt per account." });
      }

      const markPayload = quiz.questions.map((q) => {
        const isOpen = q.type === 'open';
        const answer = String(answers[q.id] || '');
        return {
          id: q.id,
          type: isOpen ? 'open' as const : 'mcq' as const,
          prompt: q.prompt,
          options: q.options || [],
          correctOptionId: q.correctOptionId || '',
          explanation: q.explanation,
          suggestedAnswer: q.suggestedAnswer,
          studentOptionId: isOpen ? undefined : answer,
          studentAnswerText: isOpen ? answer : undefined,
        };
      });

      const marking = await markArticleQuizAnswers({
        article: quiz.article,
        title: quiz.title,
        questions: markPayload,
      });

      const submission = submitQuizAnswers({
        quizId: req.params.id,
        uid: String(uid),
        studentName: String(studentName),
        answers,
        score: marking.score,
        maxScore: marking.maxScore || quiz.questions.length,
        overallFeedback: marking.overallFeedback,
        questionResults: marking.questionResults,
      });

      const questionTypeById = new Map(
        quiz.questions.map((q) => [q.id, q.type === 'open' ? 'open' as const : 'mcq' as const]),
      );
      const xp = calculateArticleQuizCompletionXp({
        questionResults: (marking.questionResults || []).map((r: { questionId: string; isCorrect: boolean }) => ({
          questionId: r.questionId,
          isCorrect: !!r.isCorrect,
          type: questionTypeById.get(r.questionId) || 'mcq',
        })),
      });

      try {
        await refreshClassStats(req.params.id);
      } catch (e) {
        console.warn("Class stats refresh failed (submission still saved):", e);
      }

      res.json({
        submission,
        xpAwarded: {
          completeXp: xp.completeXp,
          perfectBonusXp: xp.perfectBonusXp,
          mcqXp: xp.mcqXp,
          openXp: xp.openXp,
          correctMcqCount: xp.correctMcqCount,
          correctOpenCount: xp.correctOpenCount,
          totalXp: xp.totalXp,
        },
      });
    } catch (err: any) {
      console.error("Error submitting article quiz:", err);
      res.status(400).json({ error: err.message || "Failed to submit" });
    }
  });

  async function loadRosterStudents(quiz: ArticleQuiz): Promise<Array<{ uid: string; studentName: string }>> {
    // Prefer group members when the quiz is assigned to a group.
    if (quiz.groupId) {
      const members = listApprovedMembers(quiz.groupId);
      const nameByUid = new Map<string, string>();
      try {
        const snap = await dbAdmin.collection("users").get();
        for (const doc of snap.docs) {
          const data = doc.data() as { profile?: { name?: string } };
          nameByUid.set(doc.id, data.profile?.name || doc.id);
        }
      } catch {
        /* optional */
      }
      return members.map((m) => ({
        uid: m.uid,
        studentName: m.studentName || nameByUid.get(m.uid) || m.uid,
      }));
    }

    try {
      const snap = await dbAdmin.collection("users").get();
      return snap.docs.map((doc) => {
        const data = doc.data() as { profile?: { name?: string } };
        return { uid: doc.id, studentName: data.profile?.name || doc.id };
      });
    } catch {
      return [];
    }
  }

  async function refreshClassStats(quizId: string): Promise<ArticleQuizClassStats> {
    const quiz = getQuiz(quizId);
    if (!quiz) throw new Error("Quiz not found");

    const students = await loadRosterStudents(quiz);
    const roster = getRoster(quizId, students);
    const submissions = listSubmissionsForQuiz(quizId);
    const scores = submissions.map((s) => s.score);
    const maxScore =
      submissions[0]?.maxScore ||
      quiz.questions.length ||
      1;
    const averageScore = scores.length
      ? scores.reduce((a, b) => a + b, 0) / scores.length
      : 0;

    const questionAccuracy = computeQuestionAccuracyFromSubmissions(quiz, submissions);

    const ai = await consolidateArticleQuizStats({
      title: quiz.title,
      questions: quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt })),
      submissions: submissions.map((s) => ({
        studentName: s.studentName,
        score: s.score,
        maxScore: s.maxScore,
        questionResults: s.questionResults?.map((r) => ({
          questionId: r.questionId,
          isCorrect: r.isCorrect,
          studentAnswerText: r.studentAnswerText,
        })),
      })),
      unsubmittedNames: roster.unsubmitted.map((u) => u.studentName),
    });

    // Prefer deterministic accuracy / common wrong answers; keep AI narrative fields.
    const mergedAccuracy = questionAccuracy.map((qa) => {
      const fromAi = (ai.questionAccuracy || []).find((a) => a.questionId === qa.questionId);
      return {
        ...qa,
        commonWrongAnswer: qa.commonWrongAnswer || fromAi?.commonWrongAnswer,
        commonWrongCount: qa.commonWrongCount,
      };
    });

    const stats: ArticleQuizClassStats = {
      quizId,
      totalStudents: roster.submitted.length + roster.unsubmitted.length,
      submittedCount: roster.submitted.length,
      unsubmittedCount: roster.unsubmitted.length,
      averageScore: Math.round(averageScore * 10) / 10,
      averagePercent: Math.round((averageScore / maxScore) * 100),
      highestScore: scores.length ? Math.max(...scores) : 0,
      lowestScore: scores.length ? Math.min(...scores) : 0,
      questionAccuracy: mergedAccuracy,
      aiSummary: ai.aiSummary || "",
      strengths: ai.strengths || [],
      weaknesses: ai.weaknesses || [],
      recommendations: ai.recommendations || [],
      updatedAt: Date.now(),
    };
    return saveQuizClassStats(stats);
  }

  app.post("/api/article-quizzes/:id/refresh-stats", async (req, res) => {
    try {
      const stats = await refreshClassStats(req.params.id);
      res.json({ classStats: stats });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to refresh stats" });
    }
  });

  app.get("/api/article-quizzes/:id/roster", async (req, res) => {
    try {
      const quiz = getQuiz(req.params.id);
      if (!quiz) return res.status(404).json({ error: "Quiz not found" });

      const students = await loadRosterStudents(quiz);
      res.json({ roster: getRoster(req.params.id, students) });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to load roster" });
    }
  });

  // Vite middleware (dev only — keep `vite` out of the production boot path)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
