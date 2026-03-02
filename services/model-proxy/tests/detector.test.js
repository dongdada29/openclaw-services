/**
 * 供应商检测测试
 */
import { describe, it, expect } from 'vitest';
import { detectProvider, rewritePath } from '../src/providers/detector.js';

describe('Provider Detector', () => {
  describe('detectProvider', () => {
    it('should detect by X-Provider header', () => {
      const req = {
        url: '/v1/chat/completions',
        headers: { 'x-provider': 'zai' }
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('zai');
      expect(result.host).toBe('api.z.ai');
    });

    it('should detect Anthropic by API key prefix', () => {
      const req = {
        url: '/v1/chat/completions',
        headers: { 'x-api-key': 'sk-ant-test123' }
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('anthropic');
    });

    it('should detect OpenAI by API key prefix', () => {
      const req = {
        url: '/v1/chat/completions',
        headers: { 'authorization': 'Bearer sk-proj-test' }
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('openai');
    });

    it('should detect by path pattern', () => {
      const req = {
        url: '/v1/messages',
        headers: {}
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('anthropic');
    });

    it('should detect z.ai by /api/paas path', () => {
      const req = {
        url: '/api/paas/v4/chat/completions',
        headers: {}
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('zai');
    });

    it('should default to OpenAI', () => {
      const req = {
        url: '/some/unknown/path',
        headers: {}
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('openai');
    });

    it('should prefer X-Provider header over API key', () => {
      const req = {
        url: '/v1/chat/completions',
        headers: {
          'x-provider': 'zhipu',
          'authorization': 'Bearer sk-test'
        }
      };
      
      const result = detectProvider(req);
      expect(result.providerId).toBe('zhipu');
    });
  });

  describe('rewritePath', () => {
    it('should rewrite /zai-cn/* to zhipu provider', () => {
      const req = { url: '/zai-cn/api/paas/v4/chat' };
      const provider = { providerId: 'zai', host: 'api.z.ai', name: 'z.ai' };
      
      const result = rewritePath(req, provider);
      
      expect(result.path).toBe('/api/paas/v4/chat');
      expect(result.provider.host).toBe('open.bigmodel.cn');
      expect(result.provider.providerId).toBe('zhipu');
    });

    it('should rewrite /zai-global/*', () => {
      const req = { url: '/zai-global/api/paas/v4/chat' };
      const provider = { providerId: 'zai', host: 'api.z.ai' };
      
      const result = rewritePath(req, provider);
      
      expect(result.path).toBe('/api/paas/v4/chat');
    });

    it('should keep path unchanged if no rewrite needed', () => {
      const req = { url: '/v1/chat/completions' };
      const provider = { providerId: 'openai', host: 'api.openai.com' };
      
      const result = rewritePath(req, provider);
      
      expect(result.path).toBe('/v1/chat/completions');
    });
  });
});
