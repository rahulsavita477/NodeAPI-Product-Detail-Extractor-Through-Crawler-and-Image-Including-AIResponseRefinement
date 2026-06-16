// End-to-end demo: feeds the sample product photo + spec sheet + invoice +
// barcode into the extractor and prints the resulting JSON.
//
//   GROQ_API_KEY=xxx node examples/demo.js
//
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractProduct } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const img = (name) => path.join(here, "images", name);

const images = [
  img("product.png"),
  img("spec-sheet.png"),
  img("invoice.png"),
  img("barcode.png"),
];

console.log("Extracting product details from:");
images.forEach((i) => console.log("  -", path.basename(i)));
console.log("\n(using model:", process.env.GROQ_MODEL || "meta-llama/llama-4-scout-17b-16e-instruct", ")\n");

const product = await extractProduct(images);
console.log(JSON.stringify(product, null, 2));
