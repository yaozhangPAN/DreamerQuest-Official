import express from "express";
import { createServer as createViteServer } from "vite";
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
  generateFollowUpQuestion
} from "./serverGeminiService";

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
  const PORT = 3000;
  
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

  // Regular JSON parsing for other routes (large limit for base64 image uploads)
  app.use(express.json({ limit: '50mb' }));

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

  // GitHub OAuth & Integration Endpoints
  app.get("/api/auth/github/url", (req, res) => {
    try {
      const { uid } = req.query;
      if (!uid) {
        return res.status(400).json({ error: "User UID is required" });
      }
      
      const clientId = process.env.GITHUB_CLIENT_ID;
      if (!clientId) {
        return res.status(500).json({ error: "GITHUB_CLIENT_ID is not configured in environment variables" });
      }

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
      const redirectUri = `${baseUrl}/api/auth/github/callback`;

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        scope: "read:user,repo",
        state: uid as string,
      });

      const authUrl = `https://github.com/login/oauth/authorize?${params.toString()}`;
      res.json({ url: authUrl });
    } catch (err: any) {
      console.error("Error generating GitHub auth URL:", err);
      res.status(500).json({ error: err.message || "Failed to generate auth URL" });
    }
  });

  const handleGithubCallback = async (req: any, res: any) => {
    const { code, state: uid } = req.query;
    if (!code || !uid) {
      return res.status(400).send("Authorization code or user state is missing.");
    }

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return res.status(500).send("GitHub client configuration (GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET) is missing in environment variables.");
    }

    try {
      // 1. Exchange code for access token
      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error(`Failed to exchange code: ${tokenResponse.statusText}`);
      }

      const tokenData = await tokenResponse.json() as any;
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        throw new Error(tokenData.error_description || "No access token returned from GitHub. Check if your client secret or ID is correct.");
      }

      // 2. Fetch user details from GitHub API
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `token ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DreamerQuest-App",
        },
      });

      if (!userResponse.ok) {
        throw new Error(`Failed to fetch GitHub profile: ${userResponse.statusText}`);
      }

      const userProfile = await userResponse.json() as any;

      // 3. Save connection details in Firestore
      await dbAdmin.collection("users").doc(uid as string).set({
        githubConnection: {
          username: userProfile.login,
          avatarUrl: userProfile.avatar_url,
          accessToken,
          connectedAt: Date.now()
        }
      }, { merge: true });

      // 4. Return window closure script sending OAUTH_AUTH_SUCCESS to parent/opener
      res.send(`
        <html>
          <body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; background: #f8fafc; color: #1e293b; margin: 0;">
            <div style="text-align: center; background: white; padding: 2.5rem; border-radius: 1.5rem; border: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0,0,0,0.1); max-width: 400px; margin: 10px;">
              <h2 style="color: #4f46e5; margin-top: 0; font-size: 1.5rem;">Connected to GitHub Successfully!</h2>
              <p style="margin-bottom: 1.5rem; font-weight: 500; color: #475569;">You are connected as <strong style="color: #1e293b;">@${userProfile.login}</strong>.</p>
              <div style="display: inline-block; width: 1.5rem; height: 1.5rem; border: 3px solid #e2e8f0; border-top-color: #4f46e5; border-radius: 50%; animation: spin 1s linear infinite;"></div>
              <p style="font-size: 0.875rem; color: #64748b; margin-top: 1rem;">This popup window will close automatically...</p>
            </div>
            <script>
              setTimeout(() => {
                if (window.opener) {
                  window.opener.postMessage({ type: 'OAUTH_AUTH_SUCCESS' }, '*');
                  window.close();
                } else {
                  window.location.href = '/';
                }
              }, 1500);
            </script>
            <style>
              @keyframes spin { to { transform: rotate(360deg); } }
            </style>
          </body>
        </html>
      `);
    } catch (err: any) {
      console.error("Error in GitHub callback:", err);
      res.status(500).send(`Authentication failed: ${err.message}`);
    }
  };

  app.get("/api/auth/github/callback", handleGithubCallback);
  app.get("/api/auth/github/callback/", handleGithubCallback);

  app.post("/api/github/disconnect", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "User UID is required" });
      }

      await dbAdmin.collection("users").doc(uid).update({
        githubConnection: admin.firestore.FieldValue.delete()
      });
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in disconnecting GitHub:", err);
      res.status(500).json({ error: err.message || "Failed to disconnect GitHub" });
    }
  });

  app.post("/api/github/sync", async (req, res) => {
    try {
      const { uid } = req.body;
      if (!uid) {
        return res.status(400).json({ error: "User UID is required" });
      }

      // 1. Fetch user data from Firestore
      const userDoc = await dbAdmin.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ error: "User not found" });
      }

      const userData = userDoc.data();
      const github = userData?.githubConnection;
      if (!github || !github.accessToken) {
        return res.status(400).json({ error: "GitHub account is not connected" });
      }

      const token = github.accessToken;
      const username = github.username;
      const repoName = "DreamerQuest-Portfolio";

      // 2. Check if repo exists
      const repoCheckResponse = await fetch(`https://api.github.com/repos/${username}/${repoName}`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DreamerQuest-App",
        },
      });

      let repoExists = repoCheckResponse.ok;

      // 3. Create repo if it doesn't exist
      if (!repoExists) {
        const createRepoResponse = await fetch("https://api.github.com/user/repos", {
          method: "POST",
          headers: {
            Authorization: `token ${token}`,
            "Content-Type": "application/json",
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "DreamerQuest-App",
          },
          body: JSON.stringify({
            name: repoName,
            description: "My DreamerQuest Creative Writing Portfolio and Learning Journey!",
            private: false,
            auto_init: true, // create README automatically
          }),
        });

        if (!createRepoResponse.ok) {
          const errData = await createRepoResponse.json() as any;
          throw new Error(errData.message || "Failed to create repository");
        }
      }

      // 4. Generate the portfolio markdown content from user submissions
      const submissions = userData?.submissions || [];
      const stats = {
        level: userData?.level || 1,
        totalXp: userData?.totalXp || 0,
        prizesWonCount: (userData?.prizesWon || []).length,
      };

      let mdContent = `# 🌟 My DreamerQuest Creative Writing Portfolio\n\n`;
      mdContent += `Welcome to my creative writing portfolio and spelling achievements! Backed up automatically from my DreamerQuest learning journey.\n\n`;
      mdContent += `## 📊 My Achievements\n\n`;
      mdContent += `- 🏆 **Level:** ${stats.level}\n`;
      mdContent += `- ✨ **Total Experience Points (XP):** ${stats.totalXp} XP\n`;
      mdContent += `- 🎁 **Prizes Unlocked:** ${stats.prizesWonCount} Robux Rewards\n\n`;
      mdContent += `## 📚 Completed Submissions\n\n`;

      if (submissions.length === 0) {
        mdContent += `*No submissions recorded yet. Time to start writing!*\n`;
      } else {
        submissions.forEach((sub: any, idx: number) => {
          const dateStr = new Date(sub.completedAt).toLocaleDateString("en-US", {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          });
          mdContent += `### ${idx + 1}. ${sub.name}\n`;
          mdContent += `- 📝 **Type:** ${sub.type}\n`;
          mdContent += `- 📅 **Date:** ${dateStr}\n`;
          mdContent += `- ✨ **XP Earned:** +${sub.xpEarned} XP\n\n`;
        });
      }

      mdContent += `\n*Last synchronized on: ${new Date().toLocaleString()}*\n`;

      // 5. Check if README.md exists in the repo to get its sha for update
      const fileCheckResponse = await fetch(`https://api.github.com/repos/${username}/${repoName}/contents/README.md`, {
        headers: {
          Authorization: `token ${token}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DreamerQuest-App",
        },
      });

      let sha: string | undefined;
      if (fileCheckResponse.ok) {
        const fileData = await fileCheckResponse.json() as any;
        sha = fileData.sha;
      }

      // 6. Create or update README.md with portfolio content
      const putFileResponse = await fetch(`https://api.github.com/repos/${username}/${repoName}/contents/README.md`, {
        method: "PUT",
        headers: {
          Authorization: `token ${token}`,
          "Content-Type": "application/json",
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "DreamerQuest-App",
        },
        body: JSON.stringify({
          message: "Sync DreamerQuest Writing Portfolio & Achievements",
          content: Buffer.from(mdContent).toString("base64"),
          sha,
        }),
      });

      if (!putFileResponse.ok) {
        const errData = await putFileResponse.json() as any;
        throw new Error(errData.message || "Failed to update portfolio on GitHub");
      }

      res.json({
        success: true,
        repoUrl: `https://github.com/${username}/${repoName}`,
      });
    } catch (err: any) {
      console.error("Error in GitHub sync:", err);
      res.status(500).json({ error: err.message || "Failed to sync with GitHub" });
    }
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
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
