# Rexumly – AI Resume Analyzer

Upload your resume, paste a job description, and get an AI-generated report showing how well they match, what is missing, and how to improve.

**Live demo:** [https://rexumly.vercel.app]

---

## Features

- **Resume upload:** supports PDF, DOCX, PNG, and JPG/JPEG files.
- **Text extraction:** reads text from documents, including scanned images using OCR.
- **Compatibility score:** an estimated match score from 0 to 100.
- **Detailed feedback:** strengths, weaknesses, missing skills, and practical recommendations.
- **Automatic AI fallback:** uses Google Gemini first and switches to Groq if Gemini fails.
- **Copyable report:** copy the full analysis with one click.
- **Responsive design:** works on desktop, tablet, and mobile.

> The score is an AI-generated estimate, not an official result from an Applicant Tracking System (ATS).

---

## Tech Stack

| Area | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Text extraction | PDF.js, Mammoth.js, Tesseract.js |
| AI providers | Google Gemini (primary), Groq (backup) |
| Backend | Node.js serverless function |
| Hosting | Vercel |

---

## How It Works

1. The user uploads a resume and pastes a job description.
2. The browser extracts the resume text.
3. The text is sent to the backend (`api/analyze.js`).
4. The backend asks **Gemini** for a structured analysis.
5. If Gemini fails (for example, quota exceeded or timeout), the backend automatically retries with **Groq**.
6. The result is returned and displayed in the dashboard.

Both providers return the same JSON structure, so the interface works the same regardless of which one answers.

| Provider | Model |
|---|---|
| Gemini (primary) | `gemini-3.7-flash` |
| Groq (backup) | `openai/gpt-oss-20b` |

---

## Project Structure

```text
Rexumly/
├── api/
│   └── analyze.js          # Backend: Gemini + Groq fallback
├── assets/icons/
│   └── rexumly-logo.png
├── css/
│   └── style.css
├── js/
│   ├── analysis-client.js  # Calls the backend API
│   ├── app.js              # Main app logic
│   ├── pdf.js              # Text extraction and OCR
│   └── ui.js               # Rendering results
├── .env.local              # Local API keys (never commit)
├── .gitignore
├── index.html
├── package.json
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v20.12 or newer recommended)
- [Git](https://git-scm.com/)
- A [Google Gemini API key](https://aistudio.google.com/)
- A [Groq API key](https://console.groq.com/)

### 1. Clone and install

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd Rexumly
npm install
```

### 2. Add your API keys

Create a file named `.env.local` in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key
GROQ_API_KEY=your_groq_api_key
```

Do not use quotes or spaces around `=`. Never commit this file to GitHub.

### 3. Run locally

```bash
npx vercel dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Primary AI provider |
| `GROQ_API_KEY` | Backup AI provider |

- **Local development:** values are read from `.env.local`.
- **Production:** `.env.local` is not used. Set the variables in the Vercel dashboard instead.

---

## Deployment (Vercel)

1. Push the project to GitHub.
2. Import the repository in [Vercel](https://vercel.com/).
3. Go to **Project → Settings → Environment Variables** and add `GEMINI_API_KEY` and `GROQ_API_KEY` for the **Production** environment.
4. Deploy (or redeploy if the project already exists, since new variables only apply to new deployments).
5. Open the live URL and test an analysis.

---

## Troubleshooting

| Problem | Likely cause and fix |
|---|---|
| `Groq fallback key is not configured` | `GROQ_API_KEY` is missing. Add it to `.env.local` (local) or Vercel settings (production), then restart the server or redeploy. |
| Gemini returns HTTP 429 | Quota or rate limit reached. Check usage in Google AI Studio. Groq takes over automatically if configured. |
| 503 error in the browser | Both providers failed. Check the server logs for the exact reason. |
| Changes to `.env.local` have no effect | Restart `vercel dev`. Environment variables are only read at startup. |

---

## Security and Privacy

- API keys are stored in environment variables and never exposed in frontend code.
- `.env.local` is excluded from Git through `.gitignore`.
- Resume text is not intentionally logged.
- Resume content is sent to the AI providers for analysis. Avoid uploading information you do not want shared, and review the privacy policies of [Google](https://policies.google.com/privacy) and [Groq](https://groq.com/privacy-policy/).

---

## Limitations

- Scores and recommendations are AI estimates and may be inaccurate.
- OCR quality depends on the clarity of the uploaded image or scan.
- Availability depends on provider uptime, quotas, and network conditions.

---

## Roadmap

- Resume rewriting suggestions
- Keyword optimization
- Downloadable PDF reports
- Comparison across multiple job descriptions
- Multilingual support

---

## Contributing

Contributions are welcome. Fork the repository, create a feature branch, make your changes, and open a pull request describing them.

---

## License

No license has been specified yet. Until one is added, all rights are reserved by the project owner.

---

**Rexumly – Make Your Resume Stand Out.**