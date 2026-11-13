/** 只读的大端 NBT。方块选区用得到，不写回存档。 */

const text = new TextDecoder();

function viewOf(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return { data, view: new DataView(data.buffer, data.byteOffset, data.byteLength) };
}

/**
 * @param {Uint8Array} bytes
 * @returns {{ name: string, value: object }}
 */
export function readNbt(bytes) {
  const { data, view } = viewOf(bytes);
  let offset = 0;
  if (data[0] !== 10) throw new Error('NBT 根节点不是复合标签');
  offset = 1;
  const name = readString();
  const value = readCompound();
  return { name, value };

  function need(size) {
    if (offset + size > data.length) throw new Error('NBT 数据在读完之前就结束了');
  }
  function readString() {
    need(2);
    const length = view.getUint16(offset, false);
    offset += 2;
    need(length);
    const value = text.decode(data.subarray(offset, offset + length));
    offset += length;
    return value;
  }
  function readPayload(type) {
    switch (type) {
      case 1: need(1); return view.getInt8(offset++);
      case 2: need(2); { const value = view.getInt16(offset, false); offset += 2; return value; }
      case 3: need(4); { const value = view.getInt32(offset, false); offset += 4; return value; }
      case 4: need(8); { const value = view.getBigInt64(offset, false); offset += 8; return value; }
      case 5: need(4); { const value = view.getFloat32(offset, false); offset += 4; return value; }
      case 6: need(8); { const value = view.getFloat64(offset, false); offset += 8; return value; }
      case 7: {
        const count = readPayload(3);
        if (count < 0) throw new Error('NBT 字节数组长度无效');
        need(count);
        const value = data.slice(offset, offset + count);
        offset += count;
        return value;
      }
      case 8: return readString();
      case 9: return readList();
      case 10: return readCompound();
      case 11: return readArray(4, n => view.getInt32(offset + n * 4, false));
      case 12: return readArray(8, n => view.getBigUint64(offset + n * 8, false));
      default: throw new Error(`不认识的 NBT 类型 ${type}`);
    }
  }
  function readArray(width, readAt) {
    const count = readPayload(3);
    if (count < 0 || count > 1_000_000) throw new Error('NBT 数组长度无效');
    need(count * width);
    const values = [];
    for (let index = 0; index < count; index++) values.push(readAt(index));
    offset += count * width;
    return values;
  }
  function readList() {
    need(5);
    const type = data[offset++];
    const count = view.getInt32(offset, false);
    offset += 4;
    if (count < 0 || count > 1_000_000) throw new Error('NBT 列表长度无效');
    if (type === 0 || count === 0) return [];
    const values = [];
    for (let index = 0; index < count; index++) values.push(readPayload(type));
    return values;
  }
  function readCompound() {
    const compound = {};
    while (offset < data.length) {
      const type = data[offset++];
      if (type === 0) return compound;
      const key = readString();
      compound[key] = readPayload(type);
    }
    throw new Error('NBT 复合标签没有结束');
  }
}

/** 从打包的 64 位数组里取出第 index 个方块调色板下标。aligned 为 1.16 及以后的区块。 */
export function readPackedIndex(longs, index, bits, aligned) {
  if (!bits) return 0;
  const mask = (1n << BigInt(bits)) - 1n;
  if (aligned) {
    const per = Math.floor(64 / bits);
    const longIndex = Math.floor(index / per);
    const bit = (index % per) * bits;
    const word = BigInt(longs[longIndex] ?? 0);
    return Number((word >> BigInt(bit)) & mask);
  }
  const start = index * bits;
  const longIndex = Math.floor(start / 64);
  const bit = start % 64;
  let word = BigInt(longs[longIndex] ?? 0);
  let value = (word >> BigInt(bit)) & mask;
  if (bit + bits > 64) {
    const rest = BigInt(bit + bits - 64);
    word = BigInt(longs[longIndex + 1] ?? 0);
    value |= (word & ((1n << rest) - 1n)) << BigInt(64 - bit);
  }
  return Number(value);
}
