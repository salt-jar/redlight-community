import Redis from 'ioredis';

function createMemoryCache() {
  const store = new Map();

  const readAlive = (key) => {
    const item = store.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      store.delete(key);
      return null;
    }
    return item.value;
  };

  return {
    mode: 'memory',
    async get(key) {
      return readAlive(key);
    },
    async set(key, value, ttlSec) {
      const expiresAt = ttlSec ? Date.now() + ttlSec * 1000 : 0;
      store.set(key, { value: String(value), expiresAt });
      return 'OK';
    },
    async del(key) {
      store.delete(key);
    },
    async close() {},
  };
}

/**
 * 缓存：配置 REDIS_URL 时优先 Redis（验证码、限流可跨进程共享），
 * 否则退化为进程内 TTL 存储（本地开发零依赖）。
 */
export async function createCache(config, logger = console) {
  const memory = createMemoryCache();
  if (!config.redisUrl) return memory;

  const redis = new Redis(config.redisUrl, {
    lazyConnect: true,
    connectTimeout: 1500,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  redis.on('error', (error) => {
    logger.warn(`[cache] Redis 错误：${error.message}`);
  });

  try {
    await redis.connect();
    await redis.ping();
    logger.log('[cache] 已连接 Redis');
    return {
      mode: 'redis',
      async get(key) {
        try {
          return await redis.get(key);
        } catch (error) {
          logger.warn(`[cache] Redis 读取失败，回退内存：${error.message}`);
          return memory.get(key);
        }
      },
      async set(key, value, ttlSec) {
        try {
          if (ttlSec) await redis.set(key, String(value), 'EX', ttlSec);
          else await redis.set(key, String(value));
          return 'OK';
        } catch (error) {
          logger.warn(`[cache] Redis 写入失败，回退内存：${error.message}`);
          return memory.set(key, value, ttlSec);
        }
      },
      async del(key) {
        try {
          await redis.del(key);
        } catch {
          await memory.del(key);
        }
      },
      async close() {
        redis.disconnect();
      },
    };
  } catch (error) {
    logger.warn(`[cache] Redis 连接失败（${error.message}），本次运行使用内存缓存`);
    redis.disconnect();
    return memory;
  }
}
