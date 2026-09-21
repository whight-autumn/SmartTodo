const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const pngToIcoModule = require("png-to-ico");
const pngToIco = pngToIcoModule.default || pngToIcoModule;

async function main() {
  const root = path.resolve(__dirname, "..");
  const master = path.join(root, "assets", "brand", "icon-master.svg");
  const tray = path.join(root, "assets", "brand", "tray-mark.svg");
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const temp = path.join(root, ".impeccable", "build", "brand");
  await fs.mkdir(temp, { recursive: true });
  await sharp(master).resize(1024, 1024).png().toFile(path.join(root, "assets", "icon.png"));
  const icoInputs = [];
  for (const size of sizes) {
    const target = path.join(temp, `icon-${size}.png`);
    await sharp(master).resize(size, size).png().toFile(target);
    icoInputs.push(target);
  }
  await fs.writeFile(path.join(root, "assets", "icon.ico"), await pngToIco(icoInputs));
  await sharp(tray).resize(32, 32).png().toFile(path.join(root, "assets", "tray-icon.png"));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
