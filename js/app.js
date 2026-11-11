/* =========================================
   REXUMLY - MAIN APPLICATION
   Gemini AI Integrated Version
========================================= */

import {
    updateFileInfo,
    showMessage,
    setLoading,
    renderAnalysis,
    copyReport
} from "./ui.js";

import { extractResumeText } from "./pdf.js";

import { analyzeResume } from "./analysis-client.js";


// =========================================
// DOM ELEMENTS
// =========================================

const menuToggle = document.getElementById("menuToggle");
const navMenu = document.getElementById("navMenu");

const uploadArea = document.getElementById("uploadArea");
const resumeFile = document.getElementById("resumeFile");
const browseButton = document.getElementById("browseButton");

const fileInfo = document.getElementById("fileInfo");
const jobDescription = document.getElementById("jobDescription");
const charCount = document.getElementById("charCount");

const resumeForm = document.getElementById("resumeForm");
const analyzeButton = document.getElementById("analyzeButton");
const formMessage = document.getElementById("formMessage");

const copyReportButton = document.getElementById("copyReportButton");


// =========================================
// APPLICATION STATE
// =========================================

let selectedFile = null;
let extractedResumeText = "";

const MAX_FILE_SIZE = 5 * 1024 * 1024;


// =========================================
// MOBILE NAVIGATION
// =========================================

if (menuToggle && navMenu) {
    menuToggle.addEventListener("click", () => {
        const isOpen = navMenu.classList.toggle("active");

        menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );
    });

    navMenu.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            navMenu.classList.remove("active");

            menuToggle.setAttribute(
                "aria-expanded",
                "false"
            );
        });
    });
}


// =========================================
// FILE VALIDATION
// =========================================

function validateFile(file) {
    if (!file) {
        return "Please select a resume file.";
    }

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    const allowedExtensions = [
        "pdf",
        "docx",
        "png",
        "jpg",
        "jpeg"
    ];

    if (!allowedExtensions.includes(extension)) {
        return "Unsupported file. Upload PDF, DOCX, PNG or JPG.";
    }

    if (file.size === 0) {
        return "The selected file is empty.";
    }

    if (file.size > MAX_FILE_SIZE) {
        return "File size must not exceed 5 MB.";
    }

    return null;
}


// =========================================
// HANDLE FILE SELECTION
// =========================================

function handleFileSelection(file) {
    const error = validateFile(file);

    if (error) {
        selectedFile = null;
        extractedResumeText = "";

        if (resumeFile) {
            resumeFile.value = "";
        }

        if (fileInfo) {
            fileInfo.textContent = "";
        }

        showMessage(formMessage, error, "error");
        return;
    }

    selectedFile = file;
    extractedResumeText = "";

    updateFileInfo(selectedFile, fileInfo);

    showMessage(
        formMessage,
        "Resume selected successfully.",
        "success"
    );
}


// =========================================
// BROWSE BUTTON
// =========================================

if (browseButton && resumeFile) {
    browseButton.addEventListener("click", event => {
        event.stopPropagation();
        resumeFile.click();
    });
}


// =========================================
// CLICK UPLOAD AREA
// =========================================

if (uploadArea && resumeFile) {
    uploadArea.addEventListener("click", event => {
        if (event.target.closest("button")) {
            return;
        }

        resumeFile.click();
    });
}


// =========================================
// FILE INPUT CHANGE
// =========================================

if (resumeFile) {
    resumeFile.addEventListener("change", () => {
        const file = resumeFile.files[0];

        if (file) {
            handleFileSelection(file);
        }
    });
}


// =========================================
// DRAG AND DROP
// =========================================

if (uploadArea) {
    ["dragenter", "dragover"].forEach(eventName => {
        uploadArea.addEventListener(eventName, event => {
            event.preventDefault();
            uploadArea.classList.add("dragover");
        });
    });

    ["dragleave", "drop"].forEach(eventName => {
        uploadArea.addEventListener(eventName, event => {
            event.preventDefault();
            uploadArea.classList.remove("dragover");
        });
    });

    uploadArea.addEventListener("drop", event => {
        const files = event.dataTransfer.files;

        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });
}


// =========================================
// JOB DESCRIPTION CHARACTER COUNTER
// =========================================

if (jobDescription && charCount) {
    jobDescription.addEventListener("input", () => {
        const count = jobDescription.value.length;

        charCount.textContent =
            `${count.toLocaleString()} characters`;
    });
}


// =========================================
// FORM SUBMISSION
// RESUME EXTRACTION + GEMINI AI ANALYSIS
// =========================================

if (resumeForm) {
    resumeForm.addEventListener("submit", async event => {
        event.preventDefault();

        // Validate resume
        if (!selectedFile) {
            showMessage(
                formMessage,
                "Please upload your resume first.",
                "error"
            );
            return;
        }

        // Validate job description
        const description = jobDescription.value.trim();

        if (!description) {
            showMessage(
                formMessage,
                "Please enter a job description.",
                "error"
            );

            jobDescription.focus();
            return;
        }

        if (description.length < 50) {
            showMessage(
                formMessage,
                "Please enter a more detailed job description (at least 50 characters).",
                "error"
            );

            jobDescription.focus();
            return;
        }

        // Hide previous results before starting new analysis
        const resultsSection = document.getElementById("results");

        if (resultsSection) {
            resultsSection.hidden = true;
        }

        setLoading(analyzeButton, true);

        try {
            // STEP 1: Extract resume text
            showMessage(
                formMessage,
                "Step 1/2: Extracting text from your resume...",
                "info"
            );

            extractedResumeText =
                await extractResumeText(selectedFile);

            if (!extractedResumeText ||
                extractedResumeText.length < 50) {
                throw new Error(
                    "Unable to extract sufficient resume information."
                );
            }

            console.log(
                "Resume text extraction successful. Characters:",
                extractedResumeText.length
            );

            // STEP 2: Send extracted text to Gemini
            showMessage(
                formMessage,
                "Step 2/2: Gemini AI is analyzing your resume. Please wait...",
                "info"
            );

            const analysis = await analyzeResume(
                extractedResumeText,
                description
            );

            // STEP 3: Validate AI response
            if (
                !analysis ||
                typeof analysis.score !== "number"
            ) {
                throw new Error(
                    "Gemini returned an invalid analysis."
                );
            }

            // STEP 4: Display analysis dashboard
            renderAnalysis(analysis);

            showMessage(
                formMessage,
                "Resume analysis completed successfully!",
                "success"
            );

            console.log(
                "Rexumly Gemini analysis completed successfully."
            );

        } catch (error) {
            extractedResumeText = "";

            console.error(
                "Rexumly analysis error:",
                error
            );

            showMessage(
                formMessage,
                error.message ||
                "Something went wrong. Please try again.",
                "error"
            );

        } finally {
            setLoading(analyzeButton, false);
        }
    });
}


// =========================================
// COPY ANALYSIS REPORT
// =========================================

if (copyReportButton) {
    copyReportButton.addEventListener("click", async () => {
        const success = await copyReport();

        showMessage(
            formMessage,
            success
                ? "Analysis report copied successfully!"
                : "No analysis report is available to copy.",
            success ? "success" : "error"
        );
    });
}


// =========================================
// FOOTER COPYRIGHT YEAR
// =========================================

const currentYear = document.getElementById("currentYear");

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}


// =========================================
// APPLICATION INITIALIZATION
// =========================================

console.log(
    "Rexumly application initialized successfully."
);
