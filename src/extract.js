import { readFile } from "node:fs/promises";
import path from "node:path";
import Groq from "groq-sdk";
import { decodeBarcodes } from "./barcode.js";
import { IMAGE_SYSTEM_PROMPT } from "./refinePrompt.js";

// Groq vision-capable model. Override with GROQ_MODEL env var if you like.
const DEFAULT_MODEL =
  process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct";

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function mimeForPath(p) {
  return MIME_BY_EXT[path.extname(p).toLowerCase()] || "image/jpeg";
}

async function toDataUrl(imagePath) {
  const buf = await readFile(imagePath);
  return `data:${mimeForPath(imagePath)};base64,${buf.toString("base64")}`;
}

/**
 * Extract structured product details from a set of images in ONE Groq vision
 * call. The model returns JSON already in the target format (see refinePrompt.js).
 */
export async function extractProduct(imagePaths, options = {}) {
  if (!Array.isArray(imagePaths) || imagePaths.length === 0) {
    throw new Error("extractProduct: provide at least one image path");
  }

  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Missing Groq API key. Set GROQ_API_KEY env var or pass options.apiKey."
    );
  }

  const model = options.model || DEFAULT_MODEL;
  const scanBarcodes = options.scanBarcodes !== false;
  const groq = new Groq({ apiKey });

  // 1) Decode barcodes locally (more reliable than the model for raw digits).
  let decodedBarcodes = [];
  if (scanBarcodes) {
    const results = await Promise.all(
      imagePaths.map((p) => decodeBarcodes(p).catch(() => []))
    );
    decodedBarcodes = results.flat();
  }

  // 2) Build the multimodal message.
  const imageParts = await Promise.all(
    imagePaths.map(async (p) => ({
      type: "image_url",
      image_url: { url: await toDataUrl(p) },
    }))
  );

  const barcodeHint = decodedBarcodes.length
    ? `\n\nBarcodes decoded from the images (use the most relevant one): ${decodedBarcodes
        .map((b) => `${b.value} (${b.type})`)
        .join(", ")}`
    : "";

  const userContent = [
    {
      type: "text",
      text:
        "Extract the product details from these images as a single JSON object following the schema." +
        barcodeHint,
    },
    ...imageParts,
  ];

  // 3) Call Groq. Try JSON mode first, fall back to plain parsing.
  const messages = [
    { role: "system", content: IMAGE_SYSTEM_PROMPT },
    { role: "user", content: userContent },
  ];

  let content;
  try {
    const completion = await groq.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
      response_format: { type: "json_object" },
    });
    content = completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    // Some vision models reject response_format; retry without it.
    const completion = await groq.chat.completions.create({
      model,
      messages,
      temperature: 0.2,
      max_tokens: 2048,
    });
    content = completion.choices[0]?.message?.content ?? "";
  }

  const product = parseJsonLoose(content);
  if (!product) {
    throw new Error("Extraction failed: could not parse model output as JSON");
  }
  return product;
}

/**
 * Parse JSON even if the model wrapped it in markdown fences or added stray text.
 */
export function parseJsonLoose(text) {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // fall through
    }
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      // fall through
    }
  }
  return null;
}