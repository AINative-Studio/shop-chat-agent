# Shopify AI Shopping Agent — Powered by AINative

A Shopify app that embeds an AI-powered chat widget on your storefront. Shoppers can search for products, ask about policies, build carts, and checkout — all through conversation. Built on Shopify's [Model Context Protocol](https://modelcontextprotocol.io/) (MCP).

**Forked from [Shopify/shop-chat-agent](https://github.com/Shopify/shop-chat-agent) and enhanced with AINative infrastructure.**

## What's Different from Shopify's Version

| Feature | Shopify Original | AINative Version |
|---------|-----------------|------------------|
| **LLM Provider** | Claude only (direct API) | AINative Gateway — multi-provider failover (Claude, GPT, Meta, Cerebras) |
| **Shopper Memory** | None (stateless) | ZeroMemory — remembers preferences, sizes, past orders across sessions |
| **Cost Tracking** | None | Per-store token metering and usage analytics |
| **Rate Limiting** | None | Per-tenant rate limiting via gateway |
| **Failover** | Single provider | Automatic failover across 4+ providers |

## Quick Start

```bash
# Clone
git clone git@github.com:AINative-Studio/shop-chat-agent.git
cd shop-chat-agent
npm install

# Configure (choose one)
# Option A: AINative Gateway (recommended)
echo "AINATIVE_API_KEY=your_ainative_key" >> .env

# Option B: Direct Claude (fallback)
echo "CLAUDE_API_KEY=your_claude_key" >> .env

# Add Shopify credentials
echo "SHOPIFY_API_KEY=your_app_client_id" >> .env

# Run
npm run dev
```

Get your AINative API key at [ainative.studio](https://ainative.studio) — provision in 60 seconds.

## Features

- **Natural-language product discovery** — "show me winter jackets under $200"
- **Smart cart management** — add, remove, update quantities through conversation
- **Store policy & FAQ lookup** — shipping, returns, languages
- **Order tracking** — "where's my last order?"
- **Persistent shopper memory** (AINative) — remembers preferences across visits
- **Multi-provider AI** (AINative) — automatic failover, never goes down

## Architecture

```
Shopper → Chat Widget → React Router Backend → AINative Gateway → LLM
                                    ↕                    ↕
                              Shopify MCP          ZeroMemory
                          (products, cart,     (shopper preferences,
                           orders, policies)    past interactions)
```

### Components

1. **Backend**: React Router server handling chat, MCP client, AINative/Claude integration
2. **Chat UI**: Shopify theme extension — the customer-facing chat bubble
3. **AINative Service** (`app/services/ainative.server.js`): Gateway integration + ZeroMemory

### MCP Tools (from Shopify)

| Tool | What it does |
|------|-------------|
| `search_catalog` | Natural language product search |
| `update_cart` | Add/remove/update cart items |
| `get_cart` | View current cart |
| `search_shop_policies_and_faqs` | Store policies, shipping, returns |
| `get_order_status` | Look up a specific order |
| `get_most_recent_order_status` | Check latest order |

### Tech Stack

- **Framework**: [React Router](https://reactrouter.com/)
- **AI**: [AINative Gateway](https://ainative.studio) (Claude, GPT, Meta, Cerebras)
- **Memory**: [ZeroMemory](https://docs.ainative.studio) — persistent cognitive memory
- **Shopify**: [@shopify/shopify-app-react-router](https://www.npmjs.com/package/@shopify/shopify-app-react-router)
- **Database**: SQLite (via Prisma) for session storage

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AINATIVE_API_KEY` | Recommended | AINative Gateway key (multi-provider + memory) |
| `CLAUDE_API_KEY` | Fallback | Direct Anthropic key (if no AINative key) |
| `SHOPIFY_API_KEY` | Yes | Your Shopify app client ID |
| `AINATIVE_MODEL` | No | Override default model (default: claude-sonnet-4) |
| `REDIRECT_URL` | No | OAuth callback URL |

## Customization

- **Edit the prompt**: `app/prompts/prompts.json`
- **Change the chat UI**: `extensions/` directory
- **Switch models**: Set `AINATIVE_MODEL` env var
- **Add memory tags**: Modify `app/services/ainative.server.js`

## NPM Package

Also available as an npm package:

```bash
npx ainative-shopify-mcp
```

## Deployment

Follow standard [Shopify app deployment](https://shopify.dev/docs/apps/deployment/web). Works on Railway, Vercel, or any Node.js host.

## Links

- [AINative Studio](https://ainative.studio) — Get your API key
- [ZeroMemory Docs](https://docs.ainative.studio) — Persistent agent memory
- [Shopify MCP Docs](https://shopify.dev/docs/apps/build/storefront-mcp) — Storefront MCP reference
- [Original Shopify Repo](https://github.com/Shopify/shop-chat-agent)

Built by AINative Dev Team
