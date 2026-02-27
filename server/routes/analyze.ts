/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Router } from 'express';
import { GoogleGenAI } from '@google/genai';

const router = Router();

const ANALYSIS_PROMPT = `You are a music theory assistant embedded in a beat-making workstation.
Given the musical context below, respond with a JSON object containing exactly these fields:
  - key: string (e.g. "C", "F#", "Bb")
  - scale: string (e.g. "Major", "Minor", "Dorian", "Mixolydian")
  - chords: array of 4 chord name strings (e.g. ["Cmaj7", "Am7", "Fmaj7", "G7"])
  - tempo: number in BPM (integer between 60-180)
  - confidence: number between 75-99 (integer)

Context:
Genre: {genre}
Style: {style}
Rhythm: {rhythm}
Notation: {notation}

Respond ONLY with valid JSON. No markdown, no explanation.`;

// ── POST /api/analyze ─────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI analysis unavailable: GEMINI_API_KEY not configured' });
    return;
  }

  const body = req.body && typeof req.body === 'object' ? req.body as Record<string, string> : {};
  const { genre = 'Hip-Hop', style = 'comping', rhythm = 'swing', notation = 'Diatonic' } = body;

  // Validate field lengths to prevent prompt injection / oversized requests
  const MAX_LEN = 100;
  if (
    typeof genre !== 'string' || genre.length > MAX_LEN ||
    typeof style !== 'string' || style.length > MAX_LEN ||
    typeof rhythm !== 'string' || rhythm.length > MAX_LEN ||
    typeof notation !== 'string' || notation.length > MAX_LEN
  ) {
    res.status(400).json({ error: 'Invalid request: fields must be strings of at most 100 characters' });
    return;
  }

  const prompt = ANALYSIS_PROMPT
    .replace('{genre}', genre)
    .replace('{style}', style)
    .replace('{rhythm}', rhythm)
    .replace('{notation}', notation);

  try {
    const ai = new GoogleGenAI({ apiKey });
    const result = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
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

    res.json(parsed);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: `AI analysis failed: ${message}` });
  }
});

export default router;
