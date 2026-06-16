import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { scanImageData } from "@undecaf/zbar-wasm";

/**
 * Decode any barcodes / QR codes present in an image file.
 *
 * Uses sharp to turn the image into raw RGBA pixels and zbar-wasm (a pure-wasm
 * port of the ZBar library) to scan them. Works fully offline, no native build
 * step required.
 *
 * @param {string} imagePath path to a local image file
 * @returns {Promise<Array<{ type: string, value: string }>>}
 */
export async function decodeBarcodes(imagePath) {
  const buffer = await readFile(imagePath);
  return decodeBarcodesFromBuffer(buffer);
}

/**
 * Same as decodeBarcodes but takes an in-memory image buffer.
 * @param {Buffer} buffer
 */
export async function decodeBarcodesFromBuffer(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const imageData = {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height,
  };

  const symbols = await scanImageData(imageData);
  return symbols.map((s) => ({
    type: s.typeName,
    value: s.decode(),
  }));
}

/**
 * Convenience helper: return just the first decoded barcode value, or null.
 * @param {string} imagePath
 */
export async function readFirstBarcode(imagePath) {
  try {
    const codes = await decodeBarcodes(imagePath);
    return codes.length ? codes[0].value : null;
  } catch {
    return null;
  }
}
