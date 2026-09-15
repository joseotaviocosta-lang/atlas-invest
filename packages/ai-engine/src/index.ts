export const AI_ENGINE_VERSION = '0.1.0';

export interface AIToolParameter {
  name: string;
  type: string;
  description: string;
  required: boolean;
}

export interface AITool {
  name: string;
  description: string;
  parameters: AIToolParameter[];
  execute(args: Record<string, unknown>): Promise<unknown>;
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCalls?: Array<{ id: string; name: string; arguments: Record<string, unknown> }>;
}

export interface AICompletionOptions {
  temperature?: number;
  maxTokens?: number;
  tools?: AITool[];
}

/**
 * Future AI Provider contract (LLM abstraction for contextual insights and RAG).
 * Pure interface contract - zero LLM integrations or prompts in Phase 0B.
 */
export interface AIProvider {
  complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AIMessage>;
  registerTool(tool: AITool): void;
}
