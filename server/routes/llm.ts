/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * LLM Provider management API routes.
 * Lets the frontend list available providers, see which is active,
 * and switch the active provider/model.
 */

import { Router } from 'express';
import db from '../db.js';
import {
  listProviders,
  getActiveProvider,
  getActiveModel,
  isProviderAvailable,
  PROVIDER_CONFIGS,
  type LLMProviderName,
} from '../llm-providers.js';

const router = Router();

// ── GET /api/llm/providers ───────────────────────────────────────────────────
// List all LLM providers, their availability, and which is active.
router.get('/providers', (_req, res) => {
  const providers = listProviders();
  res.json({
    activeProvider: getActiveProvider(),
    activeModel: getActiveModel(),
    providers,
  });
});

// ── POST /api/llm/provider ───────────────────────────────────────────────────
// Switch the active LLM provider.
router.post('/provider', (req, res) => {
  const { provider, model } = req.body as { provider?: string; model?: string };

  if (!provider || !(provider in PROVIDER_CONFIGS)) {
    res.status(400).json({
      error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_CONFIGS).join(', ')}`,
    });
    return;
  }

  const name = provider as LLMProviderName;

  if (!isProviderAvailable(name)) {
    const config = PROVIDER_CONFIGS[name];
    res.status(400).json({
      error: `Provider "${config.label}" is not available. Set the ${config.envKeyName} environment variable.`,
    });
    return;
  }

  // Save to settings DB
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
    'LLM_PROVIDER',
    name,
  );

  if (model) {
    const config = PROVIDER_CONFIGS[name];
    if (!config.models.includes(model)) {
      // Allow custom models (for Ollama etc.) even if not in the preset list
      console.warn(`[LLM] Model "${model}" not in preset list for ${name}, saving anyway`);
    }
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(
      `LLM_MODEL_${name.toUpperCase()}`,
      model,
    );
  }

  res.json({
    ok: true,
    activeProvider: name,
    activeModel: getActiveModel(name),
  });
});

// ── GET /api/llm/health ──────────────────────────────────────────────────────
// Quick health check — which providers are reachable.
router.get('/health', async (_req, res) => {
  const results: Record<string, { available: boolean; configured: boolean }> = {};

  for (const [name, config] of Object.entries(PROVIDER_CONFIGS)) {
    const configured = isProviderAvailable(name as LLMProviderName);
    results[name] = { available: configured, configured };
  }

  res.json({
    activeProvider: getActiveProvider(),
    activeModel: getActiveModel(),
    providers: results,
  });
});

export default router;
