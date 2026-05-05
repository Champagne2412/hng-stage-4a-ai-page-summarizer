# ✦ AI Page Summarizer

A Chrome Extension that instantly summarizes any webpage using AI — with bullet points, key insights, reading time, and optional page highlights.

Built with Manifest V3, a secure Vercel proxy, and Groq's free LLM API.

---

## 📁 Repository Structure

```
ai-page-summarizer/
├── extension/          # Chrome Extension (Manifest V3)
│   ├── manifest.json
│   ├── popup.html
│   ├── icons/
│   └── src/
│       ├── background.js     # Service worker — calls Vercel proxy
│       ├── content.js        # Page extraction & highlighting
│       └── popup.js          # Popup UI controller
│
├── proxy/              # Vercel Serverless Proxy
│   ├── api/
│   │   └── summarize.js      # Secure API route — holds the API key
│   ├── vercel.json
│   └── .env.example
│
└── README.md
```

---

## 🔐 Security Architecture

```
Chrome Extension          Vercel Proxy             Groq API
─────────────────         ────────────────         ────────────
background.js        →    /api/summarize      →    LLM response
(no API key)              (API key in env)         
```

- The Chrome Extension contains **zero API keys**
- The API key lives **only** in Vercel Environment Variables
- Both folders are **safe to push to a public GitHub repo**

---

## 🚀 Setup & Installation

### Step 1 — Deploy the Proxy to Vercel

1. **Push this repo to GitHub**
   ```bash
   git init
   git add .
   git commit -m "initial commit"
   git remote add origin https://github.com/yourusername/ai-page-summarizer.git
   git push -u origin main
   ```

2. **Deploy on Vercel**
   - Go to [vercel.com](https://vercel.com) → sign in with GitHub
   - Click **"Add New Project"** → import this repo
   - Set the **Root Directory** to `proxy`
   - Click **Deploy**

3. **Add your API key in Vercel**
   - Go to your project → **Settings → Environment Variables**
   - Add: `GROQ_API_KEY` = your key from [console.groq.com](https://console.groq.com)
   - Click **Save** → go to **Deployments** → **Redeploy**

4. **Copy your Vercel URL** (e.g. `https://ai-page-summarizer-proxy.vercel.app`)

---

### Step 2 — Configure the Extension

Open `extension/src/background.js` and update the proxy URL:

```js
const PROXY_URL = "https://your-actual-vercel-url.vercel.app";
```

---

### Step 3 — Load the Extension in Chrome

1. Open Chrome → go to `chrome://extensions/`
2. Enable **Developer Mode** (top-right toggle)
3. Click **"Load unpacked"**
4. Select the `extension/` folder
5. Pin the extension via the 🧩 toolbar icon

---

### Step 4 — Test It

1. Navigate to any article page (Wikipedia, BBC, Medium, etc.)
2. Click the **AI Summarizer** icon in the toolbar
3. Click **Summarize Page**
4. View bullet points, insights, reading time, and sentiment

---

## 🏗️ Architecture

### Data Flow
```
User clicks "Summarize"
        │
        ▼
   popup.js (UI)
        │── message → content.js
        │             └── extracts page text (strips nav/ads/footer)
        │── message → background.js
                      └── checks chrome.storage cache
                      └── if not cached → POST to Vercel proxy
                                          └── Vercel calls Groq API
                                          └── returns structured JSON
                      └── saves to cache
                      └── returns summary to popup
        │
        ▼
   popup.js renders results
        │
        ▼ (optional)
   content.js highlights key phrases on page
```

### Chrome Messaging
```
popup.js  ←→  chrome.runtime.sendMessage  ←→  background.js
popup.js  ←→  chrome.tabs.sendMessage     ←→  content.js
```

---

## 🤖 AI Integration

- **Provider**: Groq (free, 14,400 req/day)
- **Model**: `llama-3.3-70b-versatile`
- **Prompt**: Returns structured JSON with summary, bullets, insights, sentiment, highlights
- **Caching**: Summaries cached per URL for 1 hour in `chrome.storage.local`

### Summary Styles
| Style | Description |
|---|---|
| Brief | 3 bullet points — quick overview |
| Detailed | 5-7 bullet points — default |
| Academic | Structured analysis |

---

## 🔐 Security Decisions

| Decision | Reason |
|---|---|
| API key in Vercel env vars only | Never exposed in extension code or GitHub |
| Vercel proxy as middleman | Extension has no credentials — safe to distribute |
| `textContent` only (no `innerHTML`) | Prevents XSS from malicious page content |
| Minimal permissions in manifest | Only `activeTab`, `scripting`, `storage` |
| Content script auto-injection | Handles tabs opened before extension install |
| Rate limiting in background.js | Prevents accidental API spam |

---

## ⚖️ Trade-offs

| Decision | Why | Trade-off |
|---|---|---|
| Vercel proxy | Zero keys in extension | Requires internet + Vercel uptime |
| Groq free tier | No cost to developer | 14,400 req/day limit |
| Content truncated at 12k chars | Token/cost control | Very long articles lose tail content |
| 1-hour cache | Reduces API calls | Stale summaries on frequently updated pages |
| No readability.js | Keeps extension lightweight | May struggle on unusual page layouts |

---

## 📋 Acceptance Criteria

| Criteria | Status |
|---|---|
| Extension installs correctly | ✅ |
| Works on most article pages | ✅ |
| Extracts meaningful content | ✅ |
| Summary generated correctly | ✅ |
| No exposed API keys | ✅ Key lives only in Vercel |
| Clean architecture | ✅ Monorepo, modular files |
| Proper Chrome messaging | ✅ popup ↔ background ↔ content |
| Good UX polish | ✅ Dark UI, loading states, toast, highlights |
| Minimal performance impact | ✅ Only runs on user action |

---

## 🛠️ Local Development

```bash
# Clone the repo
git clone https://github.com/yourusername/ai-page-summarizer.git

# Set up proxy locally
cd proxy
cp .env.example .env.local
# Add your GROQ_API_KEY to .env.local

# Install Vercel CLI and run locally
npm i -g vercel
vercel dev
# Proxy runs on http://localhost:3000

# Update extension/src/background.js
const PROXY_URL = "http://localhost:3000";

# Load extension/  in chrome://extensions → Load unpacked
```
