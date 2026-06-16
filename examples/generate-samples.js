// One-off helper that generates a set of realistic sample images so you can
// test the extractor without owning any product photos.
//
//   node examples/generate-samples.js
//
// Requires bwip-js (only needed to *generate* the samples):
//   npm install --no-save bwip-js
//
// The generated PNGs are written to examples/images/ and are committed to the
// repo, so you normally do NOT need to run this yourself.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import bwipjs from "bwip-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "images");

async function svgToPng(svg, file) {
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, file));
  console.log("wrote", file);
}

// 1) Product photo: a pair of over-ear headphones (simple vector art + labels).
const productSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect width="800" height="600" fill="#f4f5f7"/>
  <text x="40" y="60" font-family="Arial" font-size="34" font-weight="bold" fill="#111">AuraSound</text>
  <text x="40" y="100" font-family="Arial" font-size="24" fill="#444">Model: AS-700 Wireless Over-Ear Headphones</text>
  <!-- headphones -->
  <path d="M250 470 C250 250 550 250 550 470" stroke="#222" stroke-width="22" fill="none"/>
  <rect x="210" y="430" width="70" height="120" rx="28" fill="#222"/>
  <rect x="520" y="430" width="70" height="120" rx="28" fill="#222"/>
  <ellipse cx="245" cy="490" rx="40" ry="55" fill="#3a3a3a"/>
  <ellipse cx="555" cy="490" rx="40" ry="55" fill="#3a3a3a"/>
  <text x="40" y="560" font-family="Arial" font-size="20" fill="#666">Active Noise Cancelling • 40h Battery • Bluetooth 5.3</text>
</svg>`;

// 2) Box / spec sheet.
const specSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">
  <rect width="800" height="600" fill="#ffffff"/>
  <rect x="0" y="0" width="800" height="70" fill="#0b5fff"/>
  <text x="30" y="46" font-family="Arial" font-size="30" font-weight="bold" fill="#fff">AuraSound AS-700 — Specifications</text>
  <text x="30" y="130" font-family="Arial" font-size="22" fill="#111">Driver size: 40mm dynamic</text>
  <text x="30" y="170" font-family="Arial" font-size="22" fill="#111">Battery life: 40 hours (ANC on)</text>
  <text x="30" y="210" font-family="Arial" font-size="22" fill="#111">Bluetooth: 5.3, multipoint</text>
  <text x="30" y="250" font-family="Arial" font-size="22" fill="#111">Charging: USB-C, 10 min = 5h</text>
  <text x="30" y="290" font-family="Arial" font-size="22" fill="#111">Weight: 255 g</text>
  <text x="30" y="350" font-family="Arial" font-size="24" font-weight="bold" fill="#111">In the box:</text>
  <text x="30" y="390" font-family="Arial" font-size="22" fill="#111">• Headphones  • USB-C cable  • 3.5mm audio cable</text>
  <text x="30" y="425" font-family="Arial" font-size="22" fill="#111">• Hard carry case  • Quick start guide</text>
</svg>`;

// 3) Invoice / receipt with a price.
const invoiceSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="700" height="800">
  <rect width="700" height="800" fill="#ffffff"/>
  <text x="40" y="60" font-family="Courier" font-size="30" font-weight="bold" fill="#000">SoundMart Pvt Ltd</text>
  <text x="40" y="95" font-family="Courier" font-size="18" fill="#000">TAX INVOICE  #INV-2024-00871</text>
  <line x1="40" y1="120" x2="660" y2="120" stroke="#000" stroke-width="2"/>
  <text x="40" y="170" font-family="Courier" font-size="20" fill="#000">Item            Qty     Price</text>
  <text x="40" y="210" font-family="Courier" font-size="20" fill="#000">AuraSound AS-700  1   Rs 7,499.00</text>
  <text x="40" y="250" font-family="Courier" font-size="20" fill="#000">GST (18%)             Rs 1,349.82</text>
  <line x1="40" y1="280" x2="660" y2="280" stroke="#000" stroke-width="2"/>
  <text x="40" y="325" font-family="Courier" font-size="24" font-weight="bold" fill="#000">TOTAL          Rs 8,848.82</text>
  <text x="40" y="380" font-family="Courier" font-size="18" fill="#000">Paid via UPI • Thank you!</text>
</svg>`;

async function main() {
  await mkdir(outDir, { recursive: true });
  await svgToPng(productSvg, "product.png");
  await svgToPng(specSvg, "spec-sheet.png");
  await svgToPng(invoiceSvg, "invoice.png");

  // 4) Real, scannable EAN-13 barcode.
  const png = await bwipjs.toBuffer({
    bcid: "ean13",
    text: "8901234567890",
    scale: 3,
    height: 18,
    includetext: true,
    textxalign: "center",
  });
  // pad it onto a white label so zbar has a quiet zone
  await sharp({
    create: { width: 600, height: 320, channels: 3, background: "#fff" },
  })
    .composite([{ input: png, gravity: "center" }])
    .png()
    .toFile(path.join(outDir, "barcode.png"));
  console.log("wrote barcode.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
