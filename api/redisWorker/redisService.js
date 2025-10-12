import { createClient } from "redis";

const redis = createClient({
  url: process.env.REDIS_URL
});

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err) => console.error("Redis error:", err));

await redis.connect();

export function getRedisClient(prefix = "") {
  return {
    set: (key, val, ttl = null) =>
      ttl
        ? redis.set(`${prefix}:${key}`, val, { EX: ttl })
        : redis.set(`${prefix}:${key}`, val),
    get: (key) => redis.get(`${prefix}:${key}`),
    del: (key) => redis.del(`${prefix}:${key}`),
  };
}

export default redis;
