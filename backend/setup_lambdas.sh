#!/bin/bash
set -e
cd /Users/maneshwaripawar/policygraph-ai/backend

# ── analyze_start ──────────────────────────────────────────────────────────
cat > functions/analyze_start/lambda_function.py << 'PYEOF'
import json
import boto3
import uuid
import os
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

TABLE_NAME = os.environ["JOBS_TABLE"]
WORKER_FUNCTION = os.environ["WORKER_FUNCTION_NAME"]


def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    try:
        body = json.loads(event.get("body") or "{}")
        s3_key = body.get("s3_key")

        if not s3_key:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "s3_key is required"}),
            }

        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        ttl = int(datetime.now(timezone.utc).timestamp()) + 3600

        table = dynamodb.Table(TABLE_NAME)
        table.put_item(Item={
            "job_id": job_id,
            "status": "PENDING",
            "stage": "PENDING",
            "s3_key": s3_key,
            "created_at": now,
            "updated_at": now,
            "ttl": ttl,
        })

        lambda_client.invoke(
            FunctionName=WORKER_FUNCTION,
            InvocationType="Event",
            Payload=json.dumps({"job_id": job_id, "s3_key": s3_key}),
        )

        return {
            "statusCode": 202,
            "headers": headers,
            "body": json.dumps({
                "job_id": job_id,
                "status": "PENDING",
                "message": f"Job queued. Poll /analyze/status/{job_id} for updates.",
            }),
        }

    except Exception as e:
        print(f"ERROR in analyze_start: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
PYEOF

# ── analyze_worker ─────────────────────────────────────────────────────────
cat > functions/analyze_worker/lambda_function.py << 'PYEOF'
import json
import boto3
import os
import time
from datetime import datetime, timezone
from decimal import Decimal

s3 = boto3.client("s3")
textract = boto3.client("textract")
bedrock = boto3.client("bedrock-runtime", region_name="ap-south-1")
dynamodb = boto3.resource("dynamodb")

TABLE_NAME = os.environ["JOBS_TABLE"]
BUCKET_NAME = os.environ["BUCKET_NAME"]
BEDROCK_MODEL = "anthropic.claude-3-haiku-20240307-v1:0"


def update_job(table, job_id, updates):
    now = datetime.now(timezone.utc).isoformat()
    updates["updated_at"] = now
    expr = "SET " + ", ".join(f"#{k} = :{k}" for k in updates)
    names = {f"#{k}": k for k in updates}
    values = {f":{k}": float_to_decimal(v) for k, v in updates.items()}
    table.update_item(
        Key={"job_id": job_id},
        UpdateExpression=expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )


def float_to_decimal(obj):
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: float_to_decimal(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [float_to_decimal(i) for i in obj]
    return obj


def extract_text_sync(s3_key):
    response = textract.detect_document_text(
        Document={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
    )
    lines = [b["Text"] for b in response["Blocks"] if b["BlockType"] == "LINE"]
    return "\n".join(lines)


def extract_text_async(s3_key):
    response = textract.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}}
    )
    job_id = response["JobId"]

    for _ in range(60):
        result = textract.get_document_text_detection(JobId=job_id)
        status = result["JobStatus"]
        if status == "SUCCEEDED":
            break
        if status == "FAILED":
            raise Exception(f"Textract async failed: {result.get('StatusMessage')}")
        time.sleep(5)
    else:
        raise Exception("Textract timed out after 5 minutes")

    lines = []
    next_token = None
    while True:
        kwargs = {"JobId": job_id}
        if next_token:
            kwargs["NextToken"] = next_token
        result = textract.get_document_text_detection(**kwargs)
        for block in result.get("Blocks", []):
            if block["BlockType"] == "LINE":
                lines.append(block["Text"])
        next_token = result.get("NextToken")
        if not next_token:
            break

    return "\n".join(lines)


def extract_text(s3_key):
    try:
        return extract_text_sync(s3_key)
    except Exception as e:
        err = str(e)
        if any(x in err.lower() for x in ["page", "multipage", "unsupported", "invalidparameter"]):
            return extract_text_async(s3_key)
        raise


def invoke_bedrock(prompt, max_tokens=2000):
    body = json.dumps({
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    })
    response = bedrock.invoke_model(
        modelId=BEDROCK_MODEL,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    raw = json.loads(response["body"].read())["content"][0]["text"].strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
    return raw.strip()


def analyze_policy(text):
    prompt = f"""You are an expert insurance policy analyst for Indian government schemes.
Analyze the following policy document and return a JSON object with these exact keys:
- clauses_extracted: integer count of clauses found
- complexity_score: integer 1-10
- complexity_category: "Low" | "Medium" | "High"
- summary: 2-3 sentence plain-English summary
- policy_type: type of policy
- clauses: array of objects with {{id, title, text, category}}
- ambiguous_clauses: array of clause ids that are vague or unclear
- key_entities: array of {{name, type, description}}
- graph: {{nodes: [{{id, label, type}}], edges: [{{source, target, label}}]}}
- eligibility_criteria: array of eligibility conditions as plain strings

Return ONLY valid JSON. No markdown, no explanation.

Policy text (first 6000 words):
{" ".join(text.split()[:6000])}"""

    return json.loads(invoke_bedrock(prompt, max_tokens=3000))


def check_eligibility(text, clauses):
    clauses_text = "\n".join(f"- {c}" for c in clauses[:20])
    prompt = f"""You are an insurance eligibility expert for Indian government schemes.
From the policy clauses below, extract eligibility information and return JSON with:
- eligible_groups: array of who is eligible
- ineligible_groups: array of who is explicitly excluded
- waiting_periods: array of waiting periods
- pre_existing_conditions: string
- enrollment_requirements: array
- dependents: string

Return ONLY valid JSON. No markdown.

Policy clauses:
{clauses_text}"""
    return json.loads(invoke_bedrock(prompt, max_tokens=1500))


def find_conflicts(text, clauses):
    clauses_text = "\n".join(f"- {c}" for c in clauses[:20])
    prompt = f"""You are a legal expert reviewing Indian insurance policies.
Analyze these clauses and return JSON with:
- conflicts: array of {{clause_a, clause_b, description}}
- ambiguous_clauses: array of {{clause, issue}}
- concerning_clauses: array of {{clause, reason}}
- missing_standard_coverage: array
- recommendations: array of questions to ask the insurer

Return ONLY valid JSON. No markdown.

Policy clauses:
{clauses_text}"""
    return json.loads(invoke_bedrock(prompt, max_tokens=1500))


def lambda_handler(event, context):
    job_id = event.get("job_id")
    s3_key = event.get("s3_key")

    if not job_id or not s3_key:
        print("ERROR: Missing job_id or s3_key")
        return

    table = dynamodb.Table(TABLE_NAME)

    try:
        update_job(table, job_id, {"status": "PROCESSING", "stage": "textract"})
        print(f"[{job_id}] Textract starting for {s3_key}")

        text = extract_text(s3_key)
        word_count = len(text.split())
        print(f"[{job_id}] Textract done: {word_count} words")

        update_job(table, job_id, {
            "stage": "bedrock",
            "text_blocks": word_count,
            "char_count": len(text),
        })

        print(f"[{job_id}] Bedrock analysis starting")
        analysis = analyze_policy(text)

        clause_texts = []
        for c in analysis.get("clauses", []):
            if isinstance(c, dict):
                clause_texts.append(c.get("text", c.get("title", "")))
            elif isinstance(c, str):
                clause_texts.append(c)

        try:
            eligibility = check_eligibility(text, clause_texts)
        except Exception as e:
            print(f"[{job_id}] Eligibility non-fatal error: {e}")
            eligibility = {"error": str(e)}

        try:
            conflicts = find_conflicts(text, clause_texts)
        except Exception as e:
            print(f"[{job_id}] Conflicts non-fatal error: {e}")
            conflicts = {"error": str(e)}

        final_result = {**analysis, "eligibility": eligibility, "conflicts": conflicts, "word_count": word_count}

        update_job(table, job_id, {
            "status": "COMPLETE",
            "stage": "done",
            "result": json.dumps(final_result),
        })
        print(f"[{job_id}] COMPLETE")

    except Exception as e:
        print(f"[{job_id}] FAILED: {e}")
        try:
            update_job(table, job_id, {"status": "FAILED", "stage": "failed", "error": str(e)})
        except Exception as inner:
            print(f"[{job_id}] Could not write FAILED: {inner}")
PYEOF

# ── analyze_status ─────────────────────────────────────────────────────────
cat > functions/analyze_status/lambda_function.py << 'PYEOF'
import json
import boto3
import os

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["JOBS_TABLE"]


def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    try:
        job_id = (event.get("pathParameters") or {}).get("job_id")
        if not job_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "job_id is required in path"}),
            }

        table = dynamodb.Table(TABLE_NAME)
        response = table.get_item(Key={"job_id": job_id})
        item = response.get("Item")

        if not item:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"Job {job_id} not found"}),
            }

        status = item.get("status", "UNKNOWN")
        payload = {
            "job_id": job_id,
            "status": status,
            "stage": item.get("stage", ""),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
        }

        if status == "COMPLETE":
            try:
                payload["result"] = json.loads(item.get("result", "{}"))
            except Exception:
                payload["result"] = item.get("result")
        elif status == "FAILED":
            payload["error"] = item.get("error", "Unknown error")
        elif status == "PROCESSING":
            if item.get("text_blocks"):
                payload["text_blocks"] = int(item["text_blocks"])
            if item.get("char_count"):
                payload["char_count"] = int(item["char_count"])

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(payload),
        }

    except Exception as e:
        print(f"ERROR in analyze_status: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
PYEOF

echo "✅ All lambda files written successfully"
echo ""
echo "Next: sam build && sam deploy --force-upload"
