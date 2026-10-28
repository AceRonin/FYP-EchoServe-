# EchoServe — Smart Point-of-Sale (POS) System

EchoServe is a modern, cloud-connected Point-of-Sale (POS) web application designed for retail and dining environments. It combines real-time order processing, inventory/menu administration, face presence detection via WebAssembly, and an intelligent AI cashier assistant powered by FastAPI and LLMs.

---

## 🚀 Key Features

- **Point of Sale (POS) Interface**:
  - Live menu browsing with search and category filtering.
  - Real-time cart calculation, quantity adjustments, and receipt checkout.
- **Role-Based Admin Dashboard**:
  - Secure menu item creation, price updates, and deletion.
  - Live company sales history, analytics, and order tracking.
- **AI Cashier Assistant**:
  - Interactive voice/text chat assistant operating alongside the cashier.
  - Employs deterministic action tokens (e.g., `[ACTION:CREATE_MENU_ITEM]`, `[ACTION:CHECKOUT]`, `[ACTION:OPEN_ADMIN]`) to trigger POS actions safely without direct database write permissions.
  - Validates user identity via Firebase ID tokens before proxying requests.
- **Face Presence Detection**:
  - Runs in-browser Haar cascade face detection using **OpenCV.js (WebAssembly)** offloaded to a dedicated Web Worker.
  - Smooth camera preview and presence status indicator to ensure the cashier or manager is at the terminal.
- **Cloud Database & Auth**:
  - Multi-tenant architecture backed by **Firebase Authentication** and **Cloud Firestore**.
  - Protected with production-ready security rules (`rules/firestore.rules`).
- **Container Ready**:
  - Includes a production-ready `Dockerfile` and `.dockerignore` for deploying the AI service.

---

## 🛠️ Project Structure

```text
FYP(EchoServe)/
├── css/
│   └── style.css                    # Main application styling and themes
├── html/
│   ├── index.html                   # Main POS & Admin application interface
│   ├── login.html                   # Cashier / Admin authentication page
│   └── register.html                # New company / tenant registration page
├── javascript/
│   ├── app.js                       # Primary application logic, POS state, Firestore sync
│   ├── auth.js                      # Login & password reset handling
│   ├── chatbot.js                   # Assistant chat widget UI component
│   ├── presence_detection.js        # Camera stream management and UI overlay
│   ├── presence_worker.js           # OpenCV.js WebAssembly face detection worker
│   ├── register.js                  # Company registration and admin account setup
│   └── theme.js                     # Light/Dark UI theme toggling
├── python/
│   ├── ai_server.py                 # FastAPI proxy server for LLM interactions
│   └── requirements.txt             # Backend Python dependencies
├── rules/
│   └── firestore.rules              # Cloud Firestore security rules
├── Dockerfile                       # Container definition for the AI backend
├── .dockerignore                    # Docker build exclusions
├── .env.example                     # Sample configuration template for environment variables
└── .gitignore                       # Git ignore specifications
```

---

## ⚙️ Getting Started

### 1. Prerequisites
- **Python 3.10+**
- A modern web browser supporting WebAssembly (Chrome, Edge, Firefox, Safari)
- A Firebase project with **Authentication** (Email/Password) and **Cloud Firestore** enabled
- An API key for an OpenAI-compatible LLM (e.g., OpenAI, NVIDIA NIM, OpenRouter)

---

### 2. Backend Setup (AI Proxy Server)

1. Open a terminal in the project root:
   ```bash
   cd FYP(EchoServe)
   ```

2. Create and activate a Python virtual environment:
   ```bash
   # Windows (PowerShell)
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1

   # macOS / Linux
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r python/requirements.txt
   ```

4. Configure environment variables:
   ```bash
   # Copy example template
   cp .env.example .env
   ```
   Edit `.env` and fill in your API key:
   ```ini
   OPENAI_API_KEY=your_actual_api_key_here
   AI_MODEL=gpt-4o-mini
   ALLOWED_ORIGINS=http://localhost:8000,http://127.0.0.1:8000
   PORT=3000
   ```

5. Start the FastAPI server:
   ```bash
   python python/ai_server.py
   ```
   *The backend will start on `http://127.0.0.1:3000` (health check at `/health`).*

---

### 3. Frontend Setup

Because the application uses ES modules, Web Workers, and Firebase Auth callbacks, serve the frontend using a local web server (running directly from `file:///` is not supported).

1. In another terminal, start a static server from the project root on port **8000**:
   ```bash
   # Using Python
   python -m http.server 8000

   # Or using Node.js npx
   npx serve . -p 8000
   ```

2. Open your browser and navigate to:
   - **Login**: [http://localhost:8000/html/login.html](http://localhost:8000/html/login.html)
   - **Register Company**: [http://localhost:8000/html/register.html](http://localhost:8000/html/register.html)
   - **Main Terminal**: [http://localhost:8000/html/index.html](http://localhost:8000/html/index.html)

---

### 4. Firebase Configuration & Rules

1. Update the `firebaseConfig` object in:
   - `javascript/app.js`
   - `javascript/auth.js`
   - `javascript/register.js`
2. Deploy the Firestore security rules to protect tenant and menu records:
   - Copy the rules from [`rules/firestore.rules`](rules/firestore.rules) into the **Firestore Database > Rules** tab in the Firebase Console, or deploy via Firebase CLI:
     ```bash
     firebase deploy --only firestore:rules
     ```

---

### 5. Running with Docker

You can containerize and run the AI backend service using Docker:

```bash
# Build Docker image
docker build -t echoserve-ai:latest .

# Run container on port 8080
docker run -d -p 8080:8080 --env-file .env echoserve-ai:latest
```

---

## 🔒 Security Best Practices

- **Never commit `.env`**: Always keep your secret keys out of version control. The `.gitignore` file is pre-configured to ignore `.env`, `.venv`, and editor settings.
- **Firebase API Keys**: Firebase web config keys identify your project. Ensure you set HTTP Referrer restrictions in Google Cloud Console to only allow your authorized domains (e.g. `localhost:8000` and your production domain).

