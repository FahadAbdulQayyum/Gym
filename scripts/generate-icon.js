const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const pngToIco = require('png-to-ico');

const root = path.join(__dirname, '..');
const source = path.join(root, 'assets', 'icon.png');
const output = path.join(root, 'assets', 'icon.ico');
const sizes = [16, 32, 48, 256];

async function generateIcon() {
  const pngBuffers = await Promise.all(
    sizes.map((size) =>
      sharp(source)
        .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toBuffer()
    )
  );

  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(output, ico);
  console.log(`Created ${output} (${sizes.join(', ')}px)`);
}

generateIcon().catch((error) => {
  console.error(error);
  process.exit(1);
});
