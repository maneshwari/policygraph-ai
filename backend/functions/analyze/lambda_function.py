import json, boto3, uuid, re, os, time
from datetime import datetime

s3_client = boto3.client("s3", region_name="ap-south-1")
textract_client = boto3.client("textract", region_name="ap-south-1")
bedrock_client = boto3.client("bedrock-runtime", region_name="ap-south-1")
BUCKET_NAME = os.environ.get("BUCKET_NAME", "policygraph-ai-docs-251456382330")
MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"

PROMPT = """You are a policy analysis engine. Extract ALL eligibility conditions from this government policy document. Return ONLY valid JSON, no markdown, no preamble: {"policy_title": "string", "clauses": [{"clause_id": "c001", "text": "clause text", "clause_type": "ELIGIBILITY", "variable": "marks", "operator": "GTE", "threshold_value": "60", "confidence": 0.95, "ambiguity_flag": false, "ambiguity_reason": null, "logical_group": "AND"}]}
Policy text: POLICY_TEXT_HERE"""

def extract_text(bucket, key):
    r = textract_client.start_document_text_detection(DocumentLocation={"S3Object": {"Bucket": bucket, "Name": key}})
    job_id = r["JobId"]
    for _ in range(18):
        time.sleep(5)
        r = textract_client.get_document_text_detection(JobId=job_id)
        if r["JobStatus"] == "SUCCEEDED":
            return " ".join(b["Text"] for b in r["Blocks"] if b["BlockType"] == "LINE")
        elif r["JobStatus"] == "FAILED":
            raise Exception("Textract failed")
    raise Exception("Textract timeout")

def lambda_handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS"}
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        body = json.loads(event.get("body", "{}"))
        s3_key = body.get("s3_key")
        if not s3_key:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "s3_key required"})}
        raw_text = extract_text(BUCKET_NAME, s3_key)
        prompt = PROMPT.replace("POLICY_TEXT_HERE", raw_text[:6000])
        resp = bedrock_client.invoke_model(modelId=MODEL_ID, body=json.dumps({"anthropic_version": "bedrock-2023-05-31", "max_tokens": 4000, "messages": [{"role": "user", "content": prompt}]}))
        raw = json.loads(resp["body"].read())["content"][0]["text"]
        parsed = json.loads(re.sub(r"```json|```", "", raw).strip())
        clauses = parsed.get("clauses", [])
        title = parsed.get("policy_title", s3_key)
        score = min(100, len(clauses)*3 + sum(8 for c in clauses if c.get("ambiguity_flag")))
        cat = "Low" if score < 33 else "High" if score >= 67 else "Moderate"
        nodes = [{"id": "policy_root", "type": "POLICY", "label": title}] + [{"id": c["clause_id"], "type": c.get("clause_type","CONDITION"), "label": f"{c.get('variable','')} {c.get('operator','')} {c.get('threshold_value','')}", "confidence": c.get("confidence", 0.8), "ambiguity_flag": c.get("ambiguity_flag", False), "clause_text": c.get("text","")} for c in clauses]
        edges = [{"source": "policy_root", "target": c["clause_id"], "label": "EXCLUDES" if c.get("clause_type")=="DISQUALIFICATION" else "REQUIRES"} for c in clauses]
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"document_id": str(uuid.uuid4())[:8], "title": title, "timestamp": datetime.utcnow().isoformat(), "clauses_extracted": len(clauses), "ambiguous_clauses": sum(1 for c in clauses if c.get("ambiguity_flag")), "complexity_score": score, "complexity_category": cat, "clauses": clauses, "graph": {"nodes": nodes, "edges": edges}, "disclaimer": "Advisory only."})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}