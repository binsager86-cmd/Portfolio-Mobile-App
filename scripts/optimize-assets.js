const sharp = require("sharp");
const glob = require("glob");

async function optimize() {
  const images = glob.sync("assets/**/*.{png,jpg,jpeg}");
  for (const img of images) {
    const out = img.replace(/\.(png|jpg|jpeg)$/i, ".webp");
    await sharp(img)
      .webp({ quality: 85, effort: 6 })
      .toFile(out);
    console.log(`optimized: ${img} -> ${out}`);
  }
}

optimize().catch(console.error);
