import json
import boto3
import uuid
import re
import os
import time
import urllib.request
from datetime import datetime

s3_client = boto3.client("s3", region_name="ap-south-1")
textract_client = boto3.client("textract", region_name="ap-south-1")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "policygraph-ai-docs-251456382330")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

PROMPT = """You are a policy analysis engine. Extract ALL eligibility conditions from this government policy document.
Return ONLY valid JSON, no markdown, no preamble, no extra text:
{
  "policy_title": "string",
  "clauses": [
    {
      "clause_id": "c001",
      "text": "original clause text",
      "clause_type": "ELIGIBILITY|DISQUALIFICATION|DOCUMENTATION|DEFINITION|CROSS_REFERENCE",
      "variable": "age|income|marks|category|domicile",
      "operator": "EQ|NEQ|LT|LTE|GT|GTE|IN|NOT_IN",
      "threshold_value": "value",
      "confidence": 0.95,
      "ambiguity_flag": false,
      "ambiguity_reason": null,
      "logical_group": "AND"
    }
  ]
}
Policy text:
POLICY_TEXT_HERE"""

def call_anthropic(text):
    payload = json.dumps({
        "model": "claude-3-haiku-20240307",
        "max_tokens": 4000,
        "messages": [{"role": "user", "content": PROMPT.replace("POLICY_TEXT_HERE", text[:6000])}]
    }).encode("utf-8")
    req = urllib.request.Request(
        "https://api.anthropic.com/v1/messages",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        result = json.loads(resp.read())
    return result["content"][0]["text"]

def extract_text_from_pdf(bucket, key):
    response = textract_client.start_document_text_detection(
        DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}}
    )
    job_id = response["JobId"]
    for _ in range(18):
        time.sleep(5)
        result = textract_client.get_document_text_detection(JobId=job_id)
        status = result["JobStatus"]
        if status == "SUCCEEDED":
            pages_text = [" ".join(b["Text"] for b in result["Blocks"] if b["BlockType"] == "LINE")]
            next_token = result.get("NextToken")
            while next_token:
                result = textract_client.get_document_text_detection(JobId=job_id, NextToken=next_token)
                pages_text.append(" ".join(b["Text"] for b in result["Blocks"] if b["BlockType"] == "LINE"))
                next_token = result.get("NextToken")
            return " ".join(pages_text)
        elif status == "FAILED":
            raise Exception(f"Textract job failed: {result.get('StatusMessage', 'Unknown')}")
    raise Exception("Textract timed out after 90 seconds")

def build_graph(title, clauses):
    nodes = [{"id": "policy_root", "type": "POLICY", "label": title}]
    edges = []
    for c in clauses:
        label = f"{c.get('variable','')} {c.get('operator','')} {c.get('threshold_value','')}"
        nodes.append({"id": c["clause_id"], "type": c.get("clause_type", "CONDITION"), "label": label, "confidence": c.get("confidence", 0.8), "ambiguity_flag": c.get("ambiguity_flag", False), "clause_text": c.get("text", "")})
        rel = "EXCLUDES" if c.get("clause_type") == "DISQUALIFICATION" else "REQUIRES"
        edges.append({"source": "policy_root", "target": c["clause_id"], "label": rel})
    return nodes, edges

def compute_complexity(clauses):
    if not clauses:
        return 0, "Low"
    score = min(100, int(len(clauses)*3 + sum(1 for c in clauses if c.get("ambiguity_flag"))*8 + sum(1 for c in clauses if c.get("clause_type")=="DISQUALIFICATION")*5 + sum(1 for c in clauses if c.get("confidence",1)<0.7)*7))
    return score, ("Low" if score < 33 else "High" if score >= 67 else "Moderate")

def lambda_handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS"}
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        body = json.loads(event.get("body", "{}"))
        s3_key = body.get("s3_key")
        if not s3_key:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "s3_key required"})}
        if not ANTHROPIC_API_KEY:
            return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": "ANTHROPIC_API_KEY not configured in Lambda environment variables"})}
        raw_text = extract_text_from_pdf(BUCKET_NAME, s3_key)
        if len(raw_text.strip()) < 50:
            return {"statusCode": 422, "headers": headers, "body": json.dumps({"error": "Text extraction returned too little content."})}
        raw_output = call_anthropic(raw_text)
        parsed = json.loads(re.sub(r"```json|```", "", raw_output).strip())
        clauses = parsed.get("clauses", [])
        title = parsed.get("policy_title", s3_key)
        nodes, edges = build_graph(title, clauses)
        score, category = compute_complexity(clauses)
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"document_id": str(uuid.uuid4())[:8], "title": title, "timestamp": datetime.utcnow().isoformat(), "clauses_extracted": len(clauses), "ambiguous_clauses": sum(1 for c in clauses if c.get("ambiguity_flag")), "complexity_score": score, "complexity_category": category, "clauses": clauses, "graph": {"nodes": nodes, "edges": edges}, "disclaimer": "Advisory only. Not legally binding."})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
