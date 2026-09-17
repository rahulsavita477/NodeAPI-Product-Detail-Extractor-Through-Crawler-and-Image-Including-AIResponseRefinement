import { readFile } from "node:fs/promises";
import path from "node:path";

import { decodeBarcodes } from "./barcode.js";
import { IMAGE_SYSTEM_PROMPT } from "./refinePrompt.js";
import { parseJsonLoose } from "./jsonParser.js";
import { callGroqWithFallback } from "./groqAI.js";

const MIME_BY_EXT = {
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
};

function mimeForPath(p) {
	return (
		MIME_BY_EXT[path.extname(p).toLowerCase()] ||
		"image/jpeg"
	);
}

async function toDataUrl(imagePath) {

	const buf = await readFile(imagePath);

	return `data:${mimeForPath(imagePath)};base64,${buf.toString("base64")}`;
}

export async function extractProduct(
	imagePaths,
	options = {}
) {

	if (
		!Array.isArray(imagePaths) ||
		imagePaths.length === 0
	) {
		throw new Error(
			"extractProduct: provide at least one image path"
		);
	}

	/*
	 * 1. Decode barcodes locally
	 */
	const scanBarcodes = options.scanBarcodes !== false;
	let decodedBarcodes = [];

	if (scanBarcodes) {

		const results = await Promise.all(
			imagePaths.map(
				(p) => decodeBarcodes(p).catch(() => [])
			)
		);

		decodedBarcodes = results.flat();
	}


	/*
	 * 2. Convert images to data URLs
	 */
	const imageParts = await Promise.all(

		imagePaths.map(async (p) => ({
			type: "image_url",

			image_url: {
				url: await toDataUrl(p)
			}
		}))

	);

	/*
	 * 3. Barcode information
	 */
	const barcodeHint = decodedBarcodes.length

		? `\n\nBarcodes decoded from the images ` +
		`(use the most relevant one): ` +
		`${decodedBarcodes
			.map(
				(b) => `${b.value} (${b.type})`
			)
			.join(", ")}`

		: "";

	/*
	 * 4. User message
	 */
	const userContent = [{
		type: "text",
		text: "Extract the product details from these " +
			"images as a single JSON object " +
			"following the schema." +
			barcodeHint
	}, ...imageParts];

	/*
	 * 5. AI messages
	 */

	const messages = [{
		role: "system",
		content: IMAGE_SYSTEM_PROMPT
	}, {
		role: "user",
		content: userContent
	}];

	/*
	 * 6. Common Groq model caller
	 */
	const result = await callGroqWithFallback(messages, {
		apiKey: options.apiKey,
		model: options.model,
		temperature: 0.2,
		// max_tokens: 2048,
		// response_format: {
		// 	type: "json_object"
		// }
	});

	/*
	 * 7. Parse AI JSON
	 */
	const product = parseJsonLoose(result.content);
	if (!product) {
		throw new Error(
			"Extraction failed: " +
			"could not parse model output as JSON"
		);
	}

	/*
	 * 8. Token information
	 */
	product.token = {
		input_tokens: result.completion?.usage?.prompt_tokens,
		output_tokens: result.completion?.usage?.completion_tokens,
		total_tokens: result.completion?.usage?.total_tokens
	};

	/*
	 * 9. Model actually used
	 */
	product.ai_model = result.model;

	return product;
}
