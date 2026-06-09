/**
 * Browser entry for nexrad-level-3-data (avoids fs/__dirname in products & packets index).
 */
import { Buffer } from "buffer";
import bzip from "seek-bzip";
import { RandomAccessFile } from "nexrad-level-3-data/src/randomaccessfile/index.js";
import * as textHeaderMod from "nexrad-level-3-data/src/headers/text.js";
import * as messageHeaderMod from "nexrad-level-3-data/src/headers/message.js";
import * as productDescriptionMod from "nexrad-level-3-data/src/headers/productdescription.js";
import * as symbologyHeaderMod from "nexrad-level-3-data/src/headers/symbology.js";
import * as tabularHeaderMod from "nexrad-level-3-data/src/headers/tabular.js";
import { cjs } from "./interop.js";

const textHeader = cjs(textHeaderMod);
const messageHeader = cjs(messageHeaderMod);
const parseProductDescription = productDescriptionMod.parse ?? cjs(productDescriptionMod);
const symbologyHeader = cjs(symbologyHeaderMod);
const tabularHeader = cjs(tabularHeaderMod);
import graphicHeader from "./graphic.js";
import radialPackets from "./radialpackets.js";
import { products, productAbbreviations } from "./products.js";

const nullLogger = {
  log: () => {},
  error: () => {},
  warn: () => {},
};

function combineOptions(newOptions) {
  let logger = newOptions?.logger ?? console;
  if (logger === false) logger = nullLogger;
  return { ...newOptions, logger };
}

function nexradLevel3Data(file, _options) {
  const options = combineOptions(_options);
  const raf = new RandomAccessFile(file);
  const result = {};

  result.textHeader = textHeader(raf);
  const textHeaderLength = raf.getPos();

  if (!result.textHeader.fileType.startsWith("SDUS")) {
    throw new Error(`Incorrect file type header: ${result.textHeader.fileType}`);
  }
  if (!productAbbreviations.includes(result.textHeader.type)) {
    throw new Error(`Unsupported product type: ${result.textHeader.type}`);
  }

  result.messageHeader = messageHeader(raf);
  const product = products[result.messageHeader.code.toString()];
  if (!product) {
    throw new Error(`Unsupported product code: ${result.messageHeader.code}`);
  }

  result.productDescription = parseProductDescription(raf, product);

  let decompressed;
  if (result.productDescription.compressionMethod > 0) {
    const rafPos = raf.getPos();
    const compressed = raf.read(raf.getLength() - raf.getPos());
    const data = bzip.decode(compressed);
    raf.seek(0);
    decompressed = new RandomAccessFile(
      Buffer.concat([raf.read(rafPos), data]),
    );
    decompressed.seek(rafPos);
  } else {
    decompressed = raf;
  }

  try {
    if (result.productDescription.offsetSymbology !== 0) {
      const offsetSymbologyBytes =
        textHeaderLength + result.productDescription.offsetSymbology * 2;
      if (offsetSymbologyBytes > decompressed.getLength()) {
        throw new Error(
          `Invalid symbology offset: ${result.productDescription.offsetSymbology}`,
        );
      }
      decompressed.seek(offsetSymbologyBytes);
      result.symbology = symbologyHeader(decompressed);
      result.radialPackets = radialPackets(
        decompressed,
        result.productDescription,
        result.symbology.numberLayers,
        options,
      );
    }
  } catch (e) {
    options.logger.warn(e.stack);
    options.logger.warn("Unable to parse symbology data");
  }

  try {
    if (result.productDescription.offsetGraphic !== 0) {
      const offsetGraphicBytes =
        textHeaderLength + result.productDescription.offsetGraphic * 2;
      if (offsetGraphicBytes > decompressed.getLength()) {
        throw new Error(
          `Invalid graphic offset: ${result.productDescription.offsetGraphic}`,
        );
      }
      decompressed.seek(offsetGraphicBytes);
      result.graphic = graphicHeader(decompressed);
    }
  } catch (e) {
    options.logger.warn(e.stack);
    options.logger.warn("Unable to parse graphic data");
  }

  try {
    if (result.productDescription.offsetTabular !== 0) {
      const offsetTabularBytes =
        textHeaderLength + result.productDescription.offsetTabular * 2;
      if (offsetTabularBytes > decompressed.getLength()) {
        throw new Error(
          `Invalid tabular offset: ${result.productDescription.offsetTabular}`,
        );
      }
      decompressed.seek(offsetTabularBytes);
      result.tabular = tabularHeader(decompressed, product);
    }
  } catch (e) {
    options.logger.warn(e.stack);
    options.logger.warn("Unable to parse tabular data");
  }

  try {
    const formatted = product?.formatter?.(result);
    if (formatted) result.formatted = formatted;
  } catch (e) {
    options.logger.warn(e.stack);
    options.logger.warn("Unable to parse formatted tabular data");
  }

  return result;
}

export default nexradLevel3Data;
