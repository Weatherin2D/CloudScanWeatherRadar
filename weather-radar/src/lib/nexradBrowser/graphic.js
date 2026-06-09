import { parser } from "./packets.js";
import parseGraphic22 from "./graphic22.js";

export default function parseGraphic(raf) {
  const blockDivider = raf.readShort();
  if (blockDivider === 22) {
    raf.skip(-2);
    return parseGraphic22(raf);
  }

  const blockId = raf.readShort();
  const blockLength = raf.readInt();

  if (blockDivider !== -1) {
    throw new Error(`Invalid graphic block divider: ${blockDivider}`);
  }
  if (blockId !== 2) throw new Error(`Invalid graphic id: ${blockId}`);
  if (blockLength < 1 || blockLength > 65535) {
    throw new Error(`Invalid block length ${blockLength}`);
  }
  if (blockLength + raf.getPos() - 8 > raf.getLength()) {
    throw new Error(`Block length ${blockLength} overruns file length for block id: ${blockId}`);
  }

  const numberPages = raf.readShort();
  const packets = [];

  if (numberPages < 1 || numberPages > 48 - 1) {
    throw new Error(`Invalid graphic number of pages: ${numberPages}`);
  }

  for (let pageNum = 0; pageNum < numberPages; pageNum += 1) {
    const pageNumber = raf.readShort();
    const pageLength = raf.readShort();
    const endByte = raf.getPos() + pageLength;
    if (pageNum + 1 !== pageNumber) {
      throw new Error(`Invalid page number: ${pageNumber}`);
    }
    while (raf.getPos() < endByte) {
      packets.push(parser(raf));
    }
  }

  return packets;
}
