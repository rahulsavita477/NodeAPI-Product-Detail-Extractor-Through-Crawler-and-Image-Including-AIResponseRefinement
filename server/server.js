import "dotenv/config";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import cors from "cors";
import multer from "multer";
import { extractProduct } from "../src/index.js";
import { crawlFlipkart } from "../src/crawlers/flipkart.js";
import { crawlAmazon } from "../src/crawlers/amazon.js";
import { refineJSONUsingAI } from "../src/aiRefine.js";
import { checkDuplicate, imageKey } from "../src/dedupe.js";

const app = express();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024, files: 10 },
});

app.use(cors());
app.use(express.json());

// crawler endpoints refine only when explicitly asked (?refine=true)
function wantsRefine(req) {
    const v = String(req.query.refine ?? req.body?.refine ?? "false");
    return v === "true" || v === "1";
}

// Health check: confirms server is up and whether GROQ_API_KEY is set
app.get("/api/health", (_req, res) => {
    res.json({ ok: true, hasKey: Boolean(process.env.GROQ_API_KEY) });
});

// POST /api/extract  — multipart/form-data with one or more "images" files.
app.post("/api/extract", upload.array("images", 10), async (req, res) => {
    const files = req.files || [];
    if (files.length === 0) {
        return res.status(400).json({ error: "Upload at least one image (field name 'images')." });
    }
    if (!process.env.GROQ_API_KEY) {
        return res.status(500).json({ error: "Server is missing GROQ_API_KEY." });
    }

    let dir;
    try {
        dir = await mkdtemp(path.join(tmpdir(), "pe-"));
        const paths = await Promise.all(
            files.map(async (f, i) => {
                const safe = `${i}-${(f.originalname || "image").replace(/[^\w.\-]/g, "_")}`;
                const p = path.join(dir, safe);
                await writeFile(p, f.buffer);
                return p;
            })
        );

        // Dedupe on the image bytes (stable), not the AI output (varies per call).
        const dup = checkDuplicate(imageKey(files.map((f) => f.buffer)));

        // Single Groq vision call returns the product already in the target format.
        const product = await extractProduct(paths, {
            model: req.body?.model || undefined,
        });

        product.isDuplicate = dup;
        res.json(product);

    } catch (err) {

        console.error(err);
        res.status(500).json({ error: err.message || "Extraction failed" });
        
    } finally {
        if (dir) await rm(dir, { recursive: true, force: true }).catch(() => { });
    }
});

// POST /api/flipkart  — JSON body { url }   (add ?refine=true for the unified format)
app.post("/api/flipkart", async (req, res) => {
    
    const url = req.body.url;
    const category = req.body.category;
    const brand = req.body.brand;
    const attributes = req.body.attributes;

    try {
        
        // Dedupe on the URL (stable), not the AI/crawler output (varies per call).
        const dup = checkDuplicate(url);
        let product = await crawlFlipkart(url);
        product.category = category;
        product.brand = brand;
        product.attributes = attributes;

        if (wantsRefine(req)) product = await refineJSONUsingAI(product);
        
        product.isDuplicate = dup;
        
        res.json(product);

    } catch (err) {
        
        console.error(err);
        res.status(500).json({ error: err.message || "Flipkart crawl failed" });
    }
});

app.post("/api/amazon", async (req, res) => {
    const url = req.body?.url;
    try {
        const dup = checkDuplicate(url);
        let product = await crawlAmazon(url);
        if (wantsRefine(req)) product = await refineJSONUsingAI(product);
        product.isDuplicate = dup;
        res.json(product);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message || "Amazon crawl failed" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    if (!process.env.GROQ_API_KEY) {
        console.warn("WARNING: GROQ_API_KEY is not set — /api/extract will fail.");
    }
});