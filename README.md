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
