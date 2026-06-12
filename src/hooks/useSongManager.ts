import { useState, useCallback } from "react";

export interface Song {
  id: string;
  name: string;
  sections: { id: string; patternIndex: number; repeatCount: number }[];
  bpm: number;
  swing: number;
}

function loadSongs(): Song[] {
  try {
    const saved = localStorage.getItem("tbm_songs");
    return saved ? JSON.parse(saved) : [];
  } catch { return []; }
}

function saveSongs(songs: Song[]) {
  try { localStorage.setItem("tbm_songs", JSON.stringify(songs)); } catch { /* ignore */ }
}

export function useSongManager() {
  const [songs, setSongs] = useState<Song[]>(loadSongs);

  const handleSaveSong = useCallback((song: Song) => {
    setSongs((prev) => {
      const existing = prev.findIndex((s) => s.id === song.id);
      let next: Song[];
      if (existing >= 0) { next = [...prev]; next[existing] = song; }
      else { next = [...prev, song]; }
      saveSongs(next);
      return next;
    });
  }, []);

  const handleDeleteSong = useCallback((id: string) => {
    setSongs((prev) => { const next = prev.filter((s) => s.id !== id); saveSongs(next); return next; });
  }, []);

  return { songs, handleSaveSong, handleDeleteSong };
}
