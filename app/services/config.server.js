/**
 * Configuration Service — Powered by AINative Gateway
 * Centralizes all configuration values for the chat service.
 *
 * Set AINATIVE_API_KEY to route through AINative (multi-provider, metered).
 * Falls back to CLAUDE_API_KEY for direct Anthropic access.
 */

export const AppConfig = {
  // API Configuration — AINative Gateway with fallback to direct Claude
  api: {
    defaultModel: process.env.AINATIVE_MODEL || 'claude-sonnet-4-20250514',
    maxTokens: 2000,
    defaultPromptType: 'standardAssistant',
    provider: process.env.AINATIVE_API_KEY ? 'ainative' : 'claude',
  },

  // Error Message Templates
  errorMessages: {
    missingMessage: "Message is required",
    apiUnsupported: "This endpoint only supports server-sent events (SSE) requests or history requests.",
    authFailed: "Authentication failed with AI service",
    apiKeyError: "Please check your AINATIVE_API_KEY or CLAUDE_API_KEY in environment variables",
    rateLimitExceeded: "Rate limit exceeded",
    rateLimitDetails: "Please try again later",
    genericError: "Failed to get response from AI service"
  },

  // Tool Configuration
  tools: {
    productSearchName: "search_shop_catalog",
    maxProductsToDisplay: 3
  },

  // ZeroMemory Configuration (persistent shopper context)
  memory: {
    enabled: !!process.env.AINATIVE_API_KEY,
    url: process.env.ZEROMEMORY_URL || "https://api.ainative.studio/api/v1/public/memory/v2",
  }
};

export default AppConfig;
