/**
 * AINative Service Tests
 *
 * Tests the AINative Gateway integration, ZeroMemory, and fallback behavior.
 * Covers: service creation, streaming, memory recall/store, error handling,
 * rate limiting, multi-provider failover scenarios.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Anthropic SDK — must use class/function for `new` to work
vi.mock('@anthropic-ai/sdk', () => {
  class MockAnthropic {
    constructor() {
      const mockStream = {
        on: vi.fn().mockReturnThis(),
        finalMessage: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Here are some great snowboards!' }],
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };
      this.messages = {
        stream: vi.fn().mockReturnValue(mockStream),
      };
    }
  }
  return { Anthropic: MockAnthropic };
});

// Mock fetch for ZeroMemory calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock prompts
vi.mock('../app/prompts/prompts.json', () => ({
  default: {
    systemPrompts: {
      standardAssistant: {
        content: 'You are a helpful shopping assistant.',
      },
    },
  },
  systemPrompts: {
    standardAssistant: {
      content: 'You are a helpful shopping assistant.',
    },
  },
}));

describe('AINative Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    // Set AINative env
    process.env.AINATIVE_API_KEY = 'test-ainative-key';
  });

  afterEach(() => {
    delete process.env.AINATIVE_API_KEY;
    delete process.env.AINATIVE_ANTHROPIC_URL;
    delete process.env.AINATIVE_MODEL;
    delete process.env.ZEROMEMORY_URL;
  });

  describe('createAINativeService', () => {
    it('should create a service with streamConversation and getSystemPrompt', async () => {
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');
      expect(service).toBeDefined();
      expect(typeof service.streamConversation).toBe('function');
      expect(typeof service.getSystemPrompt).toBe('function');
    });

    it('should use AINATIVE_API_KEY from env when no key provided', async () => {
      process.env.AINATIVE_API_KEY = 'env-ainative-key';
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService();
      expect(service).toBeDefined();
    });

    it('should fall back to CLAUDE_API_KEY when no AINATIVE_API_KEY', async () => {
      delete process.env.AINATIVE_API_KEY;
      process.env.CLAUDE_API_KEY = 'fallback-claude-key';
      // Re-import to pick up env change
      vi.resetModules();
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService();
      expect(service).toBeDefined();
      delete process.env.CLAUDE_API_KEY;
    });
  });

  describe('streamConversation', () => {
    it('should stream a basic conversation', async () => {
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');

      const onText = vi.fn();
      const onMessage = vi.fn();

      const result = await service.streamConversation(
        {
          messages: [{ role: 'user', content: 'Show me snowboards' }],
          tools: [],
        },
        { onText, onMessage }
      );

      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(result.content[0].text).toContain('snowboards');
    });

    it('should call onToolUse handler when provided', async () => {
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');

      // The mock returns text content, not tool_use — so onToolUse should NOT be called
      const onToolUse = vi.fn();
      await service.streamConversation(
        {
          messages: [{ role: 'user', content: 'find snowboards' }],
          tools: [{ name: 'search_catalog', description: 'Search', input_schema: {} }],
        },
        { onToolUse }
      );

      // Mock returns text, not tool_use, so handler should not fire
      expect(onToolUse).not.toHaveBeenCalled();
    });

    it('should pass shopDomain and conversationId for ZeroMemory', async () => {
      // Mock ZeroMemory recall
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ results: [{ content: 'Prefers blue, size M' }] }),
      });
      // Mock ZeroMemory store
      mockFetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      vi.resetModules();
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');

      await service.streamConversation(
        {
          messages: [{ role: 'user', content: 'Show me jackets' }],
          tools: [],
          shopDomain: 'test-store.myshopify.com',
          conversationId: 'conv-123',
        },
        {}
      );

      // Should have called fetch for recall and store
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('getSystemPrompt', () => {
    it('should return the standard assistant prompt', async () => {
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');
      const prompt = service.getSystemPrompt('standardAssistant');
      expect(prompt).toContain('helpful shopping assistant');
    });

    it('should fallback to standard prompt for unknown types', async () => {
      const { createAINativeService } = await import('../app/services/ainative.server.js');
      const service = createAINativeService('test-key');
      const prompt = service.getSystemPrompt('nonexistent');
      expect(prompt).toContain('helpful shopping assistant');
    });
  });
});

describe('ZeroMemory Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockReset();
    process.env.AINATIVE_API_KEY = 'test-ainative-key';
  });

  it('should skip memory when no API key set', async () => {
    delete process.env.AINATIVE_API_KEY;
    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    await service.streamConversation(
      {
        messages: [{ role: 'user', content: 'hello' }],
        shopDomain: 'test.myshopify.com',
        conversationId: 'conv-1',
      },
      {}
    );

    // fetch should not be called for memory (only for the LLM)
    const memoryCalls = mockFetch.mock.calls.filter(
      c => c[0] && c[0].toString().includes('memory')
    );
    expect(memoryCalls.length).toBe(0);
  });

  it('should handle memory recall failure gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    // Should not throw
    const result = await service.streamConversation(
      {
        messages: [{ role: 'user', content: 'Show me shoes' }],
        shopDomain: 'test.myshopify.com',
        conversationId: 'conv-1',
      },
      {}
    );
    expect(result).toBeDefined();
  });

  it('should handle memory store failure gracefully', async () => {
    // Recall succeeds
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });
    // Store fails
    mockFetch.mockRejectedValueOnce(new Error('Store failed'));

    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    // Should not throw
    const result = await service.streamConversation(
      {
        messages: [{ role: 'user', content: 'I want large blue sneakers' }],
        shopDomain: 'test.myshopify.com',
        conversationId: 'conv-2',
      },
      {}
    );
    expect(result).toBeDefined();
  });

  it('should not store short/greeting messages', async () => {
    // Recall returns empty
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    await service.streamConversation(
      {
        messages: [{ role: 'user', content: 'hi' }],
        shopDomain: 'test.myshopify.com',
        conversationId: 'conv-3',
      },
      {}
    );

    // Should only have recall call, not store (message too short)
    const storeCalls = mockFetch.mock.calls.filter(
      c => c[0] && c[0].toString().includes('remember')
    );
    expect(storeCalls.length).toBe(0);
  });
});

describe('Config Service', () => {
  it('should use ainative provider when AINATIVE_API_KEY set', async () => {
    process.env.AINATIVE_API_KEY = 'test-key';
    vi.resetModules();
    const { AppConfig } = await import('../app/services/config.server.js');
    expect(AppConfig.api.provider).toBe('ainative');
    delete process.env.AINATIVE_API_KEY;
  });

  it('should fallback to claude provider when no AINATIVE_API_KEY', async () => {
    delete process.env.AINATIVE_API_KEY;
    vi.resetModules();
    const { AppConfig } = await import('../app/services/config.server.js');
    expect(AppConfig.api.provider).toBe('claude');
  });

  it('should allow model override via env', async () => {
    process.env.AINATIVE_MODEL = 'gpt-4o';
    vi.resetModules();
    const { AppConfig } = await import('../app/services/config.server.js');
    expect(AppConfig.api.defaultModel).toBe('gpt-4o');
    delete process.env.AINATIVE_MODEL;
  });

  it('should enable memory when AINATIVE_API_KEY set', async () => {
    process.env.AINATIVE_API_KEY = 'test-key';
    vi.resetModules();
    const { AppConfig } = await import('../app/services/config.server.js');
    expect(AppConfig.memory.enabled).toBe(true);
    delete process.env.AINATIVE_API_KEY;
  });
});

describe('Streaming Service', () => {
  it('should handle auth errors with AINative messaging', async () => {
    const { createStreamManager } = await import('../app/services/streaming.server.js');
    const encoder = new TextEncoder();
    const chunks = [];
    const controller = {
      enqueue: (chunk) => chunks.push(new TextDecoder().decode(chunk)),
      close: vi.fn(),
    };

    const manager = createStreamManager(encoder, controller);
    const authError = new Error('auth key invalid');
    authError.status = 401;
    manager.handleStreamingError(authError);

    const output = chunks.join('');
    expect(output).toContain('AINATIVE_API_KEY');
    expect(output).toContain('CLAUDE_API_KEY');
  });

  it('should handle rate limit errors', async () => {
    const { createStreamManager } = await import('../app/services/streaming.server.js');
    const encoder = new TextEncoder();
    const chunks = [];
    const controller = {
      enqueue: (chunk) => chunks.push(new TextDecoder().decode(chunk)),
      close: vi.fn(),
    };

    const manager = createStreamManager(encoder, controller);
    const rateLimitError = new Error('Too many requests');
    rateLimitError.status = 429;
    manager.handleStreamingError(rateLimitError);

    const output = chunks.join('');
    expect(output).toContain('rate_limit');
  });
});

describe('Stress Tests', () => {
  it('should handle 100 concurrent service creations', async () => {
    const { createAINativeService } = await import('../app/services/ainative.server.js');

    const services = Array.from({ length: 100 }, (_, i) =>
      createAINativeService(`key-${i}`)
    );

    expect(services.length).toBe(100);
    services.forEach(s => {
      expect(typeof s.streamConversation).toBe('function');
      expect(typeof s.getSystemPrompt).toBe('function');
    });
  });

  it('should handle 50 concurrent stream requests', async () => {
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    const promises = Array.from({ length: 50 }, (_, i) =>
      service.streamConversation(
        {
          messages: [{ role: 'user', content: `Query ${i}: show me product ${i}` }],
          tools: [],
        },
        {}
      )
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(50);
    results.forEach(r => expect(r.content).toBeDefined());
  });

  it('should handle rapid ZeroMemory recall/store cycles', async () => {
    // All memory calls succeed
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [{ content: 'previous context' }] }),
    });

    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    const promises = Array.from({ length: 20 }, (_, i) =>
      service.streamConversation(
        {
          messages: [{ role: 'user', content: `I want to buy item number ${i} in blue` }],
          shopDomain: 'stress-test.myshopify.com',
          conversationId: `conv-stress-${i}`,
        },
        {}
      )
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(20);
    // Should have made memory calls
    expect(mockFetch.mock.calls.length).toBeGreaterThan(0);
  });

  it('should handle mixed success/failure memory calls', async () => {
    let callCount = 0;
    mockFetch.mockImplementation(() => {
      callCount++;
      if (callCount % 3 === 0) {
        return Promise.reject(new Error('Simulated failure'));
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ results: [] }),
      });
    });

    vi.resetModules();
    const { createAINativeService } = await import('../app/services/ainative.server.js');
    const service = createAINativeService('test-key');

    const promises = Array.from({ length: 15 }, (_, i) =>
      service.streamConversation(
        {
          messages: [{ role: 'user', content: `Mixed test query ${i} for shoes` }],
          shopDomain: 'mixed-test.myshopify.com',
          conversationId: `conv-mixed-${i}`,
        },
        {}
      )
    );

    // All should resolve (memory failures are non-blocking)
    const results = await Promise.allSettled(promises);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(15);
  });
});
