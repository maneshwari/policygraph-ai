#!/bin/bash
# PolicyGraph AI 2.0 - One-command deploy script
# Run this from the /backend directory

set -e  # Stop on any error

echo "=========================================="
echo "  PolicyGraph AI 2.0 - Deploying to AWS"
echo "=========================================="

# ── CONFIG ──────────────────────────────────────────────────────────────────
STACK_NAME="policygraph-ai"
REGION="ap-south-1"
SAM_BUCKET="policygraph-sam-artifacts-$(aws sts get-caller-identity --query Account --output text)"

# ── STEP 1: Create SAM artifact bucket if not exists ────────────────────────
echo ""
echo "[1/4] Setting up SAM artifacts bucket..."
aws s3 mb s3://$SAM_BUCKET --region $REGION 2>/dev/null || echo "Bucket already exists, continuing..."

# ── STEP 2: Install dependencies into each function folder ──────────────────
echo ""
echo "[2/4] Installing Lambda dependencies..."

pip install boto3 networkx --target functions/analyze/ --break-system-packages -q
pip install boto3 --target functions/eligibility/ --break-system-packages -q
pip install boto3 --target functions/conflicts/ --break-system-packages -q
pip install boto3 --target functions/upload_url/ --break-system-packages -q

# ── STEP 3: SAM Build ────────────────────────────────────────────────────────
echo ""
echo "[3/4] Building SAM application..."
sam build --region $REGION

# ── STEP 4: SAM Deploy ───────────────────────────────────────────────────────
echo ""
echo "[4/4] Deploying to AWS (this takes ~2-3 minutes)..."
sam deploy \
  --stack-name $STACK_NAME \
  --s3-bucket $SAM_BUCKET \
  --region $REGION \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset

# ── GET API URL ───────────────────────────────────────────────────────────────
echo ""
echo "=========================================="
echo "  DEPLOYMENT COMPLETE"
echo "=========================================="
echo ""
echo "Your API URL:"
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" \
  --output text

echo ""
echo "Your S3 Bucket:"
aws cloudformation describe-stacks \
  --stack-name $STACK_NAME \
  --region $REGION \
  --query "Stacks[0].Outputs[?OutputKey=='BucketName'].OutputValue" \
  --output text

echo ""
echo "NEXT STEP: Copy the API URL above and give it to your teammate for the frontend."
