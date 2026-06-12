/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Unified LLM Provider Abstraction
 * Supports: Gemini, OpenAI, Anthropic, Grok (xAI), DeepSeek, Ollama
 *
 * Design:
 *  - OpenAI, Grok, DeepSeek, and Ollama all use OpenAI-compatible APIs
 *    (same request/response format, different base URLs).
 *  - Anthropic uses its own Messages API format.
 *  - Gemini uses the @google/genai SDK.
 *  - A single `generateText()` call picks the active provider based on
 *    env config or the `LLM_PROVIDER` setting in the DB.
 */

import { GoogleGenAI } from '@google/genai';
import db from './db.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type LLMProviderName =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'grok'
  | 'deepseek'
  | 'ollama';

export interface LLMProviderConfig {
  name: LLMProviderName;
  label: string;
  defaultModel: string;
  models: string[];
  requiresApiKey: boolean;
  envKeyName: string;
  baseUrl?: string;
}

export interface LLMGenerateOptions {
  /** Override which provider to use (defaults to active provider) */
  provider?: LLMProviderName;
  /** Override which model to use (defaults to provider's default) */
  model?: string;
  /** System prompt / instruction */
  systemPrompt?: string;
  /** User prompt */
  prompt: string;
  /** Max tokens to generate */
  maxTokens?: number;
  /** Temperature 0–2 */
  temperature?: number;
}

export interface LLMGenerateResult {
  text: string;
  provider: LLMProviderName;
  model: string;
}

export interface LLMEmbeddingOptions {
  /** Override which provider to use */
  provider?: LLMProviderName;
  /** Override model */
  model?: string;
  /** Text to embed */
  text: string;
}

export interface LLMEmbeddingResult {
  embedding: number[];
  provider: LLMProviderName;
  model: string;
}

// ── Provider Configurations ──────────────────────────────────────────────────

export const PROVIDER_CONFIGS: Record<LLMProviderName, LLMProviderConfig> = {
  gemini: {
    name: 'gemini',
    label: 'Google Gemini',
    defaultModel: 'gemini-2.0-flash',
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-2.5-pro'],
    requiresApiKey: true,
    envKeyName: 'GEMINI_API_KEY',
  },
  openai: {
    name: 'openai',
    label: 'OpenAI',
    defaultModel: 'gpt-4o-mini',
    models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'o3-mini'],
    requiresApiKey: true,
    envKeyName: 'OPENAI_API_KEY',
    baseUrl: 'https://api.openai.com/v1',
  },
  anthropic: {
    name: 'anthropic',
    label: 'Anthropic',
    defaultModel: 'claude-sonnet-4-20250514',
    models: ['claude-sonnet-4-20250514', 'claude-haiku-4-20250514', 'claude-3-5-haiku-20241022'],
    requiresApiKey: true,
    envKeyName: 'ANTHROPIC_API_KEY',
  },
  grok: {
    name: 'grok',
    label: 'xAI Grok',
    defaultModel: 'grok-3-mini-fast',
    models: ['grok-3-mini-fast', 'grok-3-mini', 'grok-3-fast', 'grok-3'],
    requiresApiKey: true,
    envKeyName: 'GROK_API_KEY',
    baseUrl: 'https://api.x.ai/v1',
  },
  deepseek: {
    name: 'deepseek',
    label: 'DeepSeek',
    defaultModel: 'deepseek-chat',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresApiKey: true,
    envKeyName: 'DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  ollama: {
    name: 'ollama',
    label: 'Ollama (Local)',
    defaultModel: 'llama3',
    models: ['llama3', 'llama3.1', 'mistral', 'codellama', 'phi3', 'gemma2', 'qwen2.5'],
    requiresApiKey: false,
    envKeyName: '',
    baseUrl: 'http://localhost:11434/v1',
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Read a setting from the DB, falling back to env var */
function getSetting(key: string): string | undefined {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value || undefined;
}

/** Get the active LLM provider name */
export function getActiveProvider(): LLMProviderName {
  const setting = getSetting('LLM_PROVIDER');
  if (setting && setting in PROVIDER_CONFIGS) {
    return setting as LLMProviderName;
  }
  const env = process.env.LLM_PROVIDER;
  if (env && env in PROVIDER_CONFIGS) {
    return env as LLMProviderName;
  }
  // Default: pick the first provider that has a configured API key
  for (const name of ['gemini', 'openai', 'anthropic', 'grok', 'deepseek', 'ollama'] as LLMProviderName[]) {
    if (isProviderAvailable(name)) return name;
  }
  return 'gemini'; // ultimate fallback
}

/** Get the active model for a provider */
export function getActiveModel(provider?: LLMProviderName): string {
  const p = provider ?? getActiveProvider();
  const settingKey = `LLM_MODEL_${p.toUpperCase()}`;
  const setting = getSetting(settingKey);
  if (setting) return setting;
  const envKey = `LLM_MODEL_${p.toUpperCase()}`;
  if (process.env[envKey]) return process.env[envKey]!;
  return PROVIDER_CONFIGS[p].defaultModel;
}

/** Check whether a provider is configured and available */
export function isProviderAvailable(name: LLMProviderName): boolean {
  const config = PROVIDER_CONFIGS[name];
  if (!config) return false;
  if (name === 'ollama') {
    // Ollama doesn't require an API key, just needs the server running
    return true;
  }
  const apiKey = process.env[config.envKeyName];
  return !!apiKey && apiKey.length > 0;
}

/** List all providers with their availability status */
export function listProviders() {
  const active = getActiveProvider();
  return Object.values(PROVIDER_CONFIGS).map((config) => ({
    ...config,
    available: isProviderAvailable(config.name),
    active: config.name === active,
    currentModel: getActiveModel(config.name),
  }));
}

// ── OpenAI-compatible fetch (covers OpenAI, Grok, DeepSeek, Ollama) ──────────

async function openaiCompatibleGenerate(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const messages: Array<{ role: string; content: string }> = [];
  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt });
  }
  messages.push({ role: 'user', content: prompt });

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  // Ollama doesn't need auth header, but won't break if sent
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`${model} API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? '';
}

/** OpenAI-compatible embeddings (covers OpenAI, and potentially others) */
async function openaiCompatibleEmbed(
  baseUrl: string,
  apiKey: string,
  model: string,
  text: string,
): Promise<number[]> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, input: text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Embeddings API error ${res.status}: ${body}`);
  }

  const json = (await res.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  return json.data?.[0]?.embedding ?? [];
}

// ── Anthropic Messages API ───────────────────────────────────────────────────

async function anthropicGenerate(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  prompt: string,
  maxTokens: number,
  temperature: number,
): Promise<string> {
  const body: Record<string, unknown> = {
    model,
    max_tokens: maxTokens,
    temperature,
    messages: [{ role: 'user', content: prompt }],
  };
  if (systemPrompt) {
    body.system = systemPrompt;
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic API error ${res.status}: ${errBody}`);
  }

  const json = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return json.content?.find((c) => c.type === 'text')?.text ?? '';
}

// ── Gemini ───────────────────────────────────────────────────────────────────

async function geminiGenerate(
  apiKey: string,
  model: string,
  systemPrompt: string | undefined,
  prompt: string,
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const result = await ai.models.generateContent({
    model,
    contents: fullPrompt,
  });
  return result.text ?? '';
}

async function geminiEmbed(apiKey: string, model: string, text: string): Promise<number[]> {
  const ai = new GoogleGenAI({ apiKey });
  const result = await ai.models.embedContent({ model, contents: text });
  return result.embeddings?.[0]?.values ?? [];
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate text using the active (or specified) LLM provider.
 */
export async function generateText(options: LLMGenerateOptions): Promise<LLMGenerateResult> {
  const providerName = options.provider ?? getActiveProvider();
  const config = PROVIDER_CONFIGS[providerName];
  if (!config) {
    throw new Error(`Unknown LLM provider: ${providerName}`);
  }

  const model = options.model ?? getActiveModel(providerName);
  const maxTokens = options.maxTokens ?? 2048;
  const temperature = options.temperature ?? 0.7;
  const apiKey = config.envKeyName ? (process.env[config.envKeyName] ?? '') : '';

  if (config.requiresApiKey && !apiKey) {
    throw new Error(
      `LLM provider "${config.label}" requires API key ${config.envKeyName} — not configured`,
    );
  }

  let text: string;

  switch (providerName) {
    case 'gemini':
      text = await geminiGenerate(apiKey, model, options.systemPrompt, options.prompt);
      break;

    case 'anthropic':
      text = await anthropicGenerate(
        apiKey,
        model,
        options.systemPrompt,
        options.prompt,
        maxTokens,
        temperature,
      );
      break;

    case 'openai':
    case 'grok':
    case 'deepseek':
    case 'ollama': {
      const baseUrl =
        providerName === 'ollama'
          ? (process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434') + '/v1'
          : config.baseUrl!;
      text = await openaiCompatibleGenerate(
        baseUrl,
        apiKey,
        model,
        options.systemPrompt,
        options.prompt,
        maxTokens,
        temperature,
      );
      break;
    }

    default:
      throw new Error(`Unsupported LLM provider: ${providerName}`);
  }

  return { text, provider: providerName, model };
}

/**
 * Generate embeddings using the active (or specified) provider.
 * Not all providers support embeddings — falls back to Gemini or OpenAI.
 */
export async function generateEmbedding(options: LLMEmbeddingOptions): Promise<LLMEmbeddingResult | null> {
  // Embedding-capable providers (in preference order)
  const embeddingProviders: Array<{
    name: LLMProviderName;
    model: string;
    fn: () => Promise<number[]>;
  }> = [];

  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    embeddingProviders.push({
      name: 'gemini',
      model: 'text-embedding-004',
      fn: () => geminiEmbed(geminiKey, 'text-embedding-004', options.text),
    });
  }

  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    embeddingProviders.push({
      name: 'openai',
      model: 'text-embedding-3-small',
      fn: () =>
        openaiCompatibleEmbed(
          'https://api.openai.com/v1',
          openaiKey,
          'text-embedding-3-small',
          options.text,
        ),
    });
  }

  const ollamaUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  embeddingProviders.push({
    name: 'ollama',
    model: 'nomic-embed-text',
    fn: () =>
      openaiCompatibleEmbed(`${ollamaUrl}/v1`, '', 'nomic-embed-text', options.text),
  });

  // If caller specified a provider, try it first
  if (options.provider) {
    const preferred = embeddingProviders.find((p) => p.name === options.provider);
    if (preferred) {
      const others = embeddingProviders.filter((p) => p.name !== options.provider);
      embeddingProviders.length = 0;
      embeddingProviders.push(preferred, ...others);
    }
  }

  // Try each provider in order
  for (const ep of embeddingProviders) {
    try {
      const embedding = await ep.fn();
      if (embedding && embedding.length > 0) {
        return { embedding, provider: ep.name, model: ep.model };
      }
    } catch {
      // try next provider
      continue;
    }
  }

  return null;
}
