#!/usr/bin/env node
import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { extractProduct } from "./extract.js";

function parseArgs(argv) {
  const args = { images: [], out: null, model: null, noBarcode: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out" || a === "-o") args.out = argv[++i];
    else if (a === "--model" || a === "-m") args.model = argv[++i];
    else if (a === "--no-barcode") args.noBarcode = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else args.images.push(a);
  }
  return args;
}

const HELP = `
product-extractor — extract product details (JSON) from images using Groq vision

Usage:
  node src/cli.js <image1> [image2 ...] [options]

Options:
  -o, --out <file>     Write the JSON result to a file instead of stdout
  -m, --model <id>     Groq model id (default: meta-llama/llama-4-scout-17b-16e-instruct)
      --no-barcode     Skip the offline barcode decoder
  -h, --help           Show this help

Environment:
  GROQ_API_KEY         Required. Your Groq API key.
  GROQ_MODEL           Optional. Overrides the default model.

Examples:
  node src/cli.js examples/images/product.jpg examples/images/invoice.jpg
  node src/cli.js ./photos/*.jpg --out result.json
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.images.length === 0) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }

  const product = await extractProduct(args.images, {
    model: args.model || undefined,
    scanBarcodes: !args.noBarcode,
  });

  const json = JSON.stringify(product, null, 2);
  if (args.out) {
    await writeFile(args.out, json);
    process.stderr.write(`Wrote ${args.out}\n`);
  } else {
    process.stdout.write(json + "\n");
  }
}

main().catch((err) => {
  process.stderr.write(`Error: ${err.message}\n`);
  process.exit(1);
});
