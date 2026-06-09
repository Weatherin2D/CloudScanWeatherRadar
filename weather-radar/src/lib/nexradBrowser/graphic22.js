import { parser } from "./packets.js";

export default function parseGraphic22(raf) {
  let result = { cells: {} };
  let divider = raf.readShort();
  while (divider !== -1 && raf.getPos() < raf.getLength()) {
    raf.skip(-2);
    const data = parser(raf);
    if (data.volumeTimes) result = { ...result, ...data };
    if (!data.volumeTimes) result.cells = { ...result.cells, ...data };
    if (raf.getPos() < raf.getLength()) divider = raf.readShort();
  }
  if (raf.getPos() < raf.getLength()) raf.skip(-2);
  return result;
}
