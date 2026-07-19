# DreamerQuest

Full-stack oral / spelling / composition practice app (Vite + Express + Firebase + Gemini).

View in AI Studio: https://ai.studio/apps/a8f120c7-0500-4cde-a1ea-833c59420a9c

## Prerequisites

- Node.js 18+
- A [Gemini API key](https://aistudio.google.com/apikey)
- Firebase project config (for auth / Firestore)

## Clone & local setup

```bash
git clone https://github.com/yaozhangPAN/DreamerQuest-Official.git
cd DreamerQuest-Official
npm install
```

After cloning, **two local config files are required**. They are gitignored and are **not** included in the repository.

### 1. Environment variables — `.env.local`

Copy the example file and fill in your secrets:

```bash
cp .env.example .env.local
```

Edit `.env.local` and set at minimum:

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key (server-side AI) |
| `FIREBASE_PROJECT_ID` | Yes | Firebase project ID |
| `VITE_DEV_AUTH_BYPASS` | Local dev | Set to `true` to skip Google OAuth locally |

Optional (payments, production): see comments in `.env.example` for `STRIPE_*`, `APP_URL`.

> **Never commit `.env.local`.** It is listed in `.gitignore`.

### 2. Firebase client config — `firebase-applet-config.json`

Copy the example and paste your Firebase web app settings:

```bash
cp firebase-applet-config.example.json firebase-applet-config.json
```

Edit `firebase-applet-config.json` with values from Firebase Console → **Project settings** → **Your apps** → Web app config (`projectId`, `appId`, `apiKey`, `authDomain`, etc.).

> **Never commit `firebase-applet-config.json`.** Use `firebase-applet-config.example.json` as the template only.

## Run locally

```bash
npm run dev
```

Open http://localhost:3000

To load `.env.local` explicitly in your shell (if needed):

```bash
set -a && source .env.local && set +a && npm run dev
```

## Build for production

```bash
npm run build
npm start
```

Ensure `.env.local` (or host environment variables) and `firebase-applet-config.json` exist on the server before starting.

## Deploy to Google Cloud Run

This app is a long-running Express server — **Cloud Run** is the recommended host.

### One-time setup

1. Install / login to the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install):

```bash
gcloud auth login
gcloud config set project YOUR_GCP_PROJECT_ID
```

2. Ensure local files exist (same as local setup):

```bash
cp firebase-applet-config.example.json firebase-applet-config.json
# fill Firebase web config
# .env.local must contain at least GEMINI_API_KEY
```

3. (Recommended) Give the Cloud Run runtime service account Firestore access, e.g. **Cloud Datastore User** (`roles/datastore.user`) on your GCP project — so Firebase Admin can read/write user stats.

### Deploy

From the repo root (builds with the included `Dockerfile`):

```bash
# Option A — helper script (reads GEMINI_API_KEY from env or .env.local)
./scripts/deploy-cloudrun.sh

# Option B — manual
export GEMINI_API_KEY=...
export FIREBASE_PROJECT_ID=...   # usually same as firebase-applet-config.json projectId
gcloud run deploy dreamerquest \
  --region=asia-southeast1 \
  --source=. \
  --allow-unauthenticated \
  --port=8080 \
  --memory=1Gi \
  --set-env-vars="NODE_ENV=production,GEMINI_API_KEY=${GEMINI_API_KEY},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
```

After the first deploy, set `APP_URL` to the service URL shown by Cloud Run (`https://….run.app`), then:

**Firebase Console → Authentication → Settings → Authorized domains** → add that Cloud Run host.

### Notes

- Do **not** set `VITE_DEV_AUTH_BYPASS` in Cloud Run.
- Article quiz data (groups, quizzes, submissions) is stored in **Firestore** and survives Cloud Run deploys.
- Prefer Secret Manager for `GEMINI_API_KEY` in production instead of plain env vars once you harden the setup.
