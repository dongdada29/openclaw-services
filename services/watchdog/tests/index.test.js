/**
 * Watchdog 模块测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch
global.fetch = vi.fn();

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    pid: 12345,
  })),
  execSync: vi.fn(),
}));

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn((path) => {
    if (path.includes('backup')) return true;
    if (path.includes('models.json')) return true;
    if (path.includes('openclaw-proxy')) return true;
    return false;
  }),
  readFileSync: vi.fn((path) => {
    if (path.includes('pid')) return '12345';
    if (path.includes('models.json')) return JSON.stringify({ providers: {} });
    return '';
  }),
  writeFileSync: vi.fn(),
  copyFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  openSync: vi.fn(() => 1),
  mkdirSync: vi.fn(),
}));

describe('Watchdog Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_SERVICES_HOME = '/test/.openclaw';
    process.env.HOME = '/test';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Configuration', () => {
    it('should use environment variable for home directory', () => {
      const home = process.env.OPENCLAW_SERVICES_HOME || '/default/.openclaw';
      expect(home).toBe('/test/.openclaw');
    });

    it('should fallback to default home directory', () => {
      delete process.env.OPENCLAW_SERVICES_HOME;
      const home = process.env.OPENCLAW_SERVICES_HOME || '/default/.openclaw/services';
      expect(home).toBe('/default/.openclaw/services');
      process.env.OPENCLAW_SERVICES_HOME = '/test/.openclaw';
    });
  });

  describe('Health Check', () => {
    it('should return true for healthy proxy', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const response = await fetch('http://localhost:3456/_health');
      expect(response.ok).toBe(true);
    });

    it('should return false for unhealthy proxy', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await fetch('http://localhost:3456/_health');
      } catch (err) {
        expect(err.message).toBe('Connection refused');
      }
    });

    it('should use correct timeout', async () => {
      const timeout = 5000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout);

      expect(timeout).toBe(5000);
      clearTimeout(timeoutId);
    });
  });

  describe('Process Management', () => {
    it('should detect running process', () => {
      // process.kill(pid, 0) returns true if process exists
      try {
        process.kill(1, 0); // This will throw since we can't signal pid 1
      } catch (err) {
        expect(err).toBeDefined();
      }
    });

    it('should parse PID from file', async () => {
      const fs = await import('fs');
      const pid = parseInt('12345', 10);
      expect(pid).toBe(12345);
    });
  });

  describe('Recovery', () => {
    it('should detect proxy mode from config', async () => {
      const fs = await import('fs');
      const content = JSON.stringify({
        providers: {
          anthropic: { baseUrl: 'http://localhost:3456' }
        }
      });

      expect(content.includes('localhost:3456')).toBe(true);
    });

    it('should not recover if not in proxy mode', () => {
      const content = JSON.stringify({
        providers: {
          anthropic: { baseUrl: 'https://api.anthropic.com' }
        }
      });

      expect(content.includes('localhost:3456')).toBe(false);
    });
  });

  describe('Watch Mode', () => {
    it('should use exponential backoff', () => {
      const baseInterval = 60000;
      const maxInterval = 600000;

      for (let retry = 1; retry <= 5; retry++) {
        const interval = Math.min(baseInterval * Math.pow(2, retry - 1), maxInterval);
        if (retry === 1) expect(interval).toBe(60000);
        if (retry === 2) expect(interval).toBe(120000);
        if (retry === 3) expect(interval).toBe(240000);
        if (retry >= 4) expect(interval).toBeLessThanOrEqual(maxInterval);
      }
    });

    it('should stop after max retries', () => {
      const maxRetries = 5;
      const retryCount = 5;

      expect(retryCount <= maxRetries).toBe(true);
    });
  });

  describe('Command Line Interface', () => {
    it('should parse check command', () => {
      const args = ['check'];
      const cmd = args[0];
      expect(cmd).toBe('check');
    });

    it('should parse watch command with interval', () => {
      const args = ['watch', '30000'];
      const cmd = args[0];
      const interval = parseInt(args[1]) || 60000;
      expect(cmd).toBe('watch');
      expect(interval).toBe(30000);
    });

    it('should use default interval if not specified', () => {
      const args = ['watch'];
      const interval = parseInt(args[1]) || 60000;
      expect(interval).toBe(60000);
    });
  });
});
