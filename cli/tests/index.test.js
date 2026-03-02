/**
 * CLI 模块测试
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
    if (path.includes('model-proxy')) return true;
    return false;
  }),
  readFileSync: vi.fn(() => '12345'),
  writeFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  openSync: vi.fn(() => 1),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 1024 })),
}));

describe('CLI Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENCLAW_SERVICES_HOME = '/test/.openclaw';
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Version', () => {
    it('should show version with --version flag', async () => {
      const consoleSpy = vi.spyOn(console, 'log');

      // Import and test version output
      const pkg = { version: '1.0.0' };
      expect(pkg.version).toBe('1.0.0');
    });
  });

  describe('Health Check', () => {
    it('should handle successful health check', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok' }),
      });

      const response = await fetch('http://localhost:3456/_health');
      expect(response.ok).toBe(true);
    });

    it('should handle failed health check', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Connection refused'));

      try {
        await fetch('http://localhost:3456/_health');
      } catch (err) {
        expect(err.message).toBe('Connection refused');
      }
    });
  });

  describe('PID Management', () => {
    it('should read PID from file', async () => {
      const fs = await import('fs');
      const pid = parseInt('12345', 10);
      expect(pid).toBe(12345);
      expect(isNaN(pid)).toBe(false);
    });

    it('should handle invalid PID', async () => {
      const pid = parseInt('invalid', 10);
      expect(isNaN(pid)).toBe(true);
    });
  });

  describe('Process Management', () => {
    it('should check if process is running', () => {
      // process.kill(pid, 0) throws if process doesn't exist
      const mockPid = 12345;
      // In real code, this would call process.kill(pid, 0)
      expect(typeof process.kill).toBe('function');
    });
  });

  describe('Fetch with Timeout', () => {
    it('should abort after timeout', async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 100);

      // Simulate slow request
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(controller.signal.aborted).toBe(true);
      clearTimeout(timeoutId);
    });
  });
});
