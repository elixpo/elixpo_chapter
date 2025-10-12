import { bloomFilter, allBloomFilters } from "../bloomFilter.js";
import redis from "../redisWorker/redisService.js";

async function checkInBloomFilter(key) {
  try {
    const cachedResult = await redis.get(key);
    if (cachedResult !== null) {
      console.log(`Cache hit for key: ${key}`);
      return cachedResult === 'true';
    }

    
    const inActiveFilter = bloomFilter.contains(key);
    const inOldFilters = allBloomFilters.some(bf => bf.filter.contains(key));
    const inBloomFilter = inActiveFilter || inOldFilters;
    
    console.log(`Checked bloom filters for key: ${key}, found: ${inBloomFilter}`);
    await redis.set(key, String(inBloomFilter), { EX: 900 });
    return inBloomFilter;
  } catch (error) {
    console.error(`Error checking bloom filter for key ${key}:`, error);
    return false;
  }
}

bloomFilter.add("exampleKey");

checkInBloomFilter("exampleKey").then(result => {
  console.log(`Key exists: ${result}`);
}).catch(err => {
  console.error("Error:", err);
});