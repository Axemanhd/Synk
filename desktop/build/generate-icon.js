const fs = require('fs');
const path = require('path');

const pngPath = 'C:\\Users\\Zhard\\Desktop\\whatever\\New Icon.png';
const icoPath = path.join(__dirname, 'icon.ico');

const pngData = fs.readFileSync(pngPath);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(0, 0);  entry.writeUInt8(0, 1);  entry.writeUInt8(0, 2);  entry.writeUInt8(0, 3);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(pngData.length, 8);
entry.writeUInt32LE(22, 12);

const ico = Buffer.concat([header, entry, pngData]);
fs.writeFileSync(icoPath, ico);
console.log('ICO generated from New Icon.png');
