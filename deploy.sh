#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd -- "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)

die() {
  echo "Error: $*" >&2
  exit 1
}

usage() {
  cat <<'USAGE'
Usage: ./deploy.sh pr <pr-number> [--image-tag <tag>] [--service-suffix <suffix>]

Environment variables:
  GCP_PROJECT                Target Google Cloud project (overridden by PROJECT_ID_OVERRIDE)
  GCP_REGION                 Deployment region (overridden by REGION_OVERRIDE)
  ARTIFACT_REPOSITORY        Artifact Registry repository name (default: ai-universe-previews)
  PROJECT_ID_OVERRIDE        Force a project id without editing the script
  REGION_OVERRIDE            Force a region without editing the script
  SERVICE_NAME_OVERRIDE      Provide an explicit Cloud Run service name
  ARTIFACT_REPOSITORY_OVERRIDE Override Artifact Registry repository name
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  die "Missing command"
fi

COMMAND=$1
shift

case "$COMMAND" in
  pr)
    if [[ $# -lt 1 ]]; then
      die "Missing pull request number"
    fi
    PR_NUMBER=$1
    shift

    if ! [[ "$PR_NUMBER" =~ ^[1-9][0-9]*$ ]]; then
      die "PR number must be a positive integer, got: $PR_NUMBER"
    fi

    IMAGE_TAG="${GITHUB_SHA:-latest}"
    SERVICE_SUFFIX=""

    while [[ $# -gt 0 ]]; do
      case "$1" in
        --image-tag)
          IMAGE_TAG=$2
          shift 2
          ;;
        --service-suffix)
          SERVICE_SUFFIX=$2
          shift 2
          ;;
        --help|-h)
          usage
          exit 0
          ;;
        *)
          die "Unknown option: $1"
          ;;
      esac
    done

    PROJECT="${PROJECT_ID_OVERRIDE:-${GCP_PROJECT:-}}"
    REGION="${REGION_OVERRIDE:-${GCP_REGION:-us-central1}}"
    REPOSITORY="${ARTIFACT_REPOSITORY_OVERRIDE:-${ARTIFACT_REPOSITORY:-ai-universe-previews}}"

    [[ -n "$PROJECT" ]] || die "GCP project must be provided via GCP_PROJECT or PROJECT_ID_OVERRIDE"

    if [[ -n "${SERVICE_NAME_OVERRIDE:-}" ]]; then
      SERVICE_NAME=$SERVICE_NAME_OVERRIDE
    else
      SAFE_SUFFIX=$(echo "$SERVICE_SUFFIX" | sed 's/[^a-zA-Z0-9-]/-/g; s/-\{2,\}/-/g; s/^-*//; s/-*$//')
      SERVICE_NAME="ai-universe-app-pr-${PR_NUMBER}${SAFE_SUFFIX:+-$SAFE_SUFFIX}"
    fi

    IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT}/${REPOSITORY}/${SERVICE_NAME}:${IMAGE_TAG}"

    echo "➡️ Building container image ${IMAGE_URI}"
    (cd "$ROOT_DIR" && gcloud builds submit --project "$PROJECT" --tag "$IMAGE_URI")

    echo "➡️ Deploying Cloud Run service ${SERVICE_NAME}"
    gcloud run deploy "$SERVICE_NAME" \
      --project "$PROJECT" \
      --region "$REGION" \
      --image "$IMAGE_URI" \
      --platform managed \
      --allow-unauthenticated \
      --port 8080 \
      --set-env-vars NODE_ENV=production \
      --quiet

    SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
    [[ -n "$SERVICE_URL" ]] || die "Failed to determine service URL"

    echo "➡️ Preview deployed to ${SERVICE_URL}"

    echo "$SERVICE_URL" > "$ROOT_DIR/preview-url.txt"
    echo "$SERVICE_NAME" > "$ROOT_DIR/preview-service.txt"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    die "Unsupported command: $COMMAND"
    ;;
esac
