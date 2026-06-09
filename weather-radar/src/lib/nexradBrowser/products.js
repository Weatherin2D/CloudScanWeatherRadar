/**
 * Browser-safe replacement for nexrad-level-3-data/src/products/index.js
 * (the upstream module uses fs.readdirSync(__dirname), which fails in the browser).
 */
import { RandomAccessFile } from "nexrad-level-3-data/src/randomaccessfile/index.js";
import p56 from "nexrad-level-3-data/src/products/56/index.js";
import p58 from "nexrad-level-3-data/src/products/58/index.js";
import p59 from "nexrad-level-3-data/src/products/59/index.js";
import p61 from "nexrad-level-3-data/src/products/61/index.js";
import p62 from "nexrad-level-3-data/src/products/62/index.js";
import p78 from "nexrad-level-3-data/src/products/78/index.js";
import p80 from "nexrad-level-3-data/src/products/80/index.js";
import p94 from "nexrad-level-3-data/src/products/94/index.js";
import p141 from "nexrad-level-3-data/src/products/141/index.js";
import p165 from "nexrad-level-3-data/src/products/165/index.js";
import p170 from "nexrad-level-3-data/src/products/170/index.js";
import p172 from "nexrad-level-3-data/src/products/172/index.js";
import p177 from "nexrad-level-3-data/src/products/177/index.js";
import { cjs } from "./interop.js";

function deltaTime(value) {
  return {
    deltaTime: (value & 0xffe0) >> 5,
    nonSupplementalScan: (value & 0x001f) === 0,
    sailsScan: (value & 0x001f) === 1,
    mrleScan: (value & 0x001f) === 2,
  };
}

/** ICD layout: HW30 elev + 32-byte threshold (scale/offset floats) + HW47–53 tail. */
function digitalHalfwords30_53(data) {
  const raf = new RandomAccessFile(data);
  const elevationAngle = raf.readShort() / 10;
  const threshold = raf.read(32);
  const scale = threshold.readFloatBE(0);
  const offset = threshold.readFloatBE(4);
  const maxReflectivity = raf.readShort();
  const dependent48_49 = raf.read(4);
  const deltaShort = raf.readShort();
  const compressionMethod = raf.readShort();
  const uncompressedProductSize = (raf.readUShort() << 16) + raf.readUShort();
  return {
    elevationAngle,
    plot: {
      scale,
      offset,
      maxDataValue: 255,
      leadingFlags: { noData: 0 },
    },
    maxReflectivity,
    dependent48_49,
    ...deltaTime(deltaShort),
    compressionMethod,
    uncompressedProductSize,
  };
}

const digitalProductDescription = { halfwords30_53: digitalHalfwords30_53 };

function digitalProduct(code, abbreviation, description) {
  return { code, abbreviation, description, productDescription: digitalProductDescription };
}

const productsRaw = [
  cjs(p56),
  cjs(p58),
  cjs(p59),
  cjs(p61),
  cjs(p62),
  cjs(p78),
  cjs(p80),
  cjs(p94),
  cjs(p141),
  cjs(p165),
  cjs(p170),
  cjs(p172),
  cjs(p177),
  digitalProduct(
    161,
    ["NXC", "NYC", "NZC", "N0C", "NAC", "N1C", "NBC", "N2C", "N3C"],
    "Correlation Coefficient",
  ),
  digitalProduct(
    159,
    ["NXD", "NYD", "NZD", "N0X", "NAD", "N1X", "NBD", "N2X", "N3X"],
    "Differential Reflectivity",
  ),
  digitalProduct(
    163,
    ["NXK", "NYK", "NZK", "N0K", "NAK", "N1K", "NBK", "N2K", "N3K"],
    "Specific Differential Phase",
  ),
];

const products = {};
for (const product of productsRaw) {
  if (products[product.code]) {
    throw new Error(`Duplicate product code ${product.code}`);
  }
  products[product.code] = product;
}

const productAbbreviations = productsRaw.flatMap((product) => product.abbreviation);

export { products, productAbbreviations };
export default { products, productAbbreviations };
