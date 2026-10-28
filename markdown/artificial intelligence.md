# Artificial Intelligence — EchoServe Assistant

This document contains a compact, runnable scaffold for adding a real AI backend, training/fine-tuning guidance, and secure setup steps. It complements the existing client-side rule-based cashier assistant in the app.

---

## 1) Goals

- Provide a secure server endpoint that forwards user messages to an LLM (OpenAI-compatible) without exposing API keys to clients.
- Provide a recommended assistant persona (system message) for a cashier role.
- Provide a minimal training/fine-tuning example (JSONL) for behavior customization.
- Provide example client integration (how the existing front-end calls the proxy).

---

## 2) High-level architecture

- Client (browser): Sends short user messages to a server endpoint (`/api/ai`) on your domain.
- Server (Node/Express): Verifies user (optionally via Firebase ID token), injects a cashier system prompt, forwards to the LLM provider, returns the assistant's reply.
- Provider (OpenAI or compatible): Receives a chat completion request and returns assistant content.

---

## 3) Secure Node.js proxy example

Create a small Express server. This example uses `node-fetch` to keep dependencies minimal; you can swap for the official SDK.

Install dependencies:

```bash
npm init -y
Create a Python FastAPI proxy (recommended). The scaffold below provides an async endpoint `/api/ai` that forwards chat messages to an OpenAI-compatible API and optionally verifies Firebase ID tokens.

Install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

File: `ai_server.py` (included in this repo)

```py
# see ai_server.py in the repository for the full implementation
```

Run locally:

```bash
- `OPENAI_API_KEY` — your provider API key
- `FIREBASE_ADMIN_SDK_JSON` — optional JSON string for Firebase Admin service account
- `AI_MODEL` — optional model override

---

## 4) Client-side integration (how to call the proxy)

Example fetch call from your `app.js` or chatbot logic:

```js
async function callAIProxy(messageText){
  const token = await getIdTokenSomehow(); // if using Firebase auth, get ID token
  const messages = [{ role: 'user', content: messageText }];
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token
    },
    body: JSON.stringify({ messages })
  });
  const data = await res.json();
  return data.assistant; // assistant text to show in the UI
}
```

You can integrate this into the `chatbot` submit handler instead of the rule-based `botRespond` function already present.

---

## 5) Training / Fine-tuning example (OpenAI-style JSONL)

To adapt assistant behavior (cashier actions), create a small fine-tuning dataset of user/assistant pairs. Save as `cashier_finetune.jsonl`.

Example entries (JSONL lines):

```jsonl
{"prompt":"<|system|>You are EchoServe Assistant, a cashier. Respond as actions when appropriate.<|endofsystem|><|user|>Add 2 cappuccino to the cart<|endofuser|>","completion":"<|assistant|>Added 2 x Cappuccino to the cart. Current cart: 2 x Cappuccino. Total: $7.00<|endofassistant|>"}

{"prompt":"<|system|>You are EchoServe Assistant, a cashier.<|endofsystem|><|user|>What's in my cart?<|endofuser|>","completion":"<|assistant|>Your cart contains: 1 x Espresso ($3.00), 2 x Croissant ($5.00). Total: $8.00<|endofassistant|>"}
```

Notes:
- Follow the fine-tuning guidelines of your provider (tokenization, max examples).
- For small shops a few dozen examples that reflect phrasing and actions are usually enough.

---

## 6) Example system / modal prompt to keep consistent behavior

Use a system-level instruction like:

> You are EchoServe Assistant, a polite and accurate cashier. When the user asks to add/remove items, reply with a short confirmation and the exact action performed. If the user asks to checkout, reply with the single token `[ACTION:CHECKOUT]` on its own line followed by a user-facing confirmation message.

This convention lets the client detect the special token and trigger the actual checkout flow (creating the order in Firestore) instead of relying on the LLM to call the DB directly.

---

## 7) Minimal testing steps

1. Start the proxy server:

```bash
PORT=3000 OPENAI_API_KEY=sk-... node server.js
```

2. From the browser, modify your `chatbot` submit handler to call the proxy and display the assistant response.
3. Test commands like `show menu`, `add 2 espresso`, `show cart`, `checkout`.
4. If you adopt the `[ACTION:CHECKOUT]` token pattern, detect it on the client and call your existing checkout flow rather than persisting via the AI proxy.

---

## 8) Next steps (recommendations)

- Start with the proxy + low temperature (0.0–0.3) for deterministic cashier behavior.
- Use a short system prompt focused on actions; prefer special tokens for critical operations.
- Optionally fine-tune on your store's typical dialogues (menu names, promo wording).
- Add rate-limiting and authentication on the proxy to reduce abuse.

---

## 9) References & templates

- Provider docs: follow the official OpenAI or chosen provider docs for chat completions and fine-tuning.
- Keep keys in environment variables and rotate regularly.

---

If you want, I can:
- Scaffold the `server.js` file and a simple `package.json` in this repo, or
- Replace the client rule-based handler with a call that uses the proxy and demonstration flows for handling `[ACTION:CHECKOUT]`.

Tell me which option to do next.