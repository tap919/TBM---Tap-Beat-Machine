/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Base URL for all API calls – proxied by Vite in dev, same-origin in prod. */
const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`API ${options?.method ?? 'GET'} ${path} → ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SampleLibrary {
  id: string;
  name: string;
  vendor: string;
  category: string;
  size: string;
  instruments: number;
  isFavorite: boolean;
}

export interface Plugin {
  id: string;
  name: string;
  vendor: string;
  type: 'VST2' | 'VST3';
  category: string;
  isEnabled: boolean;
  latency: number;
}

export interface AnalysisResult {
  key: string;
  scale: string;
  chords: string[];
  tempo: number;
  confidence: number;
}

// ── Libraries ─────────────────────────────────────────────────────────────────

export const fetchLibraries = () => request<SampleLibrary[]>('/libraries');

export const addLibrary = (data: Omit<SampleLibrary, 'id'>) =>
  request<{ id: string }>('/libraries', { method: 'POST', body: JSON.stringify(data) });

export const toggleLibraryFavorite = (id: string, isFavorite: boolean) =>
  request<{ ok: boolean }>(`/libraries/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isFavorite }),
  });

export const deleteLibrary = (id: string) =>
  request<{ ok: boolean }>(`/libraries/${id}`, { method: 'DELETE' });

// ── Plugins ───────────────────────────────────────────────────────────────────

export const fetchPlugins = () => request<Plugin[]>('/plugins');

export const addPlugin = (data: Omit<Plugin, 'id'>) =>
  request<{ id: string }>('/plugins', { method: 'POST', body: JSON.stringify(data) });

export const togglePlugin = (id: string, isEnabled: boolean) =>
  request<{ ok: boolean }>(`/plugins/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isEnabled }),
  });

export const deletePlugin = (id: string) =>
  request<{ ok: boolean }>(`/plugins/${id}`, { method: 'DELETE' });

// ── Settings ──────────────────────────────────────────────────────────────────

export const fetchSettings = () => request<Record<string, string>>('/settings');

export const saveSettings = (settings: Record<string, string>) =>
  request<{ ok: boolean }>('/settings', { method: 'POST', body: JSON.stringify(settings) });

// ── AI Analysis ───────────────────────────────────────────────────────────────

export const analyzeSession = (context: {
  genre: string;
  style: string;
  rhythm: string;
  notation: string;
}) => request<AnalysisResult>('/analyze', { method: 'POST', body: JSON.stringify(context) });

// ── Stems (Demucs) ────────────────────────────────────────────────────────────

export type StemJobStatus = 'queued' | 'running' | 'done' | 'error';

export interface StemJob {
  jobId: string;
  status: StemJobStatus;
  progress: number;   // 0-100
  phase: string;
  model: string;
  trackName: string;
  stems: string[];    // stem names, e.g. ['drums','bass','vocals','other']
  error?: string;
}

/** Upload an audio file for stem separation. Returns a job ID. */
export const separateStems = async (file: File, model: string): Promise<StemJob> => {
  const form = new FormData();
  form.append('audio', file);
  form.append('model', model);
  const res = await fetch(`${BASE}/stems/separate`, { method: 'POST', body: form });
  if (!res.ok) {
    const body = await res.text().catch(() => res.statusText);
    throw new Error(`Stem separation failed: ${res.status}: ${body}`);
  }
  return res.json() as Promise<StemJob>;
};

/** Poll job status. */
export const getStemJob = (jobId: string) =>
  request<StemJob>(`/stems/jobs/${jobId}`);

/** Build a URL to stream/download a separated stem. */
export const stemDownloadUrl = (jobId: string, stem: string) =>
  `${BASE}/stems/jobs/${jobId}/download/${stem}`;

/** Check whether demucs is installed and which models are cached. */
export const demucsHealth = () =>
  request<{ installed: boolean; python: string; cachedModels: string[]; modelsDir: string }>('/stems/health');

