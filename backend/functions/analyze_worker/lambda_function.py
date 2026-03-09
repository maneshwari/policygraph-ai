import json
import os
import time
import boto3
import re
import urllib.request
import urllib.error

dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
textract = boto3.client('textract', region_name='ap-south-1')
s3 = boto3.client('s3', region_name='ap-south-1')

JOB_TABLE  = os.environ.get('JOB_TABLE', 'policygraph-jobs')
BUCKET     = os.environ.get('BUCKET_NAME', '')
CF_ACCOUNT = os.environ.get('CF_ACCOUNT_ID', '')
CF_TOKEN   = os.environ.get('CF_API_TOKEN', '')
CF_MODEL   = '@cf/meta/llama-3.1-8b-instruct'


def update_job(table, job_id, updates):
    expr_parts, attr_values, attr_names = [], {}, {}
    for k, v in updates.items():
        safe_key = f'#f_{k}'
        val_key  = f':v_{k}'
        expr_parts.append(f'{safe_key} = {val_key}')
        attr_names[safe_key] = k
        attr_values[val_key] = v
    table.update_item(
        Key={'job_id': job_id},
        UpdateExpression='SET ' + ', '.join(expr_parts),
        ExpressionAttributeNames=attr_names,
        ExpressionAttributeValues=attr_values
    )


def extract_text_textract(s3_key):
    try:
        response = textract.detect_document_text(
            Document={'S3Object': {'Bucket': BUCKET, 'Name': s3_key}}
        )
        blocks = response.get('Blocks', [])
        lines  = [b['Text'] for b in blocks if b['BlockType'] == 'LINE']
        return '\n'.join(lines), len(blocks)
    except Exception:
        return extract_text_textract_async(s3_key)


def extract_text_textract_async(s3_key):
    start  = textract.start_document_text_detection(
        DocumentLocation={'S3Object': {'Bucket': BUCKET, 'Name': s3_key}}
    )
    job_id = start['JobId']
    for _ in range(48):
        time.sleep(5)
        result = textract.get_document_text_detection(JobId=job_id)
        status = result['JobStatus']
        if status == 'SUCCEEDED':
            blocks = result.get('Blocks', [])
            while 'NextToken' in result:
                result = textract.get_document_text_detection(
                    JobId=job_id, NextToken=result['NextToken']
                )
                blocks.extend(result.get('Blocks', []))
            lines = [b['Text'] for b in blocks if b['BlockType'] == 'LINE']
            return '\n'.join(lines), len(blocks)
        elif status == 'FAILED':
            raise RuntimeError('Textract async job failed')
    raise TimeoutError('Textract timed out')


def call_cloudflare(prompt, retries=3):
    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/ai/run/{CF_MODEL}'
    payload = json.dumps({
        'messages': [
            {'role': 'system', 'content': 'You are a policy analysis AI. Always respond with valid JSON only. No markdown, no explanation, no code fences.'},
            {'role': 'user',   'content': prompt}
        ],
        'max_tokens': 4096,
        'temperature': 0.1
    }).encode('utf-8')

    for attempt in range(retries):
        try:
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    'Authorization': f'Bearer {CF_TOKEN}',
                    'Content-Type':  'application/json'
                },
                method='POST'
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                return data['result']['response']
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                time.sleep(4 * (attempt + 1))
                continue
            raise
        except Exception:
            if attempt < retries - 1:
                time.sleep(4 * (attempt + 1))
                continue
            raise


def analyze_with_cloudflare(text):
    words = text.split()
    if len(words) > 3000:
        text = ' '.join(words[:3000]) + '\n[...truncated...]'

    prompt = f"""Analyze the following government policy document and return ONLY a valid JSON object with this exact structure:
{{
  "clauses_extracted": <integer>,
  "complexity_score": <integer 1-100>,
  "complexity_category": "<Low|Medium|High|Very High>",
  "ambiguous_clauses": <integer>,
  "summary": "<2-3 sentence summary>",
  "clauses": [
    {{
      "id": "C1",
      "text": "<clause text>",
      "category": "<Eligibility|Benefit|Exclusion|Procedure|Definition>",
      "ambiguous": <true|false>
    }}
  ],
  "graph": {{
    "nodes": [{{"id": "N1", "label": "<entity>", "type": "<policy|beneficiary|condition|benefit>"}}],
    "edges": [{{"source": "N1", "target": "N2", "relation": "<enables|requires|excludes|defines>"}}]
  }},
  "key_entities": ["<entity1>", "<entity2>"],
  "eligibility_criteria": ["<criterion1>", "<criterion2>"]
}}

Extract up to 15 clauses. Build graph with up to 20 nodes. Return JSON only.

POLICY TEXT:
{text}"""

    raw = call_cloudflare(prompt)
    raw = re.sub(r'^```json\s*', '', raw.strip())
    raw = re.sub(r'\s*```$', '', raw)
    data = json.loads(raw)
    # Deduplicate clauses by text
    seen = set()
    unique = []
    for c in data.get('clauses', []):
        t = c.get('text','')
        if t not in seen:
            seen.add(t)
            unique.append(c)
    data['clauses'] = unique
    data['clauses_extracted'] = len(unique)
    return data


def lambda_handler(event, context):
    job_id = event.get('job_id')
    s3_key = event.get('s3_key')

    if not job_id or not s3_key:
        return {'error': 'missing job_id or s3_key'}

    table = dynamodb.Table(JOB_TABLE)

    try:
        update_job(table, job_id, {'status': 'PROCESSING', 'stage': 'textract'})

        text, block_count = extract_text_textract(s3_key)
        update_job(table, job_id, {
            'stage':      'bedrock',
            'text_blocks': block_count,
            'char_count':  len(text)
        })

        result = analyze_with_cloudflare(text)

        update_job(table, job_id, {
            'status':       'COMPLETE',
            'stage':        'done',
            'result':       json.dumps(result),
            'completed_at': int(time.time())
        })
        return {'job_id': job_id, 'status': 'COMPLETE'}

    except Exception as e:
        update_job(table, job_id, {
            'status':       'FAILED',
            'error':        str(e),
            'completed_at': int(time.time())
        })
        return {'job_id': job_id, 'status': 'FAILED', 'error': str(e)}
