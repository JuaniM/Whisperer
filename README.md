# Whisperer
A real-time assistant for speakers during live virtual meetings. It listens to spoken conversation, automatically identifies questions and critical topics, and instantly gives factual answers strictly grounded in uploaded official documentation.

---

## 📦 What's Inside the Package (`Whisperer')

Key files:
- **`launcher.html`**: The 1-click pop-out launcher. Double-click this to open the dashboard formatted as a neat, narrow vertical Side Panel window docked right next to your meeting.
- **`whisperer_single_file.html`**: The complete, standalone single-file dashboard (no external servers or setup required). Can be opened directly in any browser.
- **`README.md`**: This quick-start deployment guide.
- **`modules/` & `app.js` & `styles.css`**: The modular source code files used to build `whisperer_single_file.html`.

---

## 🚀 Step-by-Step Deployment & Setup Guide

### Step 1: Unzip the Package
Download and extract to a folder on your computer (e.g., inside `Documents/` or `Downloads/`).

### Step 2: Launch the Executive Side Panel
1. Double-click **`launcher.html`** in your file explorer.
2. Your web browser (desktop Chrome recommended) will immediately open a clean, narrow **450px wide vertical Side Panel window** (`WhispererSidePanel`) and dock it right next to your active meeting screen.
3. Once the side panel window opens, `launcher.html` automatically displays a success checkmark and closes itself cleanly.
   - *(Note: If your browser's pop-up blocker stops the initial auto-launch on first run, simply click the blue **🚀 Open in Side Panel Window** button once).*

### Step 3: Get Your Google Gemini API Key
To power the real-time AI reasoning, Whisperer connects directly to Google's Gemini API:
1. Go to **[Google AI Studio](https://aistudio.google.com/app/apikey)** (`https://aistudio.google.com/app/apikey`).
2. Sign in with your Google account.
3. Click **Create API Key** (you can create one inside a new or existing Google Cloud project).
4. Copy the generated API key string to your clipboard.

### Step 4: Configure Settings in Whisperer
1. Inside your open Whisperer Side Panel window, click the **⚙️ Settings & API** tab at the top.
2. Paste your copied API Key into the **Gemini API Key** input box.
3. Click **🔄 Fetch Authorized Models for Key**.
4. Recommended: Select Gemini 3.5 (Flash) from the dropdown.
5. Click **Test API Connection** to verify your setup (`✅ Gemini API Connection Successful!`).
6. Click **Save Settings** (your settings are safely saved directly in your browser's local storage and will persist automatically).

### Step 5: Load Your Briefing & Start Your Meeting
1. Click the **📄 Communications Document** tab.
2. Paste your raw briefing text, FAQ, press release, or talking points into the text area (or click **Choose File** to upload a `.txt` or `.md` briefing document).
3. Click **Save & Ground Co-Pilot**. The top status indicator will update to **`🟢 Document Loaded & Grounded`**.
4. Switch to the **🚀 Live Co-Pilot** tab and join your video call (Google Meet, Zoom, etc.) alongside the side panel window.
5. Click **▶️ Start Audio Listening**.
   - Your browser will ask: `"Allow this webpage to access your microphone?"` -> Click **Allow**.
   - As participants talk (or as you test by speaking questions out loud), live speech words stream into the preview box, questions are caught instantly, and grounded 1–2 sentence answers generate in `<0.5 seconds`!

---

## :( Known Issues

Latency during peak demand Gemini hours. This can be solved by upgrading to Gemini Pro.


## 💡 Pro-Tips & Executive Features

### 🔮 Anticipated Follow-Ups
Whenever Whisperer generates an answer for a detected question, it simultaneously predicts **what the reporter or analyst is likely to ask next** based on the topic and renders a ready-to-read **`🔮 Anticipated Follow-Up & Grounded Reply`** card right below your active reply.

### 🛡️ Strict Grounding & Deferral Safety (`Confidence Thresholds`)
Whisperer never hallucinates off-script answers:
- If a detected question is directly covered in your Communications Document (`Confidence Score >= 80%` or inferred `40-79%`), it synthesizes a concise, factual spoken response.
- If a question is asked that is **completely outside or not covered** in your document (`Confidence Score <= 5%`), Whisperer automatically defers and outputs the standard executive bridge:
  > *"That is an interesting question. We will look into it and follow up with you directly after the meeting."*

---
