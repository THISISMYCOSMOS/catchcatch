# CatchCatch Cloud Run deployment

This deployment keeps the public Next.js ingress and the Core, Backend, and
Agent sidecars in one Cloud Run service. The browser calls `/api/v1` on the same
origin, while the containers communicate over localhost.

## Cost-first settings

- Request-based billing with CPU throttling
- Minimum instances: `0`
- Maximum instances: `1`
- Concurrency: `1` because the containers use fractional CPU
- Startup CPU boost disabled

`us-central1` is the cost-first region. Use `asia-northeast3` only when Seoul
latency is more important than the lowest regional price tier. Cloud Run and
Artifact Registry free tiers are usage limits, not a zero-cost guarantee.
For an eligible new account, the separate Google Cloud Free Trial provides
$300 of credit for 90 days. OpenAI, Supabase, SOLAPI, and other external-service
charges are not covered by Google Cloud credit.

## Required Secret Manager secrets

- `catchcatch-internal-api-token`
- `catchcatch-supabase-url`
- `catchcatch-supabase-anon-key`
- `catchcatch-supabase-service-role-key`
- `catchcatch-phone-identity-hmac-secret`
- `catchcatch-terms-version`
- `catchcatch-terms-document-sha256`
- `catchcatch-openai-api-key`
- `catchcatch-gemini-api-key`

Do not commit secret values. The Cloud Run service account must have Secret
Manager Secret Accessor access to these secrets.

## Build and deploy

Authenticate `gcloud`, select the exact project, and enable Cloud Run, Cloud
Build, Artifact Registry, Secret Manager, and IAM APIs. Create a Docker Artifact
Registry repository named `catchcatch` in the selected region and a service
account named `catchcatch-runner`.

Build all four images with Cloud Build:

```powershell
$tag = git rev-parse --short HEAD
gcloud builds submit --config deploy/cloud-run/cloudbuild.yaml --substitutions "_REGION=us-central1,_REPOSITORY=catchcatch,_TAG=$tag" .
```

Render the checked template and deploy it:

```powershell
$projectId = gcloud config get-value project
$tag = git rev-parse --short HEAD
./deploy/cloud-run/render-service.ps1 -ProjectId $projectId -Region us-central1 -Tag $tag
gcloud run services replace deploy/cloud-run/service.generated.yaml --region us-central1 --project $projectId
gcloud run services add-iam-policy-binding catchcatch --region us-central1 --project $projectId --member allUsers --role roles/run.invoker
```

After deployment, verify `/`, `/health` through the internal containers' startup
probes, login, OTP signup, quota retrieval, one analysis, and quota refresh.
