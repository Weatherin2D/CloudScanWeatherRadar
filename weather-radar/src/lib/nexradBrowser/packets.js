/**
 * Browser-safe replacement for nexrad-level-3-data/src/packets/index.js
 */
import pkt1 from "nexrad-level-3-data/src/packets/1.js";
import pkt2 from "nexrad-level-3-data/src/packets/2.js";
import pkt6 from "nexrad-level-3-data/src/packets/6.js";
import pkt8 from "nexrad-level-3-data/src/packets/8.js";
import pkt10 from "nexrad-level-3-data/src/packets/10.js";
import pkt13 from "nexrad-level-3-data/src/packets/13.js";
import pkt14 from "nexrad-level-3-data/src/packets/14.js";
import pkt15 from "nexrad-level-3-data/src/packets/15.js";
import pkt16 from "nexrad-level-3-data/src/packets/16.js";
import pkt17 from "nexrad-level-3-data/src/packets/17.js";
import pkt18 from "nexrad-level-3-data/src/packets/18.js";
import pkt19 from "nexrad-level-3-data/src/packets/19.js";
import pkt32 from "nexrad-level-3-data/src/packets/32.js";
import pktA from "nexrad-level-3-data/src/packets/a.js";
import pktAf1f from "nexrad-level-3-data/src/packets/af1f.js";
import pktC from "nexrad-level-3-data/src/packets/c.js";
import pktF from "nexrad-level-3-data/src/packets/f.js";
import { cjs } from "./interop.js";

const packetsRaw = [
  cjs(pkt1),
  cjs(pkt2),
  cjs(pkt6),
  cjs(pkt8),
  cjs(pkt10),
  cjs(pkt13),
  cjs(pkt14),
  cjs(pkt15),
  cjs(pkt16),
  cjs(pkt17),
  cjs(pkt18),
  cjs(pkt19),
  cjs(pkt32),
  cjs(pktA),
  cjs(pktAf1f),
  cjs(pktC),
  cjs(pktF),
];

const packets = {};
for (const packet of packetsRaw) {
  if (packets[packet.code]) {
    throw new Error(`Duplicate packet code ${packet.code}`);
  }
  packets[packet.code] = packet;
}

function parser(raf, productDescription) {
  const packetCode = raf.readUShort();
  raf.skip(-2);
  const packetCodeHex = packetCode.toString(16).padStart(4, "0");
  const packet = packets[packetCode];
  if (!packet) throw new Error(`Unsupported packet code 0x${packetCodeHex}`);
  return packet.parser(raf, productDescription);
}

export { packets, parser };
export default { packets, parser };
