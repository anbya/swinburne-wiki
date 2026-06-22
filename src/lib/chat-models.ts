export const DEFAULT_CHAT_MODEL = 'qwen3:14b'

export const CHAT_MODEL_OPTIONS = [
  { value: DEFAULT_CHAT_MODEL, label: 'Qwen 3 14B', provider: 'Swinburne local model' },
  { value: 'gpt-4o', label: 'GPT-4o', provider: 'OpenAI' },
  { value: 'gpt-4.1', label: 'GPT-4.1', provider: 'OpenAI' },
  { value: 'claude-3-5-sonnet', label: 'Claude 3.5 Sonnet', provider: 'Anthropic' },
  { value: 'claude-3-7-sonnet', label: 'Claude 3.7 Sonnet', provider: 'Anthropic' },
  { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', provider: 'Google' },
  { value: 'llama3.1:70b', label: 'Llama 3.1 70B', provider: 'Meta' },
  { value: 'mistral-large', label: 'Mistral Large', provider: 'Mistral AI' },
] as const

export function isSupportedChatModel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    CHAT_MODEL_OPTIONS.some((option) => option.value === value)
  )
}

export function getChatModelOption(value: string | null | undefined) {
  if (!value) return null
  return CHAT_MODEL_OPTIONS.find((option) => option.value === value) ?? null
}

export function getChatModelDisplayName(value: string | null | undefined) {
  const option = getChatModelOption(value)
  if (option) return option.label

  const normalized = value?.trim() ?? ''
  return normalized || 'Unknown model'
}

export function getChatModelProviderName(value: string | null | undefined) {
  const option = getChatModelOption(value)
  if (option) return option.provider

  return null
}
