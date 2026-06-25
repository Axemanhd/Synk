const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const pngPath = 'C:\\Users\\Zhard\\Desktop\\whatever\\New Icon.png';

async function generate() {
  const buf = await pngToIco(pngPath);
  fs.writeFileSync(path.join(__dirname, 'icon.ico'), buf);
  console.log('ICO generated, size:', buf.length, 'bytes');
}

generate().catch(e => console.error(e.message));
