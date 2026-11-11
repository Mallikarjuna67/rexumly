/* =========================================
   REXUMLY - GEMINI + GROQ FALLBACK BACKEND
========================================= */

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const GEMINI_MODEL = "gemini-3.7-flash";
const GROQ_MODEL = "openai/gpt-oss-20b";

const GEMINI_MAX_ATTEMPTS = 2;      // only used for 5xx / network errors
const GEMINI_TIMEOUT_MS = 20000;
const GROQ_MAX_ATTEMPTS = 2;
const GROQ_TIMEOUT_MS = 30000;

const GEMINI_RETRYABLE = [500, 502, 503, 504]; // 429 is NOT retried: fall back immediately
const GROQ_RETRYABLE = [429, 500, 502, 503, 504];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


/* =========================================
   LOCAL ENV LOADING (.env.local / .env)
========================================= */

// Minimal parser used when util.parseEnv is unavailable (Node < 20.12).
function parseEnvManually(content) {
    const result = {};

    for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const eq = line.indexOf("=");
        if (eq === -1) continue;

        const key = line.slice(0, eq).replace(/^export\s+/, "").trim();
        let value = line.slice(eq + 1).trim();

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        if (key) result[key] = value;
    }

    return result;
}

function parseEnvContent(content) {
    // Strip a possible UTF-8 BOM (common when files are saved from Windows editors).
    const clean = content.replace(/^\uFEFF/, "");

    if (typeof util.parseEnv === "function") {
        try {
            return util.parseEnv(clean);
        } catch {
            // fall through to manual parser
        }
    }
    return parseEnvManually(clean);
}

function loadLocalEnv() {
    // In production (Vercel, etc.) only real environment variables are used.
    // .env files are a local-development convenience and are not deployed.
    const isProduction =
        process.env.NODE_ENV === "production" ||
        process.env.VERCEL_ENV === "production";

    if (isProduction) {
        console.log("Production mode: skipping local .env files.");
        return;
    }

    // Highest priority first. The first file that defines a key wins.
    const candidates = [
        path.join(__dirname, "..", ".env.local"),
        path.join(process.cwd(), ".env.local"),
        path.join(__dirname, "..", ".env"),
        path.join(process.cwd(), ".env")
    ];

    const fromFiles = {};

    for (const filePath of candidates) {
        if (!fs.existsSync(filePath)) continue;

        try {
            const parsed = parseEnvContent(fs.readFileSync(filePath, "utf8"));

            for (const key of ["GEMINI_API_KEY", "GROQ_API_KEY"]) {
                if (!fromFiles[key] && parsed[key]?.trim()) {
                    fromFiles[key] = parsed[key].trim();
                }
            }

            console.log(`Local env file read: ${filePath}`);
        } catch (error) {
            console.error("Local environment loading failed:", error.message);
        }
    }

    // In local development, the file value overrides any stale shell value.
    for (const [key, value] of Object.entries(fromFiles)) {
        if (process.env[key] && process.env[key].trim() !== value) {
            console.log(`${key}: overriding existing environment value with .env file value.`);
        }
        process.env[key] = value;
    }
}

loadLocalEnv();


/* =========================================
   ERRORS
========================================= */

class TemporaryProviderError extends Error {
    constructor(message) {
        super(message);
        this.name = "TemporaryProviderError";
    }
}

class PermanentProviderError extends Error {
    constructor(message) {
        super(message);
        this.name = "PermanentProviderError";
    }
}


/* =========================================
   VALIDATION + PROMPT
========================================= */

// Both Gemini and Groq must return this same structure.
function validateAnalysis(rawText) {
    if (typeof rawText !== "string" || !rawText.trim()) {
        throw new Error("The AI provider returned an empty response.");
    }

    // Some models wrap JSON in ```json fences even when told not to.
    const cleaned = rawText
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/, "");

    const analysis = JSON.parse(cleaned);
    const score = Number(analysis.score);

    if (!Number.isInteger(score) || score < 0 || score > 100) {
        throw new Error("Invalid analysis score.");
    }

    if (typeof analysis.summary !== "string") {
        throw new Error("Invalid analysis summary.");
    }

    const listFields = [
        "strengths",
        "weaknesses",
        "missingSkills",
        "recommendations"
    ];

    for (const field of listFields) {
        if (!Array.isArray(analysis[field])) {
            throw new Error(`Invalid analysis field: ${field}`);
        }

        analysis[field] = analysis[field]
            .filter((item) => typeof item === "string")
            .slice(0, 10);
    }

    return {
        success: true,
        score,
        summary: analysis.summary,
        strengths: analysis.strengths,
        weaknesses: analysis.weaknesses,
        missingSkills: analysis.missingSkills,
        recommendations: analysis.recommendations
    };
}

function createPrompt(resumeText, jobDescription) {
    return `
You are Rexumly, a professional resume analysis assistant.

Analyze the candidate's resume against the supplied job description.

IMPORTANT RULES:
1. Base your analysis only on the supplied resume and job description.
2. Never invent qualifications, experience, skills, projects or achievements.
3. Treat the ATS score as an estimated compatibility score, not an actual score from an ATS platform.
4. Evaluate relevant skills, experience, education, projects and keywords.
5. Identify missing or weakly demonstrated job requirements.
6. Give practical, specific recommendations.
7. Do not penalize a candidate for information that the resume does not claim to contain.
8. Return valid JSON only, following the requested structure.

Your JSON must contain:
- score: integer from 0 to 100
- summary: string
- strengths: array of strings
- weaknesses: array of strings
- missingSkills: array of strings
- recommendations: array of strings

RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription}
`;
}


/* =========================================
   GEMINI PRIMARY PROVIDER
========================================= */

async function analyzeWithGemini(prompt, apiKey) {
    const apiUrl =
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

    let apiResponse;

    for (let attempt = 1; attempt <= GEMINI_MAX_ATTEMPTS; attempt++) {
        try {
            console.log(`Gemini analysis attempt ${attempt}/${GEMINI_MAX_ATTEMPTS}`);

            apiResponse = await fetch(apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-goog-api-key": apiKey
                },
                signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: {
                        temperature: 0.2,
                        responseMimeType: "application/json",
                        responseSchema: {
                            type: "OBJECT",
                            properties: {
                                score: {
                                    type: "INTEGER",
                                    description: "Estimated compatibility score from 0 to 100."
                                },
                                summary: { type: "STRING" },
                                strengths: { type: "ARRAY", items: { type: "STRING" } },
                                weaknesses: { type: "ARRAY", items: { type: "STRING" } },
                                missingSkills: { type: "ARRAY", items: { type: "STRING" } },
                                recommendations: { type: "ARRAY", items: { type: "STRING" } }
                            },
                            required: [
                                "score",
                                "summary",
                                "strengths",
                                "weaknesses",
                                "missingSkills",
                                "recommendations"
                            ]
                        }
                    }
                })
            });
        } catch (error) {
            console.error("GEMINI CONNECTION DETAILS:", {
                name: error.name,
                message: error.message,
                cause: error.cause?.message
            });

            if (attempt === GEMINI_MAX_ATTEMPTS) {
                throw new TemporaryProviderError("Gemini connection failed.");
            }

            await sleep(attempt * 1500);
            continue;
        }

        // 429 = quota / rate limit. Retrying immediately won't help, so
        // fail fast and let the Groq fallback take over.
        if (apiResponse.status === 429) {
            const retryAfter = apiResponse.headers.get("retry-after");
            console.error(
                `Gemini rate limit / quota exceeded (HTTP 429).` +
                (retryAfter ? ` Retry-After: ${retryAfter}s.` : "")
            );
            throw new TemporaryProviderError("Gemini quota or rate limit exceeded.");
        }

        if (GEMINI_RETRYABLE.includes(apiResponse.status)) {
            console.error(`Gemini temporary HTTP error: ${apiResponse.status}`);

            if (attempt === GEMINI_MAX_ATTEMPTS) {
                throw new TemporaryProviderError(
                    `Gemini temporarily unavailable: HTTP ${apiResponse.status}`
                );
            }

            await sleep(attempt * 1500);
            continue;
        }

        if (!apiResponse.ok) {
            const errorBody = await apiResponse.text().catch(() => "");
            console.error(
                `Gemini rejected the request: HTTP ${apiResponse.status}`,
                errorBody.slice(0, 300)
            );
            throw new PermanentProviderError(
                `Gemini request rejected: HTTP ${apiResponse.status}`
            );
        }

        break;
    }

    let result;
    try {
        result = await apiResponse.json();
    } catch {
        throw new TemporaryProviderError("Gemini returned an unreadable response.");
    }

    const generatedText = result.candidates?.[0]?.content?.parts
        ?.map((part) => part.text || "")
        .join("")
        .trim();

    try {
        return validateAnalysis(generatedText);
    } catch (error) {
        console.error("Gemini analysis validation failed:", error.message);
        throw new TemporaryProviderError("Gemini returned an invalid analysis.");
    }
}


/* =========================================
   GROQ BACKUP PROVIDER
========================================= */

async function analyzeWithGroq(prompt, apiKey) {
    let response;

    for (let attempt = 1; attempt <= GROQ_MAX_ATTEMPTS; attempt++) {
        console.log(`Groq analysis attempt ${attempt}/${GROQ_MAX_ATTEMPTS}`);

        try {
            response = await fetch(
                "https://api.groq.com/openai/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${apiKey}`
                    },
                    signal: AbortSignal.timeout(GROQ_TIMEOUT_MS),
                    body: JSON.stringify({
                        model: GROQ_MODEL,
                        messages: [
                            {
                                role: "system",
                                content:
                                    "You are Rexumly, a professional resume analysis assistant. Follow the user's instructions and return valid JSON only."
                            },
                            { role: "user", content: prompt }
                        ],
                        temperature: 0.2,
                        response_format: { type: "json_object" }
                    })
                }
            );
        } catch (error) {
            console.error("GROQ CONNECTION DETAILS:", {
                name: error.name,
                message: error.message,
                cause: error.cause?.message
            });

            if (attempt === GROQ_MAX_ATTEMPTS) {
                throw new TemporaryProviderError("Groq connection failed.");
            }

            await sleep(attempt * 1500);
            continue;
        }

        if (!response.ok) {
            const errorBody = await response.text().catch(() => "");
            console.error(
                `Groq API error: HTTP ${response.status}`,
                errorBody.slice(0, 300)
            );

            if (
                GROQ_RETRYABLE.includes(response.status) &&
                attempt < GROQ_MAX_ATTEMPTS
            ) {
                await sleep(attempt * 1500);
                continue;
            }

            throw new TemporaryProviderError(
                `Groq request failed: HTTP ${response.status}`
            );
        }

        break;
    }

    let result;
    try {
        result = await response.json();
    } catch {
        throw new TemporaryProviderError("Groq returned an unreadable response.");
    }

    const generatedText = result.choices?.[0]?.message?.content;

    try {
        return validateAnalysis(generatedText);
    } catch (error) {
        console.error("Groq analysis validation failed:", error.message);
        throw new TemporaryProviderError("Groq returned an invalid analysis.");
    }
}


/* =========================================
   MAIN API HANDLER
========================================= */

module.exports = async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method not allowed. Use POST." });
    }

    try {
        const geminiKey = process.env.GEMINI_API_KEY?.trim();
        const groqKey = process.env.GROQ_API_KEY?.trim();

        console.log("BACKEND ENV CHECK:", {
            gemini: Boolean(geminiKey),
            groq: Boolean(groqKey),
            groqLength: groqKey?.length || 0
        });

        // At least one provider must be configured.
        if (!geminiKey && !groqKey) {
            return res.status(500).json({
                error: "No AI provider API key is configured."
            });
        }

        const body = req.body || {};
        const resumeText = body.resumeText;
        const jobDescription = body.jobDescription;

        if (typeof resumeText !== "string" || typeof jobDescription !== "string") {
            return res.status(400).json({
                error: "Resume text and job description are required."
            });
        }

        if (resumeText.trim().length < 50 || jobDescription.trim().length < 50) {
            return res.status(400).json({
                error:
                    "Resume and job description must each contain at least 50 characters."
            });
        }

        if (resumeText.length > 30000 || jobDescription.length > 15000) {
            return res.status(413).json({
                error:
                    "The submitted text is too long. Please shorten the resume or job description."
            });
        }

        const prompt = createPrompt(resumeText, jobDescription);

        // 1) Try Gemini first (if configured).
        if (geminiKey) {
            try {
                const analysis = await analyzeWithGemini(prompt, geminiKey);
                console.log("Analysis completed using Gemini.");
                return res.status(200).json({ ...analysis, provider: "gemini" });
            } catch (geminiError) {
                console.error(
                    `Gemini failed (${geminiError.name}): ${geminiError.message}`
                );
                console.error("Checking Groq fallback.");
            }
        }

        // 2) Fall back to Groq for ANY Gemini failure.
        if (!groqKey) {
            console.error("Groq fallback key is not configured.");
            return res.status(503).json({
                error:
                    "Gemini is unavailable and the Groq backup is not configured."
            });
        }

        try {
            const analysis = await analyzeWithGroq(prompt, groqKey);
            console.log("Analysis completed using Groq fallback.");
            return res.status(200).json({ ...analysis, provider: "groq" });
        } catch (groqError) {
            console.error(
                `Both AI providers failed. Groq: ${groqError.message}`
            );
            return res.status(503).json({
                error:
                    "Resume analysis is temporarily unavailable. Please try again in a few moments."
            });
        }
    } catch (error) {
        console.error("Resume analysis error:", error.message);
        return res.status(500).json({
            error: "An unexpected error occurred during resume analysis."
        });
    }
};