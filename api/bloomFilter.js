import { murmurhash3_32_gc } from './murmurhash3.js';
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
    this.bitArray[byteIndex] |= (1 << bitIndex);
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

  // Estimate false positive rate based on current fill level
  estimateFalsePositiveRate() {
    const m = this.size;
    const k = this.numHashes;
    const n = this.count;
    const probBitSet = 1 - Math.exp(-k * n / m);
    return Math.pow(probBitSet, k);
  }
}


class AdaptiveBloom {
  constructor(expectedItems, targetFPR = 0.01, growthFactor = 2) {
    this.targetFPR = targetFPR;
    this.growthFactor = growthFactor;
    this.filters = [];

    // Compute initial size and k
    const m = Math.ceil(-(expectedItems * Math.log(targetFPR)) / (Math.log(2) ** 2));
    const k = Math.round((m / expectedItems) * Math.log(2));

    this.filters.push(new BloomFilter(m, k));
  }

  add(item) {
    let current = this.filters[this.filters.length - 1];
    current.add(item);

    if (current.estimateFalsePositiveRate() > this.targetFPR) {
      console.log("⚠️ Rebuilding: current FPR too high");

      // Double the size for new filter
      const newM = current.size * this.growthFactor;
      const newExpected = current.count * this.growthFactor;
      const newK = Math.round((newM / newExpected) * Math.log(2));

      this.filters.push(new BloomFilter(newM, newK));
    }
  }

  contains(item) {
    // Must check all filters
    return this.filters.some(f => f.contains(item));
  }
}


const bf = new AdaptiveBloom(10000, 0.01);

for (let i = 0; i < 15000; i++) {
  bf.add("user" + i);

  if (i % 2000 === 0) {
    console.log("Items:", i, 
      "Filters:", bf.filters.length, 
      "Current FPR:", bf.filters[bf.filters.length - 1].estimateFalsePositiveRate());
  }
}

console.log(bf.contains("user123"));  
console.log(bf.contains("user554"));  
console.log(bf.contains("ghost999"));
