// I-141 Stage A: public, read-only MCP server (Streamable HTTP, stateless).
// Agents connect with the full URL, https://citreasurehunt.com/api/mcp. Tools live in
// lib/mcp/tools.ts. /api/ is disallowed in robots.ts on purpose: MCP clients are not crawlers.
import { createMcpHandler } from "mcp-handler";
import { MCP_INSTRUCTIONS, registerCiTreasureHuntTools } from "@/lib/mcp/tools";

// No call takes more than a few seconds. Without a cap, anything that holds a request open runs
// to Vercel's 300 s default and is billed for all of it (2026-10-20: ~20 such requests an hour).
export const maxDuration = 60;

const handler = createMcpHandler(registerCiTreasureHuntTools, {
  serverInfo: { name: "ci-treasure-hunt", version: "1.2.0" },
  instructions: MCP_INSTRUCTIONS,
  // The tool list is fixed per deploy, so there is nothing to announce. Advertising listChanged
  // made 2026-07-28 clients open a `subscriptions/listen` SSE stream that a serverless function
  // holds until the timeout, then reopen it. Don't advertise it, and refuse the stream in-band
  // for clients that ask anyway.
  capabilities: { tools: { listChanged: false } },
  maxSubscriptions: 0,
});

export { handler as GET, handler as POST, handler as DELETE };
