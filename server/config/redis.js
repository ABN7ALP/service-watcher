const Redis = require('redis');
const { createClient } = require('redis');

class RedisClient {
  constructor() {
    this.client = null;
    this.connected = false;
  }

  async connect() {
    try {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      
      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.log('❌ Too many Redis reconnection attempts');
              return new Error('Too many reconnection attempts');
            }
            return Math.min(retries * 100, 3000);
          }
        }
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis Client Error:', err);
        this.connected = false;
      });

      this.client.on('connect', () => {
        console.log('✅ Connected to Redis');
        this.connected = true;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis reconnecting...');
        this.connected = false;
      });

      this.client.on('end', () => {
        console.log('🔴 Redis connection ended');
        this.connected = false;
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  async get(key) {
    if (!this.connected) return null;
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.connected) return false;
    try {
      await this.client.set(key, JSON.stringify(value), {
        EX: ttl
      });
      return true;
    } catch (error) {
      console.error('Redis set error:', error);
      return false;
    }
  }

  async del(key) {
    if (!this.connected) return false;
    try {
      await this.client.del(key);
      return true;
    } catch (error) {
      console.error('Redis delete error:', error);
      return false;
    }
  }

  async hSet(key, field, value) {
    if (!this.connected) return false;
    try {
      await this.client.hSet(key, field, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Redis hSet error:', error);
      return false;
    }
  }

  async hGet(key, field) {
    if (!this.connected) return null;
    try {
      const value = await this.client.hGet(key, field);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error('Redis hGet error:', error);
      return null;
    }
  }

  async hDel(key, field) {
    if (!this.connected) return false;
    try {
      await this.client.hDel(key, field);
      return true;
    } catch (error) {
      console.error('Redis hDel error:', error);
      return false;
    }
  }

  async sadd(key, value) {
    if (!this.connected) return false;
    try {
      await this.client.sAdd(key, value);
      return true;
    } catch (error) {
      console.error('Redis sadd error:', error);
      return false;
    }
  }

  async smembers(key) {
    if (!this.connected) return [];
    try {
      return await this.client.sMembers(key);
    } catch (error) {
      console.error('Redis smembers error:', error);
      return [];
    }
  }

  async srem(key, value) {
    if (!this.connected) return false;
    try {
      await this.client.sRem(key, value);
      return true;
    } catch (error) {
      console.error('Redis srem error:', error);
      return false;
    }
  }

  async publish(channel, message) {
    if (!this.connected) return false;
    try {
      await this.client.publish(channel, JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Redis publish error:', error);
      return false;
    }
  }

  async subscribe(channel, callback) {
    if (!this.connected) return null;
    try {
      const subscriber = this.client.duplicate();
      await subscriber.connect();
      
      await subscriber.subscribe(channel, (message) => {
        try {
          callback(JSON.parse(message));
        } catch (error) {
          callback(message);
        }
      });
      
      return subscriber;
    } catch (error) {
      console.error('Redis subscribe error:', error);
      return null;
    }
  }

  async incr(key) {
    if (!this.connected) return null;
    try {
      return await this.client.incr(key);
    } catch (error) {
      console.error('Redis incr error:', error);
      return null;
    }
  }

  async decr(key) {
    if (!this.connected) return null;
    try {
      return await this.client.decr(key);
    } catch (error) {
      console.error('Redis decr error:', error);
      return null;
    }
  }

  async expire(key, seconds) {
    if (!this.connected) return false;
    try {
      return await this.client.expire(key, seconds);
    } catch (error) {
      console.error('Redis expire error:', error);
      return false;
    }
  }

  async keys(pattern) {
    if (!this.connected) return [];
    try {
      return await this.client.keys(pattern);
    } catch (error) {
      console.error('Redis keys error:', error);
      return [];
    }
  }

  async flushAll() {
    if (!this.connected) return false;
    try {
      await this.client.flushAll();
      return true;
    } catch (error) {
      console.error('Redis flushAll error:', error);
      return false;
    }
  }

  async quit() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

// Export for use
module.exports = redisClient;
