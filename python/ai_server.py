"""
FastAPI AI proxy for EchoServe Assistant

Usage:
  - Copy your OpenAI key to environment variable OPENAI_API_KEY
  - (Optional) set FIREBASE_ADMIN_SDK_JSON to the JSON content of your Firebase service account
  - Run: `uvicorn ai_server:app --reload --port 3000`

This server exposes POST /api/ai which accepts JSON { "messages": [{"role":"user","content":"..."}, ...] }
and forwards to OpenAI Chat Completions, prepending a cashier system prompt.
"""

import json
import os
from typing import List

from dotenv import load_dotenv
load_dotenv()

import httpx
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import firebase_admin
from firebase_admin import auth as firebase_auth, credentials as firebase_credentials

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
AI_MODEL = os.getenv('AI_MODEL', 'gpt-4o-mini')
FIREBASE_ADMIN_SDK_JSON = os.getenv('FIREBASE_ADMIN_SDK_JSON')
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv('ALLOWED_ORIGINS', 'http://localhost:8000').split(',')
    if origin.strip()
]

try:
    if FIREBASE_ADMIN_SDK_JSON:
        firebase_admin.initialize_app(
            firebase_credentials.Certificate(json.loads(FIREBASE_ADMIN_SDK_JSON))
        )
    else:
        firebase_admin.initialize_app()
except Exception as exc:
    raise RuntimeError('Failed to initialize Firebase Admin credentials') from exc

app = FastAPI(title='EchoServe AI Proxy')
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=['POST', 'OPTIONS'],
    allow_headers=['Authorization', 'Content-Type'],
)

class Message(BaseModel):
    role: str
    content: str

class AIRequest(BaseModel):
    messages: List[Message]

async def verify_firebase_token(request: Request) -> dict:
    auth_header = request.headers.get('authorization', '')
    scheme, _, id_token = auth_header.partition(' ')
    if scheme.lower() != 'bearer' or not id_token:
        raise HTTPException(status_code=401, detail='Missing or invalid Authorization header')
    try:
        return firebase_auth.verify_id_token(id_token)
    except Exception as exc:
        raise HTTPException(status_code=401, detail='Invalid Firebase ID token') from exc

@app.get('/health')
def health() -> dict:
    return {'status': 'ok'}

SYSTEM_PROMPT = {
    'role': 'system',
    'content': (
        'You are EchoServe Assistant, a polite and accurate cashier and admin assistant for a Point-of-Sale system. '
        'Behave as follows: when the user asks about the menu or cart, provide short, actionable replies. '
        'When the user requests a state-changing action (add/remove an existing item to/from the cart, create a permanent menu item, checkout, open admin), do NOT modify the database yourself â€” instead reply with a clearly-formatted action token on its own line followed by a short confirmation message. '
        'Use [ACTION:CREATE_MENU_ITEM name="<name>" price=<price> category="<category>"] only when the user explicitly asks to create or add an item to the permanent menu. A menu item requires a name and a positive price; use category="General" if no category is given. Do not use this token for adding an existing item to the cart. '
        'Use these other action tokens exactly: [ACTION:REMOVE_ITEM name="<name>" qty=<n>], [ACTION:CHECKOUT], [ACTION:OPEN_ADMIN], [ACTION:CLOSE_ADMIN], [ACTION:SHOW_SALES]. '
        'Also include human-readable confirmation after the token. Keep temperature low for deterministic behavior.'
    )
}

# Few-shot examples to make assistant behavior deterministic and actionable
EXAMPLES = [
    {'role': 'user', 'content': 'Add 2 Espresso to the cart'},
    {'role': 'assistant', 'content': 'Added 2 x Espresso to the cart.'},

    {'role': 'user', 'content': 'Checkout now'},
    {'role': 'assistant', 'content': '[ACTION:CHECKOUT]\nOrder completed. Thank you!'},

    {'role': 'user', 'content': 'Please open menu management'},
    {'role': 'assistant', 'content': '[ACTION:OPEN_ADMIN]\nOpened Menu Management.'},

    {'role': 'user', 'content': 'Add ChickenBurger to the menu for RM 2.50 in food'},
    {'role': 'assistant', 'content': '[ACTION:CREATE_MENU_ITEM name="ChickenBurger" price=2.50 category="Food"]\nChickenBurger will be added to the permanent menu for RM 2.50.'},

    {'role': 'user', 'content': 'Show sales report'},
    {'role': 'assistant', 'content': '[ACTION:SHOW_SALES]\nHere is a short sales summary.'},
]

OPENAI_CHAT_URL = os.getenv('AI_BASE_URL') or (
    'https://integrate.api.nvidia.com/v1/chat/completions'
    if OPENAI_API_KEY and OPENAI_API_KEY.startswith('nvapi-')
    else 'https://api.openai.com/v1/chat/completions'
)

@app.post('/api/ai')
async def ai_endpoint(req: Request, payload: AIRequest):
    if not OPENAI_API_KEY:
        raise HTTPException(status_code=500, detail='AI provider key not configured')

    await verify_firebase_token(req)

    # prepend system prompt and few-shot examples to guide deterministic action-token behavior
    messages = [SYSTEM_PROMPT] + EXAMPLES + [m.dict() for m in payload.messages]

    body = {
        'model': AI_MODEL,
        'messages': messages,
        'temperature': float(os.getenv('AI_TEMPERATURE', '0.1')),
        'max_tokens': int(os.getenv('AI_MAX_TOKENS', '400')),
    }

    headers = {
        'Authorization': f'Bearer {OPENAI_API_KEY}',
        'Content-Type': 'application/json'
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(OPENAI_CHAT_URL, headers=headers, json=body)
        if resp.status_code >= 400:
            raise HTTPException(status_code=502, detail=f'Provider error: {resp.text}')
        data = resp.json()

    assistant_text = ''
    try:
        assistant_text = data.get('choices', [])[0].get('message', {}).get('content', '')
    except Exception:
        assistant_text = str(data)

    return {
        'assistant': assistant_text,
        'raw': data
    }

if __name__ == '__main__':
    import uvicorn
    port = int(os.getenv('PORT', '3000'))
    uvicorn.run('ai_server:app', host='0.0.0.0', port=port, reload=True)
