const fs = require("fs").promises;
const path = require("path");
const sharp = require("sharp");

class ImageCompressor {
  static MAX_SIZE = 80 * 1024; // 80 KB in bytes
  static MIN_QUALITY = 30; // don't go below this quality
  static DEFAULT_QUALITY = 80;
  static QUALITY_STEP = 5;

  constructor(inputFolder, outputFolder) {
    this.inputFolder = inputFolder;
    this.outputFolder = outputFolder;
    this.processedCount = 0;
    this.totalImages = 0;
  }

  async ensureOutputFolder() {
    try {
      await fs.access(this.outputFolder);
    } catch {
      await fs.mkdir(this.outputFolder, { recursive: true });
    }
  }

  updateProgress() {
    const percent = this.processedCount / this.totalImages;
    const barLength = 50;
    const filled = Math.round(percent * barLength);
    const bar = "█".repeat(filled) + "░".repeat(barLength - filled);

    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
    process.stdout.write(
      `[${bar}] ${(percent * 100).toFixed(1)}% (${this.processedCount}/${
        this.totalImages
      })`
    );
  }

  async compressToMaxSize(inputPath, outputPath) {
    let quality = ImageCompressor.DEFAULT_QUALITY;
    let buffer;

    try {
      while (quality >= ImageCompressor.MIN_QUALITY) {
        buffer = await sharp(inputPath)
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();

        if (buffer.length <= ImageCompressor.MAX_SIZE) {
          break;
        }

        quality -= ImageCompressor.QUALITY_STEP;
      }

      // Determine output format based on input
      const ext = path.extname(inputPath).toLowerCase();
      const outputOptions = this.getOutputOptions(ext, quality);

      await sharp(buffer)
        [outputOptions.format](outputOptions.options)
        .toFile(outputPath);

      return { success: true, quality, finalSize: buffer.length };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  getOutputOptions(extension, quality) {
    const baseOptions = {
      quality: Math.max(quality, ImageCompressor.MIN_QUALITY),
    };

    const formatMap = {
      ".jpg": { format: "jpeg", options: { ...baseOptions, mozjpeg: true } },
      ".jpeg": { format: "jpeg", options: { ...baseOptions, mozjpeg: true } },
      ".png": {
        format: "png",
        options: { ...baseOptions, compressionLevel: 9 },
      },
      ".webp": { format: "webp", options: { ...baseOptions, lossless: false } },
    };

    return formatMap[extension] || { format: "jpeg", options: baseOptions };
  }

  isImageFile(filename) {
    return /\.(jpe?g|png|webp)$/i.test(filename);
  }

  async getImageFiles() {
    const files = await fs.readdir(this.inputFolder);
    return files.filter((file) => this.isImageFile(file));
  }

  async compressImages() {
    try {
      await this.ensureOutputFolder();
      const imageFiles = await this.getImageFiles();
      this.totalImages = imageFiles.length;

      if (this.totalImages === 0) {
        console.log("❌ No image files found in the input folder");
        return;
      }

      console.log(`📂 Found ${this.totalImages} images to compress...\n`);

      const results = {
        successful: 0,
        failed: 0,
        details: [],
      };

      for (const file of imageFiles) {
        const inputPath = path.join(this.inputFolder, file);
        const outputPath = path.join(this.outputFolder, file);

        const result = await this.compressToMaxSize(inputPath, outputPath);

        if (result.success) {
          results.successful++;
          results.details.push({
            file,
            quality: result.quality,
            size: result.finalSize,
            status: "success",
          });
        } else {
          results.failed++;
          results.details.push({
            file,
            error: result.error,
            status: "failed",
          });
        }

        this.processedCount++;
        this.updateProgress();
      }

      console.log("\n\n✅ Compression completed!");
      console.log(`✓ Successful: ${results.successful}`);
      console.log(`✗ Failed: ${results.failed}`);

      return results;
    } catch (error) {
      console.error("\n\n❌ Error compressing images:", error.message);
      throw error;
    }
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: node main.js <input-folder> [output-folder]");
    console.log("Example: node main.js ./images ./compressed");
    process.exit(1);
  }

  const inputFolder = args[0] || "images";
  const outputFolder = args[1] || "compressed";

  try {
    const compressor = new ImageCompressor(inputFolder, outputFolder);
    await compressor.compressImages();
  } catch (error) {
    console.error("Fatal error:", error.message);
    process.exit(1);
  }
}

// Handle uncaught errors
process.on("unhandledRejection", (error) => {
  console.error("Unhandled rejection:", error);
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

if (require.main === module) {
  main();
}
