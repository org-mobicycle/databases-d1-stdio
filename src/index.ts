import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;

if (!token || !accountId) {
  console.error(
    "Error: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID env vars are required"
  );
  process.exit(1);
}

const server = new McpServer({
  name: "cloudflare-d1",
  version: "1.0.0",
});

function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}


function err(e: unknown) {
  const msg = e instanceof Error ? e.message : String(e);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true as const };
}


async function cfFetch(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  const url = `https://api.cloudflare.com/client/v4${path}`;
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };

  if (body) {
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const data = (await res.json()) as {
    success?: boolean;
    errors?: Array<{ message: string }>;
  };

  if (!res.ok || !data.success) {
    const errorMsg =
      data.errors?.[0]?.message || `API error: ${res.statusText}`;
    throw new Error(errorMsg);
  }

  return data;
}

server.tool(
  "d1_list_databases",
  "List all D1 databases",
  {
    name: z.string().optional(),
    page: z.number().optional(),
    per_page: z.number().optional(),
  },
  async (params) => {
    try {
      const searchParams = new URLSearchParams();
      if (params.name) searchParams.append("name", params.name);
      if (params.page) searchParams.append("page", String(params.page));
      if (params.per_page) searchParams.append("per_page", String(params.per_page));

      const query = searchParams.toString();
      const path = `/accounts/${accountId}/d1/database${query ? `?${query}` : ""}`;
      const data = await cfFetch("GET", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "d1_create_database",
  "Create a new D1 database",
  {
    name: z.string(),
    primary_location_hint: z.string().optional(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/d1/database`;
      const body: Record<string, unknown> = { name: params.name };
      if (params.primary_location_hint) body.primary_location_hint = params.primary_location_hint;
      const data = await cfFetch("POST", path, body);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "d1_get_database",
  "Get database details",
  {
    database_id: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/d1/database/${params.database_id}`;
      const data = await cfFetch("GET", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "d1_delete_database",
  "Delete a D1 database",
  {
    database_id: z.string(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/d1/database/${params.database_id}`;
      const data = await cfFetch("DELETE", path);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "d1_query",
  "Execute SQL query on a D1 database",
  {
    database_id: z.string(),
    sql: z.string(),
    params: z.unknown().optional(),
  },
  async (params) => {
    try {
      const path = `/accounts/${accountId}/d1/database/${params.database_id}/query`;
      const body: Record<string, unknown> = { sql: params.sql };
      if (params.params) body.params = params.params;
      const data = await cfFetch("POST", path, body);
      return json(data);
    } catch (e) {
      return err(e);
    }
  }
);

server.tool(
  "d1_status",
  "Show server config and connection info",
  {},
  async () => {
    try {
      return json({
        server: "cloudflare-d1",
        version: "1.0.0",
        accountId,
        tokenStatus: "configured",
      });
    } catch (e) {
      return err(e);
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Cloudflare D1 MCP server running on stdio");
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
