import { ErrorCode, toolError, type ToolError } from '@olist/contracts'

export { ErrorCode, toolError, type ToolError }

export function invalidInput(message: string, tool: string): ToolError {
  return toolError(ErrorCode.INVALID_INPUT, message, tool)
}

export function invalidDateRange(message: string, tool: string): ToolError {
  return toolError(ErrorCode.INVALID_DATE_RANGE, message, tool)
}

export function unsupportedMetric(metric: string, tool: string): ToolError {
  return toolError(ErrorCode.UNSUPPORTED_METRIC, `Unsupported metric: ${metric}`, tool)
}

export function emptyResult(tool: string): ToolError {
  return toolError(ErrorCode.EMPTY_RESULT, `No matching records found for the supplied filters.`, tool)
}

export function databaseError(message: string, tool: string): ToolError {
  return toolError(ErrorCode.DATABASE_ERROR, message, tool)
}

export function internalError(message: string, tool: string): ToolError {
  return toolError(ErrorCode.INTERNAL_ERROR, message, tool)
}
