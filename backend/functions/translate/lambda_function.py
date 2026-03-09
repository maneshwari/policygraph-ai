import json
import os
import re
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


def clean_json(raw):
    raw = raw.strip()
    raw = re.sub(r'^```json\s*', '', raw)
    raw = re.sub(r'^```\s*', '', raw)
    raw = re.sub(r'\s*```$', '', raw)
    return raw.strip()


def extract_json_array(raw):
    # Direct parse
    try:
        return json.loads(raw)
    except Exception:
        pass

    # Find array boundaries
    start = raw.find('[')
    end   = raw.rfind(']')
    if start != -1 and end != -1:
        try:
            return json.loads(raw[start:end+1])
        except Exception:
            pass

    # Regex extraction as last resort
    pattern = r'\{[^{}]*"clause_id"\s*:\s*"([^"]+)"[^{}]*"translation"\s*:\s*"([^"]+)"[^{}]*\}'
    matches = re.findall(pattern, raw, re.DOTALL)
    if matches:
        return [{'clause_id': m[0], 'translation': m[1]} for m in matches]

    return None


def translate_single(clause, idx, language, style_instruction):
    prompt = f"""Translate this government policy clause into {language}.
Style: {style_instruction}

Clause: {clause}

Reply with ONLY the translated text. No JSON, no explanation, no quotes."""

    messages = [
        {'role': 'system', 'content': f'You are a translator. Translate to {language}. Reply with translation only.'},
        {'role': 'user',   'content': prompt}
    ]
    translation = call_cloudflare(messages).strip()
    return {'clause_id': f'C{idx+1}', 'translation': translation}


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
        numbered = '\n'.join([f'{i+1}. {c}' for i, c in enumerate(clauses)])

        # Attempt 1: batch translate
        prompt = f"""Translate each numbered clause into {language}.
Style: {style_instruction}

Return ONLY a JSON array. No markdown, no explanation:
[{{"clause_id":"C1","translation":"..."}},{{"clause_id":"C2","translation":"..."}}]

CLAUSES:
{numbered}"""

        messages = [
            {'role': 'system', 'content': 'You are a policy translator. Respond with a JSON array only. No markdown.'},
            {'role': 'user',   'content': prompt}
        ]

        raw          = call_cloudflare(messages)
        cleaned      = clean_json(raw)
        translations = extract_json_array(cleaned)

        # Attempt 2: one by one if batch failed
        if not translations:
            translations = []
            for i, clause in enumerate(clauses):
                try:
                    result = translate_single(clause, i, language, style_instruction)
                    translations.append(result)
                except Exception:
                    translations.append({
                        'clause_id': f'C{i+1}',
                        'translation': f'[Translation unavailable for clause {i+1}]'
                    })

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
