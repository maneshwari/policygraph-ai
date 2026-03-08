import json
import boto3
import uuid
import re
import os
from datetime import datetime

s3_client = boto3.client("s3", region_name="ap-south-1")
textract_client = boto3.client("textract", region_name="ap-south-1")
bedrock_client = boto3.client("bedrock-runtime", region_name="ap-south-1")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "policygraph-ai-docs")
MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

PROMPT = """You are a policy analysis engine. Extract ALL eligibility conditions from this government policy document.
Return ONLY valid JSON, no markdown, no preamble:
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

def build_graph(title, clauses):
    nodes = [{"id": "policy_root", "type": "POLICY", "label": title}]
    edges = []
    for c in clauses:
        label = f"{c.get('variable','')} {c.get('operator','')} {c.get('threshold_value','')}"
        nodes.append({"id": c["clause_id"], "type": c.get("clause_type","CONDITION"), "label": label, "confidence": c.get("confidence",0.8), "ambiguity_flag": c.get("ambiguity_flag",False), "clause_text": c.get("text","")})
        rel = "EXCLUDES" if c.get("clause_type") == "DISQUALIFICATION" else "REQUIRES"
        edges.append({"source": "policy_root", "target": c["clause_id"], "label": rel})
    return nodes, edges

def compute_complexity(clauses):
    if not clauses:
        return 0, "Low"
    score = min(100, int(
        len(clauses)*3 +
        sum(1 for c in clauses if c.get("ambiguity_flag"))*8 +
        sum(1 for c in clauses if c.get("clause_type")=="DISQUALIFICATION")*5 +
        sum(1 for c in clauses if c.get("confidence",1)<0.7)*7
    ))
    if score < 33:
        category = "Low"
    elif score < 67:
        category = "Moderate"
    else:
        category = "High"
    return score, category

def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST,OPTIONS"
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        body = json.loads(event.get("body", "{}"))
        s3_key = body.get("s3_key")
        if not s3_key:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "s3_key required"})}
        textract_resp = textract_client.detect_document_text(Document={"S3Object": {"Bucket": BUCKET_NAME, "Name": s3_key}})
        raw_text = " ".join(b["Text"] for b in textract_resp["Blocks"] if b["BlockType"] == "LINE")
        if len(raw_text.strip()) < 50:
            return {"statusCode": 422, "headers": headers, "body": json.dumps({"error": "Text extraction failed"})}
        prompt = PROMPT.replace("POLICY_TEXT_HERE", raw_text[:6000])
        bedrock_resp = bedrock_client.invoke_model(
            modelId=MODEL_ID,
            body=json.dumps({
                "anthropic_version": "bedrock-2023-05-31",
                "max_tokens": 4000,
                "messages": [{"role": "user", "content": prompt}]
            })
        )
        raw_output = json.loads(bedrock_resp["body"].read())["content"][0]["text"]
        parsed = json.loads(re.sub(r"```json|```", "", raw_output).strip())
        clauses = parsed.get("clauses", [])
        title = parsed.get("policy_title", s3_key)
        nodes, edges = build_graph(title, clauses)
        score, category = compute_complexity(clauses)
        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps({
                "document_id": str(uuid.uuid4())[:8],
                "title": title,
                "timestamp": datetime.utcnow().isoformat(),
                "clauses_extracted": len(clauses),
                "ambiguous_clauses": sum(1 for c in clauses if c.get("ambiguity_flag")),
                "complexity_score": score,
                "complexity_category": category,
                "clauses": clauses,
                "graph": {"nodes": nodes, "edges": edges},
                "disclaimer": "Advisory only. Not legally binding."
            })
        }
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
