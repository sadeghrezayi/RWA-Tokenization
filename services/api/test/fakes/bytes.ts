// Returns a copy with one byte flipped — how both cipher-level and store-level
// tests simulate content being altered at rest. Written via writeUInt8 rather
// than index assignment so it type-checks under noUncheckedIndexedAccess.
export const flipByte = (source: Buffer, index: number): Buffer => {
  const copy = Buffer.from(source);
  copy.writeUInt8(copy.readUInt8(index) ^ 0x01, index);
  return copy;
};
