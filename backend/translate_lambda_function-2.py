import json
import os
import time
import urllib.request
import urllib.error

CF_ACCOUNT = os.environ.get('CF_ACCOUNT_ID', '')
CF_TOKEN   = os.environ.get('CF_API_TOKEN', '')
CF_MODEL   = '@cf/meta/llama-3.1-8b-instruct'

CORS = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST,OPTIONS'
}

STYLE_PROMPTS = {
    'simple':      'Translate into simple everyday language a rural Indian citizen can understand. Avoid legal jargon.',
    'formal':      'Translate into formal official government register. Maintain legal precision.',
    'explanatory': 'Translate and add a short parenthetical explanation after each clause to clarify its meaning.'
}


def call_cloudflare(messages, retries=3):
    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT}/ai/run/{CF_MODEL}'
    payload = json.dumps({
        'messages':    messages,
        'max_tokens':  2048,
        'temperature': 0.2
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


def lambda_handler(event, context):
    if event.get('httpMethod') == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS, 'body': ''}

    try:
        body     = json.loads(event.get('body', '{}'))
        clauses  = body.get('clauses', [])
        language = body.get('language', 'Hindi')
        style    = body.get('style', 'simple')

        if not clauses:
            return {
                'statusCode': 400,
                'headers': CORS,
                'body': json.dumps({'error': 'clauses array is required'})
            }

        style_instruction = STYLE_PROMPTS.get(style, STYLE_PROMPTS['simple'])

        # Build numbered clause list
        numbered = '\n'.join([f'{i+1}. {c}' for i, c in enumerate(clauses)])

        prompt = f"""You are a government policy translator.

Task: Translate each numbered clause below into {language}.
Style: {style_instruction}

Return ONLY a valid JSON array like this (no markdown, no explanation):
[
  {{"clause_id": "C1", "translation": "<translated text>"}},
  {{"clause_id": "C2", "translation": "<translated text>"}}
]

CLAUSES:
{numbered}"""

        messages = [
            {'role': 'system', 'content': 'You are a policy translator. Always respond with valid JSON only. No markdown, no code fences, no explanation.'},
            {'role': 'user',   'content': prompt}
        ]

        raw = call_cloudflare(messages)

        # Strip markdown fences if model adds them anyway
        import re
        raw = re.sub(r'^```json\s*', '', raw.strip())
        raw = re.sub(r'\s*```$', '', raw)

        translations = json.loads(raw)

        return {
            'statusCode': 200,
            'headers': CORS,
            'body': json.dumps({
                'language':     language,
                'style':        style,
                'translations': translations
            })
        }

    except Exception as e:
        return {
            'statusCode': 500,
            'headers': CORS,
            'body': json.dumps({'error': str(e)})
        }
