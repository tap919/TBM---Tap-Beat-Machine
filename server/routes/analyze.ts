/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * AI Music Theory Analysis — now provider-agnostic.
 * Uses the unified LLM provider abstraction so Big Homie can talk to
 * Gemini, OpenAI, Anthropic, Grok, DeepSeek, or Ollama.
 */

import { Router } from 'express';
import { generateText, getActiveProvider } from '../llm-providers.js';

const router = Router();

const SYSTEM_PROMPT = `You are a music theory assistant embedded in a beat-making workstation.
Given the musical context below, respond with a JSON object containing exactly these fields:
  - key: string (e.g. "C", "F#", "Bb")
  - scale: string (e.g. "Major", "Minor", "Dorian", "Mixolydian")
  - chords: array of 4 chord name strings (e.g. ["Cmaj7", "Am7", "Fmaj7", "G7"])
  - tempo: number in BPM (integer between 60-180)
  - confidence: number between 75-99 (integer)

Respond ONLY with valid JSON. No markdown, no explanation.`;

// ── POST /api/analyze ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, string> : {};
  const { genre = 'Hip-Hop', style = 'comping', rhythm = 'swing', notation = 'Diatonic' } = body;

  // Validate field lengths to prevent prompt injection / oversized requests
  const MAX_LEN = 50;
  const SAFE_PATTERN = /^[a-zA-Z0-9 _\-\/().#,'+&]+$/;
  if (
    typeof genre !== 'string' || genre.length > MAX_LEN ||
    typeof style !== 'string' || style.length > MAX_LEN ||
    typeof rhythm !== 'string' || rhythm.length > MAX_LEN ||
    typeof notation !== 'string' || notation.length > MAX_LEN
  ) {
    res.status(400).json({ error: 'Invalid request: fields must be strings of at most 50 characters' });
    return;
  }
  if (!SAFE_PATTERN.test(genre) || !SAFE_PATTERN.test(style) ||
      !SAFE_PATTERN.test(rhythm) || !SAFE_PATTERN.test(notation)) {
    res.status(400).json({ error: 'Invalid request: fields contain disallowed characters' });
    return;
  }

  const userPrompt = `Context:\nGenre: ${genre}\nStyle: ${style}\nRhythm: ${rhythm}\nNotation: ${notation}`;

  try {
    const result = await generateText({
      systemPrompt: SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 512,
    });

    const text = result.text ?? '';
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned) as {
      key: string;
      scale: string;
      chords: string[];
      tempo: number;
      confidence: number;
    };

    // Validate that all expected fields are present and of the correct type
    if (
      typeof parsed.key !== 'string' ||
      typeof parsed.scale !== 'string' ||
      !Array.isArray(parsed.chords) ||
      typeof parsed.tempo !== 'number' ||
      typeof parsed.confidence !== 'number'
    ) {
      res.status(500).json({ error: 'AI returned unexpected response format' });
      return;
    }

    res.json({ ...parsed, _provider: result.provider, _model: result.model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const provider = getActiveProvider();
    res.status(500).json({ error: `AI analysis failed (${provider}): ${message}` });
  }
});

export default router;
