export const ErrorCode = {
  INVALID_INPUT: 'INVALID_INPUT',
  INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
  UNSUPPORTED_METRIC: 'UNSUPPORTED_METRIC',
  UNSUPPORTED_GROUPING: 'UNSUPPORTED_GROUPING',
  UNKNOWN_CATEGORY: 'UNKNOWN_CATEGORY',
  UNKNOWN_STATE: 'UNKNOWN_STATE',
  EMPTY_RESULT: 'EMPTY_RESULT',
  QUERY_TIMEOUT: 'QUERY_TIMEOUT',
  DATABASE_ERROR: 'DATABASE_ERROR',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  DATA_VERSION_CONFLICT: 'DATA_VERSION_CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode]

export interface ToolError {
  code: ErrorCode
  message: string
  retryable?: boolean
  tool?: string
}

export function toolError(code: ErrorCode, message: string, tool?: string): ToolError {
  return { code, message, retryable: code === ErrorCode.QUERY_TIMEOUT || code === ErrorCode.DATABASE_ERROR, tool }
}
