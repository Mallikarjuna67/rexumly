
/* =========================================
   REXUMLY - UI CONTROLLER
========================================= */

// Display selected file information
export function updateFileInfo(file, element) {
    if (!file || !element) return;

    const size = (file.size / (1024 * 1024)).toFixed(2);

    element.textContent = `✓ ${file.name} (${size} MB)`;
}


// Display messages to the user
export function showMessage(element, message, type = "info") {
    if (!element) return;

    element.textContent = message;

    const colors = {
        success: "#16a36a",
        error: "#dc3545",
        info: "#6956e8"
    };

    element.style.color = colors[type] || colors.info;
}


// Manage analysis button loading state
export function setLoading(button, isLoading) {
    if (!button) return;

    button.disabled = isLoading;

    if (isLoading) {
        if (!button.dataset.originalText) {
            button.dataset.originalText = button.innerHTML;
        }

        button.innerHTML = "Analyzing... Please wait";
        button.classList.add("loading");
    } else {
        button.innerHTML =
            button.dataset.originalText ||
            'Analyze My Resume <span>→</span>';

        button.classList.remove("loading");
    }
}


// Display analysis results
export function renderAnalysis(data) {
    const resultsSection = document.getElementById("results");

    if (!resultsSection || !data) return;

    const scoreElement = document.getElementById("atsScore");
    const summaryElement = document.getElementById("scoreSummary");

    if (scoreElement) {
        scoreElement.textContent = `${data.score}/100`;
    }

    if (summaryElement) {
        summaryElement.textContent = data.summary || "";
    }

    const sections = [
        ["strengthsList", data.strengths],
        ["weaknessesList", data.weaknesses],
        ["missingSkillsList", data.missingSkills],
        ["recommendationsList", data.recommendations]
    ];

    sections.forEach(([elementId, items]) => {
        const list = document.getElementById(elementId);

        if (!list) return;

        list.replaceChildren();

        (items || []).forEach(item => {
            const li = document.createElement("li");
            li.textContent = item;
            list.appendChild(li);
        });
    });

    resultsSection.hidden = false;

    resultsSection.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}


// Copy generated analysis report
export async function copyReport() {
    const results = document.getElementById("analysisResults");

    if (!results) return false;

    const report = results.innerText.trim();

    if (!report) return false;

    try {
        await navigator.clipboard.writeText(report);
        return true;
    } catch (error) {
        console.error("Unable to copy report:", error);
        return false;
    }
}
