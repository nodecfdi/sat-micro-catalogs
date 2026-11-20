import type { FileHandle } from 'node:fs/promises';
import { open, readFile } from 'node:fs/promises';

const BLOCK_MAGIC_HI = 0x31_41_59;
const BLOCK_MAGIC_LO = 0x26_53_59;
const EOS_MAGIC_HI = 0x17_72_45;
const EOS_MAGIC_LO = 0x38_50_90;
const CHUNK_SIZE = 262_144;
const MAX_CODE_LEN = 20;

interface HuffmanTable {
  base: Int32Array;
  limit: Int32Array;
  maxLen: number;
  minLen: number;
  perm: Int32Array;
}

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i += 1) {
  let crc = (i << 24) >>> 0;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = ((crc << 1) ^ ((crc & 0x80_00_00_00) === 0 ? 0 : 0x04_C1_1D_B7)) >>> 0;
  }
  CRC32_TABLE[i] = crc;
}

class BitReader {
  private readonly data: Uint8Array;

  private bytePos = 0;

  private bitBuffer = 0;

  private bitCount = 0;

  public constructor(data: Uint8Array) {
    this.data = data;
  }

  public hasMoreBytes(): boolean {
    return this.bytePos < this.data.length || this.bitCount >= 8;
  }

  public alignToByte(): void {
    const fullBytesLeft = this.bitCount >>> 3;
    this.bytePos -= fullBytesLeft;
    this.bitCount = 0;
    this.bitBuffer = 0;
  }

  public readBit(): number {
    if (this.bitCount === 0) {
      if (this.bytePos >= this.data.length) {
        throw new Error('Unexpected end of bzip2 stream');
      }
      this.bitBuffer = this.data[this.bytePos];
      this.bytePos += 1;
      this.bitCount = 8;
    }
    this.bitCount -= 1;

    return (this.bitBuffer >>> this.bitCount) & 1;
  }

  public readBits(count: number): number {
    while (this.bitCount < count) {
      if (this.bytePos >= this.data.length) {
        throw new Error('Unexpected end of bzip2 stream');
      }
      this.bitBuffer = ((this.bitBuffer << 8) | this.data[this.bytePos]) >>> 0;
      this.bytePos += 1;
      this.bitCount += 8;
    }
    this.bitCount -= count;

    return (this.bitBuffer >>> this.bitCount) & ((1 << count) - 1);
  }

  public readUint32(): number {
    return (((this.readBits(16) << 16) >>> 0) | this.readBits(16)) >>> 0;
  }
}

function createHuffmanTable(lengths: Uint8Array, alphaSize: number): HuffmanTable {
  let minLen = MAX_CODE_LEN;
  let maxLen = 1;
  for (let i = 0; i < alphaSize; i += 1) {
    const len = lengths[i];
    if (len < minLen) {
      minLen = len;
    }
    if (len > maxLen) {
      maxLen = len;
    }
  }

  const perm = new Int32Array(alphaSize);
  let pp = 0;
  for (let len = minLen; len <= maxLen; len += 1) {
    for (let sym = 0; sym < alphaSize; sym += 1) {
      if (lengths[sym] !== len) {
        continue;
      }
      perm[pp] = sym;
      pp += 1;
    }
  }

  const base = new Int32Array(MAX_CODE_LEN + 2);
  const limit = new Int32Array(MAX_CODE_LEN + 2);

  for (let i = 0; i < alphaSize; i += 1) {
    base[lengths[i] + 1] += 1;
  }
  for (let i = 1; i <= MAX_CODE_LEN + 1; i += 1) {
    base[i] += base[i - 1];
  }

  let vec = 0;
  for (let i = minLen; i <= maxLen; i += 1) {
    vec += base[i + 1] - base[i];
    limit[i] = vec - 1;
    vec <<= 1;
  }
  for (let i = minLen + 1; i <= maxLen; i += 1) {
    base[i] = ((limit[i - 1] + 1) << 1) - base[i];
  }

  return { base, limit, maxLen, minLen, perm };
}

function decodeSymbol(reader: BitReader, table: HuffmanTable): number {
  let zn = table.minLen;
  let zvec = reader.readBits(zn);
  while (zvec > table.limit[zn]) {
    zn += 1;
    if (zn > table.maxLen) {
      throw new Error('Invalid Huffman code in bzip2 stream');
    }
    zvec = (zvec << 1) | reader.readBit();
  }

  const idx = zvec - table.base[zn];
  if (idx < 0 || idx >= table.perm.length) {
    throw new Error('Huffman symbol index out of range');
  }

  return table.perm[idx];
}

function formatHex32(value: number): string {
  return `0x${value.toString(16).padStart(8, '0')}`;
}

async function writeAll(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.length) {
    const result = await handle.write(chunk, offset, chunk.length - offset);
    if (result.bytesWritten === 0) {
      throw new Error('Failed to write decompressed bzip2 chunk');
    }
    offset += result.bytesWritten;
  }
}

function* decodeBzip2Stream(reader: BitReader): Generator<Uint8Array> {
  const b0 = reader.readBits(8);
  const b1 = reader.readBits(8);
  const b2 = reader.readBits(8);
  if (b0 !== 0x42 || b1 !== 0x5A || b2 !== 0x68) {
    throw new Error('Invalid bzip2 header signature (expected BZh)');
  }

  const levelByte = reader.readBits(8);
  if (levelByte < 0x31 || levelByte > 0x39) {
    throw new Error(`Invalid bzip2 block size level: ${String.fromCodePoint(levelByte)}`);
  }

  const blockSize = (levelByte - 0x30) * 100_000;
  const tt = new Uint32Array(blockSize);
  const outChunk = new Uint8Array(CHUNK_SIZE);
  const seqToUnseq = new Uint8Array(256);
  const mtf = new Uint8Array(256);
  const unzftab = new Int32Array(256);
  const cftab = new Int32Array(257);
  let combinedCrc = 0;

  let magicHi = reader.readBits(24);
  let magicLo = reader.readBits(24);

  while (magicHi !== EOS_MAGIC_HI || magicLo !== EOS_MAGIC_LO) {
    if (magicHi !== BLOCK_MAGIC_HI || magicLo !== BLOCK_MAGIC_LO) {
      throw new Error('Invalid bzip2 block magic');
    }

    const storedBlockCrc = reader.readUint32();
    const randomized = reader.readBit() === 1;
    if (randomized) {
      throw new Error('Randomized bzip2 blocks are not supported');
    }

    const origPtr = reader.readBits(24);
    const inUse16 = reader.readBits(16);
    let nInUse = 0;

    for (let i = 0; i < 16; i += 1) {
      if ((inUse16 & (1 << (15 - i))) === 0) {
        continue;
      }
      const row = reader.readBits(16);
      for (let j = 0; j < 16; j += 1) {
        if ((row & (1 << (15 - j))) === 0) {
          continue;
        }
        seqToUnseq[nInUse] = i * 16 + j;
        nInUse += 1;
      }
    }

    if (nInUse === 0) {
      throw new Error('Invalid bzip2 block: no symbols in use');
    }

    const alphaSize = nInUse + 2;
    const eob = nInUse + 1;

    const nGroups = reader.readBits(3);
    if (nGroups < 2 || nGroups > 6) {
      throw new Error(`Invalid bzip2 Huffman group count: ${nGroups}`);
    }

    const nSelectors = reader.readBits(15);
    if (nSelectors < 1) {
      throw new Error('Invalid bzip2 selector count');
    }

    const selectorMtf = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i += 1) {
      let count = 0;
      while (reader.readBit() === 1) {
        count += 1;
        if (count >= nGroups) {
          throw new Error('Invalid bzip2 selector MTF value');
        }
      }
      selectorMtf[i] = count;
    }

    const selectorOrder = new Uint8Array(nGroups);
    for (let i = 0; i < nGroups; i += 1) {
      selectorOrder[i] = i;
    }
    const selector = new Uint8Array(nSelectors);
    for (let i = 0; i < nSelectors; i += 1) {
      const pos = selectorMtf[i];
      const value = selectorOrder[pos];
      selectorOrder.copyWithin(1, 0, pos);
      selectorOrder[0] = value;
      selector[i] = value;
    }

    const tables: HuffmanTable[] = [];
    const lengths = new Uint8Array(alphaSize);
    for (let t = 0; t < nGroups; t += 1) {
      let curr = reader.readBits(5);
      for (let i = 0; i < alphaSize; i += 1) {
        while (reader.readBit() === 1) {
          curr += reader.readBit() === 0 ? 1 : -1;
          if (curr < 1 || curr > MAX_CODE_LEN) {
            throw new Error(`Invalid bzip2 Huffman code length: ${curr}`);
          }
        }
        if (curr < 1 || curr > MAX_CODE_LEN) {
          throw new Error(`Invalid bzip2 Huffman code length: ${curr}`);
        }
        lengths[i] = curr;
      }
      tables.push(createHuffmanTable(lengths, alphaSize));
    }

    mtf.set(seqToUnseq.subarray(0, nInUse));
    unzftab.fill(0);

    let groupNo = 0;
    let groupPos = 0;
    let currentTable = tables[selector[0]];
    const readNextSym = (): number => {
      if (groupPos === 0) {
        if (groupNo >= nSelectors) {
          throw new Error('Bzip2 selector index out of range');
        }
        currentTable = tables[selector[groupNo]];
        groupNo += 1;
        groupPos = 50;
      }
      groupPos -= 1;

      return decodeSymbol(reader, currentTable);
    };

    let nblock = 0;
    let nextSym = readNextSym();
    while (nextSym !== eob) {
      if (nextSym === 0 || nextSym === 1) {
        let es = -1;
        let runMultiplier = 1;
        do {
          if (nextSym === 0) {
            es += runMultiplier;
          } else {
            es += 2 * runMultiplier;
          }
          runMultiplier <<= 1;
          if (runMultiplier > blockSize * 2) {
            throw new Error('Bzip2 RLE2 run length overflow');
          }
          nextSym = readNextSym();
        } while (nextSym === 0 || nextSym === 1);

        es += 1;
        if (nblock + es > blockSize) {
          throw new Error('Bzip2 block size exceeded during RLE2');
        }
        const uc = mtf[0];
        unzftab[uc] += es;
        while (es > 0) {
          tt[nblock] = uc;
          nblock += 1;
          es -= 1;
        }
        continue;
      }

      if (nextSym > eob) {
        throw new Error('Bzip2 symbol out of range');
      }

      const nn = nextSym - 1;
      const uc = mtf[nn];
      mtf.copyWithin(1, 0, nn);
      mtf[0] = uc;

      if (nblock >= blockSize) {
        throw new Error('Bzip2 block size exceeded');
      }
      unzftab[uc] += 1;
      tt[nblock] = uc;
      nblock += 1;
      nextSym = readNextSym();
    }

    let blockCrc = 0xFF_FF_FF_FF;
    let outPos = 0;

    if (nblock > 0) {
      if (origPtr >= nblock) {
        throw new Error('Invalid bzip2 origPtr');
      }

      cftab[0] = 0;
      for (let i = 1; i <= 256; i += 1) {
        cftab[i] = cftab[i - 1] + unzftab[i - 1];
      }
      for (let i = 0; i < nblock; i += 1) {
        const ch = tt[i] & 0xFF;
        tt[cftab[ch]] |= i << 8;
        cftab[ch] += 1;
      }

      let tPos = tt[origPtr] >>> 8;
      let stateRunLen = 0;
      let stateLastByte = -1;

      for (let count = 0; count < nblock; count += 1) {
        const raw = tt[tPos];
        const byteVal = raw & 0xFF;
        tPos = raw >>> 8;

        if (stateRunLen === 4) {
          for (let r = 0; r < byteVal; r += 1) {
            blockCrc = (((blockCrc << 8) >>> 0) ^ CRC32_TABLE[((blockCrc >>> 24) ^ stateLastByte) & 0xFF]) >>> 0;
            outChunk[outPos] = stateLastByte;
            outPos += 1;
            if (outPos < CHUNK_SIZE) {
              continue;
            }
            yield outChunk.slice();
            outPos = 0;
          }
          stateRunLen = 0;
          stateLastByte = -1;
          continue;
        }

        if (byteVal === stateLastByte) {
          stateRunLen += 1;
        } else {
          stateLastByte = byteVal;
          stateRunLen = 1;
        }

        blockCrc = (((blockCrc << 8) >>> 0) ^ CRC32_TABLE[((blockCrc >>> 24) ^ byteVal) & 0xFF]) >>> 0;
        outChunk[outPos] = byteVal;
        outPos += 1;
        if (outPos < CHUNK_SIZE) {
          continue;
        }
        yield outChunk.slice();
        outPos = 0;
      }
    }

    if (outPos > 0) {
      yield outChunk.slice(0, outPos);
    }

    blockCrc = (blockCrc ^ 0xFF_FF_FF_FF) >>> 0;
    if (blockCrc !== storedBlockCrc) {
      throw new Error(
        `Bzip2 block CRC mismatch: expected ${formatHex32(storedBlockCrc)}, got ${formatHex32(blockCrc)}`,
      );
    }

    combinedCrc = ((((combinedCrc << 1) | (combinedCrc >>> 31)) >>> 0) ^ blockCrc) >>> 0;
    magicHi = reader.readBits(24);
    magicLo = reader.readBits(24);
  }

  const storedCombinedCrc = reader.readUint32();
  if (storedCombinedCrc !== combinedCrc) {
    throw new Error(
      `Bzip2 stream CRC mismatch: expected ${formatHex32(storedCombinedCrc)}, got ${formatHex32(combinedCrc)}`,
    );
  }
  reader.alignToByte();
}

export function* decompressBzip2Chunks(input: Uint8Array): Generator<Uint8Array> {
  if (input.length === 0) {
    throw new Error('Empty bzip2 input');
  }

  const reader = new BitReader(input);

  while (reader.hasMoreBytes()) {
    yield* decodeBzip2Stream(reader);
  }
}

export function decompressBzip2(input: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  for (const chunk of decompressBzip2Chunks(input)) {
    chunks.push(chunk);
    totalLength += chunk.length;
  }

  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export async function decompressBzip2File(inputPath: string, outputPath: string): Promise<void> {
  const compressed = await readFile(inputPath);
  const handle = await open(outputPath, 'w');
  try {
    for (const chunk of decompressBzip2Chunks(compressed)) {
      await writeAll(handle, chunk);
    }
  } finally {
    await handle.close();
  }
}
