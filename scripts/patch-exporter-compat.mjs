import AdmZip from "adm-zip";
// Map a renamed class in the development exporter to the exact installed 2.8.4 class.
// This modifies only the exporter JAR in the extraction copy, never a game mod.
const zip = new AdmZip("data/research/gtnhdumper-1.16.6.jar");
const name = "com/iouter/gtnhdumper/common/dumper/ItemIconDumper.class";
const bytes = zip.readFile(name);
const parts = [bytes.subarray(0, 10)];
let offset = 10,
  replacements = 0;
for (let i = 1; i < bytes.readUInt16BE(8); i++) {
  const start = offset,
    tag = bytes[offset++];
  if (tag === 1) {
    const length = bytes.readUInt16BE(offset);
    offset += 2;
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    if (value.toString() === "gregtech/common/blocks/GTBlockOre") {
      const replacement = Buffer.from("gregtech/common/blocks/BlockOres");
      const header = Buffer.alloc(3);
      header[0] = 1;
      header.writeUInt16BE(replacement.length, 1);
      parts.push(header, replacement);
      replacements++;
    } else parts.push(bytes.subarray(start, offset));
    continue;
  }
  const sizes = {
    3: 4,
    4: 4,
    5: 8,
    6: 8,
    7: 2,
    8: 2,
    9: 4,
    10: 4,
    11: 4,
    12: 4,
    15: 3,
    16: 2,
    18: 4,
  };
  if (!(tag in sizes)) throw new Error("Unknown constant pool tag " + tag);
  offset += sizes[tag];
  if (tag === 5 || tag === 6) i++;
  parts.push(bytes.subarray(start, offset));
}
if (replacements !== 1)
  throw new Error("Expected exactly one known class reference");
parts.push(bytes.subarray(offset));
zip.updateFile(name, Buffer.concat(parts));
zip.writeZip("data/extraction/instance/minecraft/mods/gtnhdumper-1.16.6.jar");
console.log("Patched extraction exporter for GTNH 2.8.4 BlockOres.");
