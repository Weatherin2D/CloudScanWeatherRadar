import { parser } from "./packets.js";

export default function parseRadialPackets(raf, productDescription, layerCount, options) {
  const layers = [];
  for (let layerIndex = 0; layerIndex < layerCount; layerIndex += 1) {
    const startPos = raf.getPos();
    const layerDivider = raf.readShort();
    const layerLength = raf.readInt();
    if (layerDivider !== -1) {
      throw new Error(`Invalid layer divider ${layerDivider} in layer ${layerIndex}`);
    }
    if (layerLength + raf.getPos() > raf.getLength()) {
      throw new Error(`Layer size overruns block size for layer ${layerIndex}`);
    }

    try {
      const packets = [];
      while (raf.getPos() < startPos + layerLength) {
        packets.push(parser(raf, productDescription));
      }
      layers.push(packets.length === 1 ? packets[0] : packets);
    } catch (e) {
      options.logger.warn(e.stack);
      raf.seek(startPos + layerLength);
      layers.push(undefined);
    }
  }
  return layers;
}
