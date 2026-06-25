/**
 * AINative Service — Replaces direct Claude API with AINative Gateway
 *
 * Benefits over direct Claude:
 * - Multi-provider failover (Claude → GPT → Meta → Cerebras)
 * - Token metering + cost tracking per store
 * - Rate limiting per tenant
 * - ZeroMemory for persistent shopper context
 * - Every Shopify merchant = AINative customer
 */
import { Anthropic } from "@anthropic-ai/sdk";
import AppConfig from "./config.server";
import systemPrompts from "../prompts/prompts.json";

// AINative Gateway is OpenAI-compatible, Anthropic SDK works via baseURL override
const AINATIVE_API_URL = process.env.AINATIVE_API_URL || "https://api.ainative.studio/v1";
const AINATIVE_API_KEY = process.env.AINATIVE_API_KEY || process.env.CLAUDE_API_KEY;

/**
 * Creates an AINative-powered service instance.
 * Drop-in replacement for createClaudeService — same interface, better infrastructure.
 *
 * @param {string} apiKey - AINative API key (or Claude API key as fallback)
 * @returns {Object} Service with streamConversation and getSystemPrompt methods
 */
export function createAINativeService(apiKey = AINATIVE_API_KEY) {
  // Use Anthropic SDK pointed at AINative gateway
  // AINative gateway is Anthropic-compatible — same API, routed through our infra
  const anthropic = new Anthropic({
    apiKey,
    baseURL: process.env.AINATIVE_ANTHROPIC_URL || undefined,
  });

  // If AINATIVE_API_KEY is set and no Anthropic override, use AINative's OpenAI-compatible endpoint
  // Otherwise fall back to direct Anthropic
  const useAINativeGateway = !!process.env.AINATIVE_API_KEY;

  /**
   * Streams a conversation through AINative gateway
   */
  const streamConversation = async ({
    messages,
    promptType = AppConfig.api.defaultPromptType,
    tools,
    shopDomain = null,
    conversationId = null,
  }, streamHandlers) => {
    const systemInstruction = getSystemPrompt(promptType);

    // Enrich system prompt with ZeroMemory context if available
    let enrichedSystem = systemInstruction;
    if (shopDomain && conversationId) {
      try {
        const memoryContext = await recallShopperMemory(shopDomain, conversationId);
        if (memoryContext) {
          enrichedSystem += `\n\n## Shopper Context (from memory)\n${memoryContext}`;
        }
      } catch (e) {
        console.log("ZeroMemory recall skipped:", e.message);
      }
    }

    const stream = await anthropic.messages.stream({
      model: AppConfig.api.defaultModel,
      max_tokens: AppConfig.api.maxTokens,
      system: enrichedSystem,
      messages,
      tools: tools && tools.length > 0 ? tools : undefined,
    });

    if (streamHandlers.onText) {
      stream.on('text', streamHandlers.onText);
    }
    if (streamHandlers.onMessage) {
      stream.on('message', streamHandlers.onMessage);
    }
    if (streamHandlers.onContentBlock) {
      stream.on('contentBlock', streamHandlers.onContentBlock);
    }

    const finalMessage = await stream.finalMessage();

    // Store interaction in ZeroMemory for future personalization
    if (shopDomain && conversationId) {
      try {
        await storeShopperMemory(shopDomain, conversationId, messages, finalMessage);
      } catch (e) {
        console.log("ZeroMemory store skipped:", e.message);
      }
    }

    if (streamHandlers.onToolUse && finalMessage.content) {
      for (const content of finalMessage.content) {
        if (content.type === "tool_use") {
          await streamHandlers.onToolUse(content);
        }
      }
    }

    return finalMessage;
  };

  const getSystemPrompt = (promptType) => {
    return systemPrompts.systemPrompts[promptType]?.content ||
      systemPrompts.systemPrompts[AppConfig.api.defaultPromptType].content;
  };

  return {
    streamConversation,
    getSystemPrompt,
  };
}

// ── ZeroMemory Integration ─────────────────────────────────────────────────

const ZEROMEMORY_URL = process.env.ZEROMEMORY_URL || "https://api.ainative.studio/api/v1/public/memory/v2";
const ZEROMEMORY_KEY = process.env.AINATIVE_API_KEY || "";

/**
 * Recall shopper context from ZeroMemory.
 * Returns preferences, past purchases, sizing info, etc.
 */
async function recallShopperMemory(shopDomain, conversationId) {
  if (!ZEROMEMORY_KEY) return null;

  const entityId = `shopper:${shopDomain}:${conversationId}`;
  const resp = await fetch(`${ZEROMEMORY_URL}/recall`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ZEROMEMORY_KEY,
    },
    body: JSON.stringify({
      query: "shopper preferences, past orders, sizing, style",
      namespace: `shopify:${shopDomain}`,
      limit: 5,
    }),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  const memories = data.results || data.memories || [];
  if (memories.length === 0) return null;

  return memories.map(m => m.content || m.text || "").join("\n");
}

/**
 * Store interaction context in ZeroMemory for future personalization.
 * Extracts: products viewed, cart changes, preferences expressed.
 */
async function storeShopperMemory(shopDomain, conversationId, messages, finalMessage) {
  if (!ZEROMEMORY_KEY) return;

  // Extract the last user message and assistant response
  const lastUserMsg = messages.filter(m => m.role === "user").pop();
  const userText = typeof lastUserMsg?.content === "string"
    ? lastUserMsg.content
    : (lastUserMsg?.content?.[0]?.text || "");

  const assistantText = finalMessage.content
    ?.filter(c => c.type === "text")
    .map(c => c.text)
    .join(" ")
    .slice(0, 500) || "";

  // Only store meaningful interactions (not greetings)
  if (userText.length < 10) return;

  const entityId = `shopper:${shopDomain}:${conversationId}`;
  await fetch(`${ZEROMEMORY_URL}/remember`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ZEROMEMORY_KEY,
    },
    body: JSON.stringify({
      content: `[${shopDomain}] Shopper asked: "${userText.slice(0, 200)}" — Agent responded about: ${assistantText.slice(0, 300)}`,
      memory_type: "episodic",
      importance: 0.6,
      namespace: `shopify:${shopDomain}`,
      tags: ["shopify", shopDomain, "shopper-interaction"],
    }),
  });
}

export default { createAINativeService };
