const bloomList = [];
async function isUsernameAvailable(name) {
  const cacheKey = `uname:${name}`;
  const cached = await redis.get(cacheKey);
  if (cached !== null) return cached === "available";

  const maybeExists = bloomFilters.some(bf => bf.has(name));
  if (!maybeExists) {
    await redis.set(cacheKey, "available", "EX", 900);
    return true;
  }

  const dbExists = await db.userExists(name);
  const status = dbExists ? "taken" : "available";
  await redis.set(cacheKey, status, "EX", 900);
  return !dbExists;
}

async function loadBloomFilter() {
    
}
class bloomChecker {
    async checkNameAvailability(name) {

    }
}