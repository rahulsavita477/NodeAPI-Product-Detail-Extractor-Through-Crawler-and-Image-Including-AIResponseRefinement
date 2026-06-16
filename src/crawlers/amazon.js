import { launch } from 'puppeteer';
import { addWarnings } from "./warnings.js";

export async function scrapeProduct(url) {
    const launchOptions = {
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    };
    // Use an already-installed Chrome if provided, so Puppeteer's bundled-Chrome
    // download is not required (set PUPPETEER_EXECUTABLE_PATH to chrome.exe).
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }
    const browser = await launch(launchOptions);
    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
    );

    try {
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const productData = await page.evaluate(() => {
            const title = document.querySelector('#productTitle')?.innerText.trim() ||
                document.querySelector('span.B_NuCI')?.innerText.trim();

            const price = document.querySelector('.a-price-whole')?.innerText.trim() ||
                document.querySelector('._30jeq3')?.innerText.trim();

            // ✅ Description from feature bullets
            const description = Array.from(document.querySelectorAll('#feature-bullets li'))
                .map(li => li.innerText.trim())
                .filter(Boolean)
                .join(" ") || "";

            // ✅ InTheBox (Amazon mein "Included Components" hota hai)
            let inTheBox = "";
            const includedRow = Array.from(document.querySelectorAll('#detailBullets_feature_div li'))
                .find(li => /Included Components/i.test(li.innerText));
            if (includedRow) {
                inTheBox = includedRow.innerText.replace(/Included Components[:\s]*/i, "").trim();
            }

            // ✅ Brand
            let brand = document.querySelector('#bylineInfo')?.innerText.trim() || "";
            brand = brand.replace(/^Brand:\s*/i, "").trim();


            // ✅ Category (Amazon breadcrumb)
            const category = Array.from(document.querySelectorAll('#wayfinding-breadcrumbs_container li a'))
                .map(a => a.innerText.trim())
                .filter(Boolean)
                .join(" > ") || "";

            // ✅ Features (short bullet points)
            const features = Array.from(document.querySelectorAll('#feature-bullets li'))
                .map(li => li.innerText.trim())
                .filter(Boolean);

            // ✅ Specs
            const specsArray = [];
            const specElements = document.querySelectorAll('#productDetails_feature_div table tr, ._14cfVK table tr');
            specElements.forEach(row => {
                const key = row.querySelector('th, ._1hLviU')?.innerText.trim();
                const val = row.querySelector('td, ._2xl877')?.innerText.trim();
                if (key && val) {
                    specsArray.push({ attribute: key, value: val });
                }
            });

            // ✅ Images & Videos
            const images = [];
            const videos = [];
            document.querySelectorAll('#altImages img, .imgTagWrapper img').forEach(img => {
                let src = img.dataset.oldHires || img.getAttribute('src');
                if (src?.startsWith('http')) {
                    if (src.includes('play-icon-overlay')) {
                        let thumb = src.replace(/._SX\d+_|._SY\d+_|._SS\d+_|._US\d+_|._SL\d+_/g, '');
                        if (!thumb.includes('_SL1500_')) thumb = thumb.replace('.jpg', '._SL1500_.jpg');
                        videos.push({ thumbnailUrl: thumb, videoUrl: null });
                    } else {
                        let thumb = src;
                        let large = src.replace(/._SX\d+_|._SY\d+_|._SS\d+_|._US\d+_|._SL\d+_/g, '');
                        if (!large.includes('_SL1500_')) large = large.replace('.jpg', '._SL1500_.jpg');
                        images.push({ thumbnailUrl: thumb, largeUrl: large });
                    }
                }
            });

            // ✅ Video URL from scripts
            const scripts = Array.from(document.querySelectorAll('script')).map(s => s.textContent);
            let videoUrl = null;
            scripts.forEach(text => {
                if (text?.includes('videoUrl')) {
                    const match = new RegExp(/"videoUrl"\s*:\s*"([^"]+)"/).exec(text);
                    if (match) {
                        videoUrl = match[1];
                    }
                }
            });
            if (videoUrl && videos.length > 0) {
                videos[0].videoUrl = videoUrl;
            }

            // ✅ Meta fields (basic SEO-friendly defaults)
            const metaTitle = title ? `${title} | Buy Online on Amazon` : "";
            const metaDescription = description ? description.slice(0, 160) : "";
            const metaKeywords = title ? title.split(" ").filter(w => w.length > 3) : [];

            return { title, description, inTheBox, price, category, brand, features, specs: specsArray, images, videos, metaTitle, metaDescription, metaKeywords };
        });

        // ✅ Validation warnings
        return addWarnings(productData);

    } catch (error) {
        console.error('Error scraping the page:', error);
        return null;
    } finally {
        await browser.close();
    }
}

// Gateway adapter — keeps the server's crawlX(url) naming consistent.
export async function crawlAmazon(url) {
  if (!url || !/^https?:\/\//i.test(url)) {
    throw new Error("Provide a valid Amazon product URL");
  }
  const product = await scrapeProduct(url);
  if (!product) throw new Error("Amazon scrape failed (page blocked or layout changed)");
  return product;
}
