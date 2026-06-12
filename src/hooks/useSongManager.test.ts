import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSongManager } from './useSongManager';

describe('useSongManager', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty songs list', () => {
    const { result } = renderHook(() => useSongManager());
    expect(result.current.songs).toEqual([]);
  });

  it('handleSaveSong adds a new song', () => {
    const { result } = renderHook(() => useSongManager());
    act(() => {
      result.current.handleSaveSong({ id: 'song-1', name: 'Test Song', sections: [{ id: 'sec-1', patternIndex: 0, repeatCount: 4 }], bpm: 120, swing: 50 });
    });
    expect(result.current.songs).toHaveLength(1);
    expect(result.current.songs[0].name).toBe('Test Song');
  });

  it('handleSaveSong updates an existing song', () => {
    const { result } = renderHook(() => useSongManager());
    const song = { id: 'song-1', name: 'Test Song', sections: [{ id: 'sec-1', patternIndex: 0, repeatCount: 4 }], bpm: 120, swing: 50 };
    act(() => result.current.handleSaveSong(song));
    act(() => result.current.handleSaveSong({ ...song, name: 'Updated Song', bpm: 140 }));
    expect(result.current.songs).toHaveLength(1);
    expect(result.current.songs[0].name).toBe('Updated Song');
    expect(result.current.songs[0].bpm).toBe(140);
  });

  it('handleDeleteSong removes a song', () => {
    const { result } = renderHook(() => useSongManager());
    act(() => result.current.handleSaveSong({ id: 'song-1', name: 'Song 1', sections: [], bpm: 120, swing: 0 }));
    act(() => result.current.handleSaveSong({ id: 'song-2', name: 'Song 2', sections: [], bpm: 140, swing: 50 }));
    act(() => result.current.handleDeleteSong('song-1'));
    expect(result.current.songs).toHaveLength(1);
    expect(result.current.songs[0].id).toBe('song-2');
  });
});
