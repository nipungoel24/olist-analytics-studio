import type { Client as McpClientType } from '@modelcontextprotocol/client'
import {
  ToolResultSchema,
  ToolErrorSchema,
  type ToolResponse,
  type ToolErrorResponse,
} from '@olist/contracts'

// MCP client adapter: the single place where SDK-level validation/protocol
// errors are normalized into the structured application error contract
// (Architecture.md §5). No other layer parses random error strings.

export interface ToolCallAdapter {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResponse>
  listTools(): Promise<string[]>
  close(): Promise<void>
}

function normalizeErrorText(text: string, toolName: string): ToolErrorResponse {
  const trimmed = text.slice(0, 500)
  const code = /input validation error/i.test(trimmed) ? 'INVALID_INPUT' : 'INTERNAL_ERROR'
  return {
    ok: false,
    tool: toolName,
    error: {
      code,
      message: trimmed,
    },
  }
}

export function createMcpAdapter(
  client: Pick<McpClientType, 'callTool' | 'listTools' | 'close'>,
  logger?: (msg: string) => void
): ToolCallAdapter {
  return {
    async callTool(name, args) {
      let result: Awaited<ReturnType<McpClientType['callTool']>>
      try {
        result = await client.callTool({ name, arguments: args })
      } catch (err) {
        const msg = err instanceof Error && err.message ? err.message : String(err)
        if (logger) logger(`[adapter] tool call ${name} failed at transport: ${msg}`)
        return {
          ok: false,
          tool: name,
          error: {
            code: 'DATA_UNAVAILABLE',
            message: `MCP transport failure for tool ${name}: ${msg.slice(0, 400)}`,
          },
        }
      }

      if (result.isError) {
        const text = (result.content ?? [])
          .map((c) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text?: unknown }).text ?? '') : ''))
          .join('')
          .trim()
        return normalizeErrorText(text || 'Unknown tool error', name)
      }

      const text = (result.content ?? [])
        .map((c) => (typeof c === 'object' && c !== null && 'text' in c ? String((c as { text?: unknown }).text ?? '') : ''))
        .join('')
        .trim()

      try {
        const parsed = JSON.parse(text) as unknown
        const asResult = ToolResultSchema.safeParse(parsed)
        if (asResult.success) {
          return asResult.data
        }
        const asError = ToolErrorSchema.safeParse(parsed)
        if (asError.success) {
          return asError.data
        }
        return normalizeErrorText(`Tool ${name} returned an unrecognized response shape`, name)
      } catch {
        return normalizeErrorText(text || `Tool ${name} returned an empty response`, name)
      }
    },

    async listTools() {
      const result = await client.listTools()
      return result.tools.map((t) => t.name)
    },

    async close() {
      await client.close().catch(() => {})
    },
  }
}
