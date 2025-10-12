import { murmurhash3_32_gc } from "./murmurhash3.js";
import fs from "fs";
import path from "path";

class BloomFilter {
  constructor(size, numHashes) {
    this.size = size;
    this.numHashes = numHashes;
    this.bitArray = new Uint8Array(Math.ceil(size / 8));
    this.count = 0;
  }

  _setBit(pos) {
    const byteIndex = Math.floor(pos / 8);
    const bitIndex = pos % 8;
    this.bitArray[byteIndex] |= 1 << bitIndex;
  }

  _getBit(pos) {
    const byteIndex = Math.floor(pos / 8);
    const bitIndex = pos % 8;
    return (this.bitArray[byteIndex] & (1 << bitIndex)) !== 0;
  }

  _hashes(item) {
    const h1 = murmurhash3_32_gc(item, 0);
    const h2 = murmurhash3_32_gc(item, h1);
    const positions = [];
    for (let i = 0; i < this.numHashes; i++) {
      positions.push((h1 + i * h2) % this.size);
    }
    return positions;
  }

  add(item) {
    for (const pos of this._hashes(item)) {
      this._setBit(pos);
    }
    this.count++;
  }

  contains(item) {
    for (const pos of this._hashes(item)) {
      if (!this._getBit(pos)) return false;
    }
    return true;
  }

  estimateFalsePositiveRate() {
    const m = this.size;
    const k = this.numHashes;
    const n = this.count;
    const probBitSet = 1 - Math.exp((-k * n) / m);
    return Math.pow(probBitSet, k);
  }

  saveToFile(path) {
    const header = Buffer.alloc(12);
    header.writeUInt32BE(this.size, 0);
    header.writeUInt32BE(this.numHashes, 4);
    header.writeUInt32BE(this.count, 8);

    const buffer = Buffer.concat([header, Buffer.from(this.bitArray)]);
    fs.writeFileSync(path, buffer);
  }

  static loadFromFile(path) {
    const buffer = fs.readFileSync(path);

    const size = buffer.readUInt32BE(0);
    const numHashes = buffer.readUInt32BE(4);
    const count = buffer.readUInt32BE(8);

    const bitArray = buffer.slice(12);

    const bf = new BloomFilter(size, numHashes);
    bf.count = count;
    bf.bitArray = new Uint8Array(bitArray);

    return bf;
  }
}

class AdaptiveBloom {
  constructor(expectedItems, targetFPR = 0.01, growthFactor = 2, file = null) {
    this.targetFPR = targetFPR;
    this.growthFactor = growthFactor;
    this.file = file || `bloomFilters/adaptiveBloom_${this.getCurrentTimestamp()}.bin`;
    this.filters = [];

    if (fs.existsSync(this.file)) {
      this.loadFromFile(this.file);
    } else {
      const m = Math.ceil(-(expectedItems * Math.log(targetFPR)) / Math.log(2) ** 2);
      const k = Math.round((m / expectedItems) * Math.log(2));
      this.filters.push(new BloomFilter(m, k));
      this.saveToFile(); 
    }
  }

  getCurrentTimestamp() {
    return Date.now();
  }

  add(item) {
    let current = this.filters[this.filters.length - 1];
    current.add(item);

    if (current.estimateFalsePositiveRate() > this.targetFPR) {
      console.log("⚠️ Rebuilding: current FPR too high");

      const newM = current.size * this.growthFactor;
      const newExpected = current.count * this.growthFactor;
      const newK = Math.round((newM / newExpected) * Math.log(2));

      this.filters.push(new BloomFilter(newM, newK));
    }

    this.saveToFile();
  }

  contains(item) {
    return this.filters.some((f) => f.contains(item));
  }

  saveToFile() {
    const buffers = [];
    for (const f of this.filters) {
      const header = Buffer.alloc(12);
      header.writeUInt32BE(f.size, 0);
      header.writeUInt32BE(f.numHashes, 4);
      header.writeUInt32BE(f.count, 8);
      buffers.push(header, Buffer.from(f.bitArray));
    }
    fs.writeFileSync(this.file, Buffer.concat(buffers));
  }

  loadFromFile(file) {
    const data = fs.readFileSync(file);
    let offset = 0;
    this.filters = [];

    while (offset < data.length) {
      const size = data.readUInt32BE(offset);
      const numHashes = data.readUInt32BE(offset + 4);
      const count = data.readUInt32BE(offset + 8);
      const byteLength = Math.ceil(size / 8);

      const bitArray = data.slice(offset + 12, offset + 12 + byteLength);

      const bf = new BloomFilter(size, numHashes);
      bf.count = count;
      bf.bitArray = new Uint8Array(bitArray);
      this.filters.push(bf);

      offset += 12 + byteLength;
    }
  }
}

function loadAllBloomFilters() {
  const bloomFiltersDir = 'bloomFilters';
  const allBloomFilters = [];
  let activeBloomFilter = null;

  if (!fs.existsSync(bloomFiltersDir)) {
    fs.mkdirSync(bloomFiltersDir, { recursive: true });
    return { activeBloomFilter: new AdaptiveBloom(10000, 0.01), allBloomFilters: [] };
  }

  try {
    const files = fs.readdirSync(bloomFiltersDir);
    const binFiles = files.filter(file => file.endsWith('.bin'));
    
    const sortedFiles = binFiles
      .map(file => ({
        filename: file,
        timestamp: parseInt(file.match(/adaptiveBloom_(\d+)\.bin/)?.[1] || '0')
      }))
      .sort((a, b) => b.timestamp - a.timestamp); 

    console.log('📁 Found bloom filter files:', sortedFiles.map(f => `${f.filename} (${f.timestamp})`));

    for (let i = 0; i < sortedFiles.length; i++) {
      const { filename } = sortedFiles[i];
      try {
        const filePath = path.join(bloomFiltersDir, filename);
        
        if (filename.startsWith('adaptiveBloom_')) {
          const adaptiveBloom = new AdaptiveBloom(10000, 0.01, 2, filePath);
          adaptiveBloom.loadFromFile(filePath);
          
          if (i === 0) {
            // Most recent file becomes active
            activeBloomFilter = adaptiveBloom;
            console.log(`✅ Loaded active bloom filter: ${filename}`);
          } else {
            // Older files become read-only
            allBloomFilters.push({
              type: 'adaptive',
              filename: filename,
              filter: adaptiveBloom,
              timestamp: sortedFiles[i].timestamp
            });
            console.log(`📚 Loaded historical bloom filter: ${filename}`);
          }
        }
      } catch (error) {
        console.error(`Failed to load bloom filter from ${filename}:`, error.message);
      }
    }

    // If no active filter found, create a new one
    if (!activeBloomFilter) {
      activeBloomFilter = new AdaptiveBloom(10000, 0.01);
      console.log(`✅ Created new active bloom filter`);
    }

    console.log(`✅ Loaded ${allBloomFilters.length} historical bloom filters from ${bloomFiltersDir}/`);
    return { activeBloomFilter, allBloomFilters };
  } catch (error) {
    console.error('Error reading bloomFilters directory:', error.message);
    return { activeBloomFilter: new AdaptiveBloom(10000, 0.01), allBloomFilters: [] };
  }
}

const { activeBloomFilter, allBloomFilters } = loadAllBloomFilters();
const bloomFilter = activeBloomFilter;
const time = bloomFilter.getCurrentTimestamp();
console.log(`Current timestamp: ${time}`);
console.log(`Total bloom filters loaded: ${allBloomFilters.length}`);

export { bloomFilter, allBloomFilters };
