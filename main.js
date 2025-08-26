#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");
const axios = require("axios");
const chalk = require("chalk");

const appState = {
  success: 0,
  failed: 0,
};

// 🌀 Auto scroll to load lazy images
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 400;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 300);
    });
  });
}

async function extractImages(page) {
  // ✅ Changed parameter to accept page instance
  // 1. Collect from <img> tags (src, srcset, data-src, data-original)
  const imgUrls = await page.evaluate(() => {
    const urls = new Set();

    document.querySelectorAll("img").forEach((img) => {
      if (img.src) urls.add(img.src);
      if (img.srcset) {
        img.srcset.split(",").forEach((src) => {
          urls.add(src.trim().split(" ")[0]);
        });
      }
      if (img.getAttribute("data-src")) urls.add(img.getAttribute("data-src"));
      if (img.getAttribute("data-original"))
        urls.add(img.getAttribute("data-original"));
    });

    return Array.from(urls);
  });

  // 2. Collect from meta tags
  const metaImgs = await page.evaluate(() => {
    const urls = [];
    document
      .querySelectorAll("meta[property='og:image'], meta[name='twitter:image']")
      .forEach((meta) => {
        if (meta.content) urls.push(meta.content);
      });
    return urls;
  });

  // Merge and filter unique
  const allImages = Array.from(new Set([...imgUrls, ...metaImgs]));

  console.log(`✅ Found ${allImages.length} images`);
  return allImages;
}

// 🖼 Download single file
async function downloadFile(url, filepath) {
  try {
    if (fs.existsSync(filepath)) {
      console.log(
        chalk.yellow(`⚠️ Already exists: ${path.basename(filepath)}`)
      );
      return;
    }

    const response = await axios.get(url, { responseType: "arraybuffer" });
    fs.writeFileSync(filepath, response.data);
    appState.success++;
    console.log(chalk.green(`✅ Downloaded: ${path.basename(filepath)}`));
  } catch (err) {
    appState.failed++;
    console.log(chalk.red(`❌ Failed: ${url} (${err.message})`));
  }
}

// 🖼 Download all images from a page
async function downloadImages(pageUrl, isMobile, folder = "images") {
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder);
  }

  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  // Set user agent and viewport based on device type
  if (isMobile) {
    await page.setUserAgent(
      "Mozilla/5.0 (Linux; Android 10; SM-G973F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Mobile Safari/537.36"
    );
    await page.setViewport({ width: 375, height: 667 }); // Mobile viewport
  } else {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/116.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
  }

  console.log(chalk.blue("🌍 Loading page..."));
  await page.goto(pageUrl, { waitUntil: "networkidle2", timeout: 0 });

  console.log(chalk.blue("📜 Scrolling to load lazy images..."));
  await autoScroll(page);
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // ✅ Use the current page instance instead of creating a new one
  const imgUrls = await extractImages(page);
  console.log(chalk.magenta(`🔍 Found ${imgUrls.length} images`));

  // ⏩ Download concurrently
  const downloads = imgUrls.map(async (imgUrl, i) => {
    try {
      const cleanPath = new URL(imgUrl).pathname.split("/").pop();
      const ext = path.extname(cleanPath) || ".jpg";
      const fileName = `image_${i + 1}${ext}`;
      const filePath = path.join(folder, fileName);

      await downloadFile(imgUrl, filePath);
    } catch (err) {
      console.log(chalk.red(`❌ Error: ${imgUrl}`));
    }
  });

  await Promise.all(downloads);

  console.log(
    chalk.greenBright(
      `\n🎉 Done! ${appState.success} Images saved to "${folder}"\nand ${appState.failed} Has Failed`
    )
  );
  await browser.close();
}

// CLI usage
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: node main.js <url> [folder] [--mobile]");
  process.exit(1);
}

const url = args[0];
const folder = args[1] || "images";
const isMobile = args.includes("--mobile");

console.log(
  chalk.cyan(
    `🚀 Start Extracting Images From ${url} [${
      isMobile ? "Mobile" : "Desktop"
    }] Version`
  )
);

downloadImages(url, isMobile, folder);
