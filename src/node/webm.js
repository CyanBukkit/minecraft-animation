const concat = parts => Buffer.concat(parts);
const id = value => Buffer.from(value.toString(16).padStart(Math.ceil(value.toString(16).length / 2) * 2, '0'), 'hex');

function size(value) {
  let width = 1;
  while (value >= 2 ** (width * 7) - 1) width++;
  const result = Buffer.alloc(width);
  let remaining = BigInt(value) | (1n << BigInt(width * 7));
  for (let index = width - 1; index >= 0; index--) { result[index] = Number(remaining & 255n); remaining >>= 8n; }
  return result;
}

function uint(value, width) {
  if (width === undefined) width = Math.max(1, Math.ceil(Math.log2(value + 1) / 8));
  const result = Buffer.alloc(width);
  let remaining = BigInt(value);
  for (let index = width - 1; index >= 0; index--) { result[index] = Number(remaining & 255n); remaining >>= 8n; }
  return result;
}

const element = (tag, data) => concat([id(tag), size(data.length), data]);
const number = (tag, value, width) => element(tag, uint(value, width));
const string = (tag, value) => element(tag, Buffer.from(value, 'utf8'));
const master = (tag, children) => element(tag, concat(children));
function float(tag, value) { const data = Buffer.alloc(8); data.writeDoubleBE(value); return element(tag, data); }

/** Single-track VP8 WebM. Chunk timestamps/durations are microseconds; container ticks are milliseconds. */
export function muxWebM(chunks, { width, height, fps }) {
  if (![width, height].every(value => Number.isInteger(value) && value > 0 && value <= 8192)) throw new Error('WebM 尺寸无效');
  if (!Number.isFinite(fps) || fps <= 0 || fps > 120) throw new Error('WebM 帧率无效');
  if (!Array.isArray(chunks) || !chunks.length || chunks[0].type !== 'key') throw new Error('WebM 必须以关键帧开始');
  let previous = -1;
  for (const chunk of chunks) {
    if (!Number.isSafeInteger(chunk.timestamp) || chunk.timestamp <= previous || chunk.timestamp < 0) throw new Error('视频时间戳必须严格递增');
    if (!['key', 'delta'].includes(chunk.type) || !(chunk.data instanceof Uint8Array) || !chunk.data.length) throw new Error('视频编码块无效');
    previous = chunk.timestamp;
  }
  if (chunks[0].timestamp !== 0) throw new Error('视频时间戳必须从零开始');
  const duration = chunks.length / fps * 1000;
  const header = master(0x1a45dfa3, [number(0x4286, 1), number(0x42f7, 1), number(0x42f2, 4), number(0x42f3, 8), string(0x4282, 'webm'), number(0x4287, 4), number(0x4285, 2)]);
  const info = master(0x1549a966, [number(0x2ad7b1, 1000000), float(0x4489, duration), string(0x4d80, 'minecraft-animation'), string(0x5741, 'minecraft-animation')]);
  const tracks = master(0x1654ae6b, [master(0xae, [number(0xd7, 1), number(0x73c5, 1), number(0x83, 1), number(0x9c, 0), string(0x86, 'V_VP8'), number(0x23e383, Math.round(1e9 / fps)), master(0xe0, [number(0xb0, width), number(0xba, height)])])]);
  const clusters = [];
  let current;
  for (const chunk of chunks) {
    const time = Math.round(chunk.timestamp / 1000);
    if (!current || chunk.type === 'key' || time - current.time > 30000) {
      current = { time, key: chunk.type === 'key', blocks: [] };
      clusters.push(current);
    }
    const block = Buffer.alloc(4);
    block[0] = 0x81; block.writeInt16BE(time - current.time, 1); block[3] = chunk.type === 'key' ? 0x80 : 0;
    current.blocks.push(element(0xa3, concat([block, Buffer.from(chunk.data)])));
  }
  const seek = (tag, position) => master(0x4dbb, [element(0x53ab, id(tag)), number(0x53ac, position, 8)]);
  const seekHead = positions => master(0x114d9b74, [seek(0x1549a966, positions[0]), seek(0x1654ae6b, positions[1]), seek(0x1c53bb6b, positions[2])]);
  const seekSize = seekHead([0, 0, 0]).length;
  let offset = seekSize + info.length + tracks.length;
  const cues = [];
  const payloads = clusters.map(cluster => {
    if (cluster.key) cues.push(master(0xbb, [number(0xb3, cluster.time), master(0xb7, [number(0xf7, 1), number(0xf1, offset)])]));
    const data = master(0x1f43b675, [number(0xe7, cluster.time), ...cluster.blocks]);
    offset += data.length;
    return data;
  });
  return concat([header, master(0x18538067, [seekHead([seekSize, seekSize + info.length, offset]), info, tracks, ...payloads, master(0x1c53bb6b, cues)])]);
}
