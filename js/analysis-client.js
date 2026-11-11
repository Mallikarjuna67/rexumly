
/* =========================================
   REXUMLY - ANALYSIS API CLIENT
========================================= */

export async function analyzeResume(
    resumeText,
    jobDescription
) {
    if (!resumeText || !jobDescription) {
        throw new Error(
            "Resume text and job description are required."
        );
    }

    const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            resumeText,
            jobDescription
        })
    });

    let result;

    try {
        result = await response.json();
    } catch {
        throw new Error(
            "The server returned an invalid response."
        );
    }

    if (!response.ok) {
        throw new Error(
            result.error || "Resume analysis failed."
        );
    }

    if (
        !result.success ||
        typeof result.score !== "number"
    ) {
        throw new Error(
            "The AI returned an invalid analysis."
        );
    }

    return result;
}
