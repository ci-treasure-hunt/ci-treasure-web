// I-141 Stage A: public, read-only MCP server (Streamable HTTP, stateless).
// Agents connect with the full URL, https://citreasurehunt.com/api/mcp. Tools live in
// lib/mcp/tools.ts. /api/ is disallowed in robots.ts on purpose: MCP clients are not crawlers.
import { createMcpHandler } from "mcp-handler";
import { MCP_INSTRUCTIONS, registerCiTreasureHuntTools } from "@/lib/mcp/tools";

const handler = createMcpHandler(registerCiTreasureHuntTools, {
  serverInfo: { name: "ci-treasure-hunt", version: "1.2.0" },
  instructions: MCP_INSTRUCTIONS,
});

export { handler as GET, handler as POST, handler as DELETE };
