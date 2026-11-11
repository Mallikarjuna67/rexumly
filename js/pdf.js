/* =========================================
   REXUMLY - RESUME TEXT EXTRACTION
   Supports PDF, DOCX, PNG, JPG and JPEG
========================================= */

import * as pdfjsLib from
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.mjs";

import mammoth from
    "https://esm.sh/mammoth@1.10.0";

import { createWorker } from
    "https://cdn.jsdelivr.net/npm/tesseract.js@6.0.1/+esm";

// PDF.js worker configuration
pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.mjs";


/* =========================================
   1. PDF TEXT EXTRACTION
========================================= */

async function extractPDF(file) {
    const buffer = await file.arrayBuffer();

    const pdf = await pdfjsLib.getDocument({
        data: new Uint8Array(buffer)
    }).promise;

    const pages = [];

    for (
        let pageNumber = 1;
        pageNumber <= pdf.numPages;
        pageNumber++
    ) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        pages.push(
            content.items
                .map(item => item.str || "")
                .join(" ")
        );
    }

    return pages.join("\n\n").trim();
}


/* =========================================
   2. DOCX TEXT EXTRACTION
========================================= */

async function extractDOCX(file) {
    const buffer = await file.arrayBuffer();

    const result = await mammoth.extractRawText({
        arrayBuffer: buffer
    });

    return result.value.trim();
}


/* =========================================
   3. IMAGE PREPROCESSING
========================================= */

// Calculate automatic black-and-white threshold using Otsu's method
function calculateThreshold(imageData) {
    const pixels = imageData.data;
    const histogram = new Array(256).fill(0);

    const totalPixels = pixels.length / 4;

    for (let i = 0; i < pixels.length; i += 4) {
        histogram[Math.round(pixels[i])]++;
    }

    let totalSum = 0;

    for (let i = 0; i < 256; i++) {
        totalSum += i * histogram[i];
    }

    let backgroundWeight = 0;
    let backgroundSum = 0;
    let maximumVariance = 0;
    let threshold = 128;

    for (let i = 0; i < 256; i++) {
        backgroundWeight += histogram[i];

        if (backgroundWeight === 0) continue;

        const foregroundWeight =
            totalPixels - backgroundWeight;

        if (foregroundWeight === 0) break;

        backgroundSum += i * histogram[i];

        const backgroundMean =
            backgroundSum / backgroundWeight;

        const foregroundMean =
            (totalSum - backgroundSum) / foregroundWeight;

        const variance =
            backgroundWeight *
            foregroundWeight *
            Math.pow(backgroundMean - foregroundMean, 2);

        if (variance > maximumVariance) {
            maximumVariance = variance;
            threshold = i;
        }
    }

    return threshold;
}

async function preprocessImage(file) {
    const bitmap = await createImageBitmap(file);

    try {
        const maxDimension = Math.max(bitmap.width, bitmap.height);

        // Upscale small images, but limit maximum dimensions
        const scale = Math.min(3, 3200 / maxDimension);

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));

        const context = canvas.getContext("2d", {
            willReadFrequently: true
        });

        if (!context) {
            throw new Error("Unable to process uploaded image.");
        }

        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";

        context.drawImage(
            bitmap,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const imageData = context.getImageData(
            0, 0, canvas.width, canvas.height
        );

        const pixels = imageData.data;

        // Convert to grayscale and improve contrast
        for (let i = 0; i < pixels.length; i += 4) {
            const gray =
                0.299 * pixels[i] +
                0.587 * pixels[i + 1] +
                0.114 * pixels[i + 2];

            const enhanced = Math.max(
                0,
                Math.min(255, (gray - 128) * 1.4 + 128)
            );

            pixels[i] = enhanced;
            pixels[i + 1] = enhanced;
            pixels[i + 2] = enhanced;
        }

        context.putImageData(imageData, 0, 0);

        // Create a sharpened grayscale version
        const sharpenedCanvas = document.createElement("canvas");
        sharpenedCanvas.width = canvas.width;
        sharpenedCanvas.height = canvas.height;

        const sharpenedContext = sharpenedCanvas.getContext("2d", {
            willReadFrequently: true
        });

        if (!sharpenedContext) {
            throw new Error("Unable to sharpen uploaded image.");
        }

        const sharpenedData = sharpenedContext.createImageData(
            canvas.width,
            canvas.height
        );

        const width = canvas.width;
        const height = canvas.height;

        // Mild sharpening kernel
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const index = (y * width + x) * 4;

                const center = pixels[index];

                const top = y > 0
                    ? pixels[((y - 1) * width + x) * 4]
                    : center;

                const bottom = y < height - 1
                    ? pixels[((y + 1) * width + x) * 4]
                    : center;

                const left = x > 0
                    ? pixels[(y * width + x - 1) * 4]
                    : center;

                const right = x < width - 1
                    ? pixels[(y * width + x + 1) * 4]
                    : center;

                const value = Math.max(
                    0,
                    Math.min(
                        255,
                        3 * center -
                        0.5 * (top + bottom + left + right)
                    )
                );

                sharpenedData.data[index] = value;
                sharpenedData.data[index + 1] = value;
                sharpenedData.data[index + 2] = value;
                sharpenedData.data[index + 3] = 255;
            }
        }

        sharpenedContext.putImageData(sharpenedData, 0, 0);

        // Create an Otsu black-and-white version
        const threshold = calculateThreshold(imageData);

        const binaryCanvas = document.createElement("canvas");
        binaryCanvas.width = width;
        binaryCanvas.height = height;

        const binaryContext = binaryCanvas.getContext("2d");

        if (!binaryContext) {
            throw new Error("Unable to create threshold image.");
        }

        const binaryData = binaryContext.createImageData(width, height);

        for (let i = 0; i < pixels.length; i += 4) {
            const value = pixels[i] > threshold ? 255 : 0;

            binaryData.data[i] = value;
            binaryData.data[i + 1] = value;
            binaryData.data[i + 2] = value;
            binaryData.data[i + 3] = 255;
        }

        binaryContext.putImageData(binaryData, 0, 0);

        return {
            grayscale: canvas,
            sharpened: sharpenedCanvas,
            binary: binaryCanvas
        };

    } finally {
        bitmap.close();
    }
}

/* =========================================
   4. IMAGE OCR EXTRACTION
========================================= */

async function extractImage(file) {
    let worker;

    try {
        console.log("Preparing image for OCR...");

        const processedImages = await preprocessImage(file);

        console.log("Image preprocessing completed.");

        worker = await createWorker("eng");

        await worker.setParameters({
            tessedit_pageseg_mode: "6",
            preserve_interword_spaces: "1"
        });

        // First OCR attempt: enhanced grayscale image
        console.log("Running OCR on enhanced image...");

        const firstResult = await worker.recognize(
            processedImages.grayscale
        );

        let bestText = firstResult.data.text.trim();

        let bestConfidence =
            firstResult.data.confidence || 0;

        console.log(
            "First OCR confidence:",
            bestConfidence
        );

        // Retry with black-and-white image if needed
        if (
            bestConfidence < 78 ||
            bestText.length < 100
        ) {
            console.log("Retrying OCR with threshold image...");

            const secondResult = await worker.recognize(
                processedImages.binary
            );

            const secondText =
                secondResult.data.text.trim();

            const secondConfidence =
                secondResult.data.confidence || 0;

            console.log(
                "Second OCR confidence:",
                secondConfidence
            );

            // Select the result with better confidence
            if (
                secondConfidence > bestConfidence ||
                (
                    secondConfidence === bestConfidence &&
                    secondText.length > bestText.length
                )
            ) {
                bestText = secondText;
                bestConfidence = secondConfidence;
            }
        }

        console.log("Final OCR confidence:", bestConfidence);

        return bestText;

    } catch (error) {
    console.error("DETAILED IMAGE OCR ERROR:", error);

    throw new Error(
        `Image OCR failed: ${error.message || error}`
    );

} finally {
        if (worker) {
            await worker.terminate();
        }
    }
}


/* =========================================
   5. OCR TEXT CLEANUP
========================================= */

function cleanExtractedText(text) {
    if (!text) return "";

    return text
        // Normalize Windows and Mac line endings
        .replace(/\r\n?/g, "\n")

        // Remove invisible control characters
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")

        // Normalize unusual spaces
        .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ")

        // Remove excessive spaces while preserving line breaks
        .replace(/[ \t]+/g, " ")

        // Remove spaces at the beginning and end of lines
        .replace(/^[ \t]+|[ \t]+$/gm, "")

        // Reduce excessive blank lines
        .replace(/\n{3,}/g, "\n\n")

        // Remove empty bullet-only lines
        .replace(/^[•●▪◦\-]\s*$/gm, "")

        .trim();
}


/* =========================================
   6. EXTRACTION VALIDATION
========================================= */

function validateExtractedText(text) {
    if (!text || text.length < 50) {
        throw new Error(
            "Very little resume text was extracted. Please upload a clearer document."
        );
    }

    // Check whether the extracted content contains enough readable characters
    const readableCharacters =
        (text.match(/[a-zA-Z0-9]/g) || []).length;

    const readableRatio =
        readableCharacters / text.length;

    if (readableRatio < 0.35) {
        throw new Error(
            "The extracted resume text appears unclear. Please upload a better-quality file."
        );
    }

    return true;
}


/* =========================================
   7. MAIN EXTRACTION FUNCTION
========================================= */

export async function extractResumeText(file) {
    if (!file) {
        throw new Error("No resume file was provided.");
    }

    const extension = file.name
        .split(".")
        .pop()
        .toLowerCase();

    let extractedText = "";

    try {
        switch (extension) {
            case "pdf":
                console.log("Extracting PDF text...");
                extractedText = await extractPDF(file);
                break;

            case "docx":
                console.log("Extracting DOCX text...");
                extractedText = await extractDOCX(file);
                break;

            case "png":
            case "jpg":
            case "jpeg":
                console.log("Extracting image text...");
                extractedText = await extractImage(file);
                break;

            default:
                throw new Error(
                    "Unsupported format. Upload PDF, DOCX, PNG or JPG."
                );
        }

        // Clean extracted resume text
        extractedText = cleanExtractedText(extractedText);

        // Validate extracted content
        validateExtractedText(extractedText);

        console.log("Resume text cleanup completed.");
        console.log("Final extracted character count:", extractedText.length);

        return extractedText;

    } catch (error) {
        console.error("Resume extraction error:", error);

        throw new Error(
            error.message ||
            "Unable to extract text from this resume."
        );
    }
}
