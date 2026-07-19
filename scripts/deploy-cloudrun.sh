#!/usr/bin/env bash
# Deploy DreamerQuest to Google Cloud Run from this machine.
# Prerequisites: gcloud CLI, billing-enabled GCP project, firebase-applet-config.json present.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVICE_NAME="${SERVICE_NAME:-dreamerquest-app}"
REGION="${REGION:-asia-southeast1}"
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"

if [[ -z "${PROJECT_ID}" || "${PROJECT_ID}" == "(unset)" ]]; then
  echo "Set a GCP project first: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

if [[ ! -f firebase-applet-config.json ]]; then
  echo "Missing firebase-applet-config.json"
  echo "  cp firebase-applet-config.example.json firebase-applet-config.json"
  echo "  # then fill in Firebase web config"
  exit 1
fi

if [[ ! -f .gcloudignore ]]; then
  echo "Warning: .gcloudignore missing. Cloud Build may exclude gitignored firebase-applet-config.json."
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  if [[ -f .env.local ]]; then
    # shellcheck disable=SC1091
    set -a && source .env.local && set +a
  fi
fi

if [[ -z "${GEMINI_API_KEY:-}" ]]; then
  echo "GEMINI_API_KEY is required (export it or put it in .env.local)."
  exit 1
fi

FIREBASE_PROJECT_ID="${FIREBASE_PROJECT_ID:-$(node -e "console.log(require('./firebase-applet-config.json').projectId)")}"

echo "Project:  ${PROJECT_ID}"
echo "Service:  ${SERVICE_NAME}"
echo "Region:   ${REGION}"
echo "Firebase: ${FIREBASE_PROJECT_ID}"

# Enable required APIs (idempotent)
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  --project="${PROJECT_ID}"

# First deploy may not know the final URL yet; APP_URL is updated in a second step.
ENV_VARS="NODE_ENV=production,GEMINI_API_KEY=${GEMINI_API_KEY},FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}"
if [[ -n "${STRIPE_SECRET_KEY:-}" ]]; then
  ENV_VARS+=",STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}"
fi
if [[ -n "${STRIPE_PAYMENT_LINK:-}" ]]; then
  ENV_VARS+=",STRIPE_PAYMENT_LINK=${STRIPE_PAYMENT_LINK}"
fi
if [[ -n "${VITE_STRIPE_PAYMENT_LINK:-}" ]]; then
  ENV_VARS+=",VITE_STRIPE_PAYMENT_LINK=${VITE_STRIPE_PAYMENT_LINK}"
fi
if [[ -n "${STRIPE_WEBHOOK_SECRET:-}" ]]; then
  ENV_VARS+=",STRIPE_WEBHOOK_SECRET=${STRIPE_WEBHOOK_SECRET}"
fi

gcloud run deploy "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --source=. \
  --quiet \
  --allow-unauthenticated \
  --clear-base-image \
  --remove-containers=app-container \
  --port=8080 \
  --memory=1Gi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=300 \
  --set-env-vars="${ENV_VARS}"

SERVICE_URL="$(gcloud run services describe "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --format='value(status.url)')"

echo "Updating APP_URL=${SERVICE_URL}"
gcloud run services update "${SERVICE_NAME}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --update-env-vars="APP_URL=${SERVICE_URL}"

echo ""
echo "Deployed: ${SERVICE_URL}"
echo "Next:"
echo "  1) Firebase Console → Authentication → Settings → Authorized domains → add host of ${SERVICE_URL}"
echo "  2) Ensure the Cloud Run runtime service account can access Firestore (e.g. roles/datastore.user)"
echo "  3) Article quizzes / groups are persisted in Firestore (collections dq_article_*)."
