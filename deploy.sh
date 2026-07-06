#!/bin/bash
set -e

# Default values
PROJECT_ID=$(gcloud config get-value project)
REGION="us-central1"

echo "===================================================="
echo "🚀 Deploying MySociety to Google Cloud"
echo "Project: $PROJECT_ID | Region: $REGION"
echo "===================================================="

# Fetch the existing API URL to embed in the frontend builds
export API_URL=$(gcloud run services describe mysociety-api --region=$REGION --format="value(status.url)")
if [ -z "$API_URL" ]; then
  echo "⚠️ Warning: Could not retrieve API URL. Ensure mysociety-api is already deployed!"
  API_URL=""
else
  echo "✅ Detected existing API URL: $API_URL"
fi

echo -e "\n📦 Building all Docker images..."
gcloud builds submit --config cloudbuild.yaml . --substitutions=_API_URL="$API_URL",COMMIT_SHA=latest

echo -e "\n🌐 Deploying API service..."
gcloud run deploy mysociety-api \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/mysociety-repo/api:latest \
  --region=$REGION \
  --quiet

# Fetch the URL again in case it's a first-time deployment that didn't have one before
export API_URL=$(gcloud run services describe mysociety-api --region=$REGION --format="value(status.url)")
echo "✅ API URL is: $API_URL"

echo -e "\n💻 Deploying Admin frontend..."
gcloud run deploy mysociety-admin \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/mysociety-repo/admin:latest \
  --region=$REGION \
  --set-env-vars="API_URL=$API_URL,NEXT_PUBLIC_API_URL=$API_URL,NODE_ENV=production" \
  --quiet

echo -e "\n📱 Deploying Resident frontend..."
gcloud run deploy mysociety-resident \
  --image=$REGION-docker.pkg.dev/$PROJECT_ID/mysociety-repo/resident:latest \
  --region=$REGION \
  --set-env-vars="API_URL=$API_URL,NEXT_PUBLIC_API_URL=$API_URL,NODE_ENV=production" \
  --quiet

echo -e "\n✅ Deployment complete!"
