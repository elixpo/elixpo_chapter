import { bloomFilter, allBloomFilters } from "../bloomFilter.js";
import { getRedisClient } from "../redisWorker/redisService.js";
import {setUserDisplayName} from "../utility.js";
const authService = getRedisClient("authService");

async function checkInBloomFilter(key) {
  try {
    const cachedResult = await authService.get(key);
    if (cachedResult !== null) {
      console.log(`Cache hit for key: ${key}`);
      return cachedResult === 'true';
    }
    const inActiveFilter = bloomFilter.contains(key);
    const inOldFilters = allBloomFilters.some(bf => bf.filter.contains(key));
    const inBloomFilter = inActiveFilter || inOldFilters;
    
    console.log(`Checked bloom filters for key: ${key}, found: ${inBloomFilter}`);
    await authService.set(key, String(inBloomFilter), { EX: 180 }); //cache for 3 mins
    return inBloomFilter;
  } catch (error) {
    console.error(`Error checking bloom filter for key ${key}:`, error);
    return false;
  }
}

function checkUserNameFormat(name)
{
    if (!name || typeof name !== 'string') {
        return "The name must be a non-empty string.";
    }

    const sanitized = name.trim().replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    if (!sanitized || sanitized.replace(/-/g, '') === '') {
        return "The name cancontain alphanumeric characters & hyphens only.";
    }

    if (sanitized.includes('--') || sanitized.startsWith('-') || sanitized.endsWith('-')) {
        return "The name must not contain consecutive hyphens or leading/trailing hyphens.";
    }

    return sanitized;
}

function suggestUserName(name) {
    const normalized = checkUserNameFormat(name);
    if (typeof normalized === 'string' && normalized !== name) {
        return normalized;
    }
    const baseName = name.trim().toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    if (!baseName) {
        return 'user' + Math.random().toString(36).substr(2, 6);
    }
    const elegantSuffixes = ['pro', 'elite', 'prime', 'zen', 'core', 'sage'];
    const classyPrefixes = ['the', 'neo', 'ultra', 'alpha', 'meta'];
    
    const suggestions = [
        baseName,
        baseName + elegantSuffixes[Math.floor(Math.random() * elegantSuffixes.length)],
        classyPrefixes[Math.floor(Math.random() * classyPrefixes.length)] + baseName,
        baseName + (Math.floor(Math.random() * 99) + 1)
    ];
    
    return suggestions[Math.floor(Math.random() * suggestions.length)];
}


function addNameToBloomRedisDB(name, uid) {
    const sanitized = checkUserNameFormat(name);
    if (typeof sanitized === 'string') {
        bloomFilter.add(sanitized.toLowerCase());
        authService.del(sanitized.toLowerCase()); 
        authService.set(sanitized.toLowerCase(), 'true', { EX: 900 }); 
        setUserDisplayName(uid, sanitized);
        console.log(`Added name to bloom filter: ${sanitized.toLowerCase()}`);
        return true;
    } else {
        console.error(`Invalid name format, cannot add to bloom filter: ${name}`);
        return false;
    }
}

// Function connects with the api gateway
async function checkUsernameRequest(name, req, res)
{
    const sanitized = checkUserNameFormat(name);
  if (sanitized !== name) {
    return res.status(400).json({ available: false, message: sanitized });
  }
  const exists = await checkInBloomFilter(sanitized.toLowerCase());
  if (exists) {
    const userNameSuggested = suggestUserName(sanitized);
    return res.status(200).json({ available: false, message: "Username is already taken.", suggestion: userNameSuggested });
  } else {
    return res.status(200).json({ available: true, message: "Username is available!" });
  }
}
export {checkInBloomFilter, checkUserNameFormat, suggestUserName, addNameToBloomRedisDB, checkUsernameRequest}
// bloomFilter.add("exampleKey");

// checkInBloomFilter("exampleKey").then(result => {
//   console.log(`Key exists: ${result}`);
// }).catch(err => {
//   console.error("Error:", err);
// });