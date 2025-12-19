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
        url: redisUrl
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

      await this.client.connect();
      return this.client;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error);
      throw error;
    }
  }

  // دالة sendCommand صحيحة
  async sendCommand(command, args) {
    if (!this.connected || !this.client) {
      throw new Error('Redis not connected');
    }
    
    try {
      // تنفيذ الأمر مباشرة
      return await this.client.sendCommand([command, ...args]);
    } catch (error) {
      console.error('Redis command error:', error);
      throw error;
    }
  }

  // باقي الدوال كما هي
  async get(key) {
    if (!this.connected) return null;
    try {
      return await this.client.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, value, ttl = 3600) {
    if (!this.connected) return false;
    try {
      if (ttl) {
        await this.client.setEx(key, ttl, value);
      } else {
        await this.client.set(key, value);
      }
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

  async quit() {
    if (this.client && this.connected) {
      await this.client.quit();
      this.connected = false;
    }
  }
}

// Create singleton instance
const redisClient = new RedisClient();

// تصدير مع دالة sendCommand منفصلة
module.exports = {
  redisClient,
  sendCommand: async (...args) => {
    try {
      await redisClient.connect();
      return await redisClient.sendCommand(args[0], args.slice(1));
    } catch (error) {
      console.error('sendCommand error:', error);
      return null;
    }
  }
};
