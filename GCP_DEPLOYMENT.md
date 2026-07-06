# Deploying MySociety to Google Cloud Platform (GCP)

This guide walks you through deploying the MySociety platform (API, Admin, and Resident apps) on Google Cloud. We use **Cloud Run** for hosting the services, **Cloud SQL (PostgreSQL)** for the database, **Memorystore (Redis)** for caching, and **Artifact Registry** + **Cloud Build** for the CI/CD pipeline.

## 1. Prerequisites

- A Google Cloud project with billing enabled.
- `gcloud` CLI installed and authenticated.
- Enable necessary APIs:
  ```bash
  gcloud services enable run.googleapis.com sqladmin.googleapis.com redis.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com compute.googleapis.com vpcaccess.googleapis.com
  ```

## 2. Set up the Database (Cloud SQL)

1. Create a PostgreSQL 16 instance:
   ```bash
   gcloud sql instances create mysociety-db --database-version=POSTGRES_16 --cpu=1 --memory=4GB --region=us-central1
   ```
2. Create the `mysociety` database:
   ```bash
   gcloud sql databases create mysociety --instance=mysociety-db
   ```
3. Set the `postgres` user password:
   ```bash
   gcloud sql users set-password postgres --instance=mysociety-db --password=YOUR_STRONG_PASSWORD
   ```

## 3. Set up Redis (Memorystore)

Create a Redis instance:
```bash
gcloud redis instances create mysociety-redis --size=1 --region=us-central1 --redis-version=redis_7_0
```
Note the host IP of the Redis instance once created.

## 4. Build and Push Images (Artifact Registry + Cloud Build)

1. Create an Artifact Registry repository for Docker images:
   ```bash
   gcloud artifacts repositories create mysociety-repo --repository-format=docker --location=us-central1 --description="Docker repository for MySociety"
   ```
2. Submit a Cloud Build job to build and push the images using the provided `cloudbuild.yaml`:
   ```bash
   gcloud builds submit --config cloudbuild.yaml .
   ```
   *(Note: This uses the commit SHA to tag images. You can also specify it directly, e.g., `--substitutions=COMMIT_SHA=latest`)*

## 5. Deploy to Cloud Run

We will deploy the 3 services. First, deploy the API so you can obtain its URL to pass to the frontends.

### Deploy API Service

```bash
gcloud run deploy mysociety-api \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/mysociety-repo/api:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --add-cloudsql-instances=YOUR_PROJECT_ID:us-central1:mysociety-db \
  --set-env-vars="DATABASE_URL=postgresql://postgres:YOUR_STRONG_PASSWORD@/mysociety?host=/cloudsql/YOUR_PROJECT_ID:us-central1:mysociety-db,JWT_SECRET=your_jwt_secret,INTEGRATION_ENCRYPTION_KEY=your_encryption_key,NODE_ENV=production,REDIS_URL=redis://YOUR_REDIS_IP:6379"
```
*(The API runs migrations automatically on startup.)*

Note the deployed API URL (e.g., `https://mysociety-api-xyz.a.run.app`).

### Deploy Admin Service

```bash
gcloud run deploy mysociety-admin \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/mysociety-repo/admin:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="API_URL=https://mysociety-api-xyz.a.run.app,NODE_ENV=production"
```

### Deploy Resident Service

```bash
gcloud run deploy mysociety-resident \
  --image=us-central1-docker.pkg.dev/YOUR_PROJECT_ID/mysociety-repo/resident:latest \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="API_URL=https://mysociety-api-xyz.a.run.app,NODE_ENV=production"
```

## 6. (Optional) VPC Setup for Redis Connectivity

Since Cloud Run and Memorystore are in different environments, Cloud Run needs a Serverless VPC Access connector to reach the internal Redis IP:

1. Create a VPC connector:
   ```bash
   gcloud compute networks vpc-access connectors create mysociety-vpc-connector --region=us-central1 --range=10.8.0.0/28
   ```
2. Update the API service to use this connector:
   ```bash
   gcloud run services update mysociety-api --vpc-connector=mysociety-vpc-connector --region=us-central1
   ```

## 7. Seed Synthetic Data (Optional)

You can seed the database by running a Cloud Run Job or connecting to the DB locally via Cloud SQL Auth Proxy and running the seed script.

To run via API container locally (if you have Docker set up with service account credentials):
```bash
docker run -e SEED_ENABLED=true -e DATABASE_URL=... us-central1-docker.pkg.dev/YOUR_PROJECT_ID/mysociety-repo/api:latest node dist/seed-runner.js
```
