// scraper-fixed.js
// Usage: node scraper-fixed.js
const puppeteer = require("puppeteer");
const axios = require("axios");
const ExcelJS = require("exceljs");

const START_URL = "https://elghazawy.com/ar/sub-category/mountain-bike"; // غيّرها لو عايز صفحة بداية تانية
const MIN_KB = 60; // الحد الأدنى بالـ KB

async function getImageSize(imgUrl) {
  try {
    // try HEAD first
    const head = await axios.head(imgUrl, {
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });
    const cl = head.headers["content-length"];
    if (cl) return parseInt(cl, 10) / 1024;

    // fallback 1: range request to read Content-Range header
    const rangeRes = await axios.get(imgUrl, {
      headers: { Range: "bytes=0-0" },
      timeout: 10000,
      validateStatus: (s) => s < 500,
      responseType: "stream",
    });
    const contentRange = rangeRes.headers["content-range"]; // "bytes 0-0/12345"
    if (contentRange) {
      const total = parseInt(contentRange.split("/")[1], 10);
      if (!isNaN(total)) return total / 1024;
    }

    // fallback 2: small GET (last resort)
    const full = await axios.get(imgUrl, {
      responseType: "arraybuffer",
      timeout: 20000,
      validateStatus: (s) => s < 500,
    });
    return full.data.length / 1024;
  } catch (err) {
    console.warn("getImageSize failed for", imgUrl, err.message);
    return 0;
  }
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();

  console.log("Opening", START_URL);
  await page.goto(START_URL, { waitUntil: "networkidle2" });

  // اجمع روابط المنتجات (absolute hrefs)
  let productLinks = await page.$$eval("a[href]", (els) =>
    els.map((a) => a.href).filter((h) => h.includes("/product/"))
  );
  productLinks = Array.from(new Set(productLinks)); // إزالة تكرار الروابط نفسها
  console.log("Found product links:", productLinks.length);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Products");
  sheet.columns = [
    { header: "Product Link", key: "link", width: 60 },
    { header: "Large Image URLs", key: "images", width: 80 },
    { header: "Image Sizes (KB)", key: "sizes", width: 30 },
    { header: "Total Size (KB)", key: "total", width: 18 },
    { header: "Count >60KB", key: "count", width: 12 },
  ];

  for (let i = 0; i < productLinks.length; i++) {
    const link = productLinks[i];
    console.log(`[${i + 1}/${productLinks.length}] ${link}`);

    try {
      await page.goto(link, { waitUntil: "networkidle2" });

      // ننتظر عنصر السلايدر أو الصور لو اتولدوا بالـ JS
      try {
        await page.waitForSelector(".lSSlideOuter img", { timeout: 5000 });
      } catch (e) {
        // ممكن السلايدر يأخذ وقت أطول أو غير موجود — نكمل ونحاول جمع الصور لو موجودة
      }

      // اجمع src / data-src / data-original / ... من داخل .lSSlideOuter
      const raw = await page.$$eval(".lSSlideOuter img", (imgs) =>
        imgs.map(
          (img) =>
            img.getAttribute("src") ||
            img.getAttribute("data-src") ||
            img.getAttribute("data-original") ||
            img.getAttribute("data-lazy") ||
            img.src ||
            ""
        )
      );

      // حل الروابط إلى absolute وازالة التكرار
      const absSet = new Set();
      for (const r of raw) {
        if (!r) continue;
        try {
          const abs = new URL(r, page.url()).href;
          absSet.add(abs);
        } catch (e) {
          // تجاهل روابط غير صالحة
        }
      }
      const images = Array.from(absSet);
      if (images.length === 0) {
        console.log("   no images found inside .lSSlideOuter");
        continue;
      }

      // احسب الأحجام وفلتر > MIN_KB
      const largeImgs = [];
      let totalLarge = 0;
      for (const img of images) {
        const sz = await getImageSize(img); // KB
        console.log("    ", img, sz.toFixed(2), "KB");
        if (sz > MIN_KB) {
          largeImgs.push({ url: img, size: sz });
          totalLarge += sz;
        }
      }

      if (largeImgs.length === 0) {
        console.log(`   no images > ${MIN_KB}KB`);
        continue;
      }

      // صف واحد لكل منتج: روابط (newline) + أحجام (comma) + مجموع
      const urlsCell = largeImgs.map((x) => x.url).join("\n");
      const sizesCell = largeImgs.map((x) => x.size.toFixed(2)).join(", ");
      sheet.addRow({
        link,
        images: urlsCell,
        sizes: sizesCell,
        total: totalLarge.toFixed(2),
        count: largeImgs.length,
      });

      console.log(
        `   saved ${largeImgs.length} images, total ${totalLarge.toFixed(2)} KB`
      );
    } catch (err) {
      console.warn("   failed product", link, err.message);
    }
  }

  const outName = "products_images_fixed.xlsx";
  await workbook.xlsx.writeFile(outName);
  console.log("Saved ->", outName);

  await browser.close();
})();
