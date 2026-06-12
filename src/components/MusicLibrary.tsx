/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * MusicLibrary – Folder-based music library with semantic search,
 * metadata browsing, playlists, and deck loading for DJ workflow.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Search, FolderOpen, RefreshCw, Music, Disc3,
  ListMusic, Plus, Trash2,
  Filter, Loader2, AlertCircle, HardDrive,
  X
} from 'lucide-react';
import {
  type MusicTrack, type MusicPlaylist, type ScanStatus, type MusicStats,
  getMusicFolder, setMusicFolder, startMusicScan, getMusicScanStatus,
  fetchMusicTracks, searchMusic, fetchPlaylists, createPlaylist,
  deletePlaylist, fetchPlaylistTracks, addTrackToPlaylist,
  removeTrackFromPlaylist, getMusicStats, musicStreamUrl,
} from '../lib/api';

// ── Props ────────────────────────────────────────────────────────────────────
interface MusicLibraryProps {
  /** Callback to load a track into Deck A */
  onLoadDeckA?: (url: string, trackName: string) => void;
  /** Callback to load a track into Deck B */
  onLoadDeckB?: (url: string, trackName: string) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatDuration(seconds: number | null): string {
  if (!seconds) return '--:--';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTrackDisplayName(track: MusicTrack): string {
  if (track.artist && track.title) return `${track.artist} - ${track.title}`;
  if (track.title) return track.title;
  return track.filename.replace(/\.[^.]+$/, '');
}

type ViewMode = 'tracks' | 'playlists' | 'search';

// ═══════════════════════════════════════════════════════════════════════════════
export function MusicLibrary({ onLoadDeckA, onLoadDeckB }: MusicLibraryProps) {
  // ── State ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('tracks');
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [searchResults, setSearchResults] = useState<MusicTrack[]>([]);
  const [searchMode, setSearchMode] = useState<'semantic' | 'text' | null>(null);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<number | null>(null);
  const [playlistTracks, setPlaylistTracks] = useState<MusicTrack[]>([]);
  const [stats, setStats] = useState<MusicStats | null>(null);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);
  const [musicFolder, setMusicFolderState] = useState<string>('');
  const [folderInput, setFolderInput] = useState('');
  const [showFolderConfig, setShowFolderConfig] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('artist');
  const [filterGenre, setFilterGenre] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [showNewPlaylist, setShowNewPlaylist] = useState(false);
  const [contextTrack, setContextTrack] = useState<MusicTrack | null>(null);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });

  const searchInputRef = useRef<HTMLInputElement>(null);
  const scanPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  // ── Cleanup on unmount: cancel pending debounce timer and in-flight search ──
  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (searchAbortRef.current) searchAbortRef.current.abort();
    };
  }, []);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const [folderRes, statsRes, playlistsRes] = await Promise.all([
          getMusicFolder(),
          getMusicStats(),
          fetchPlaylists(),
        ]);
        setMusicFolderState(folderRes.folder);
        setFolderInput(folderRes.folder);
        setStats(statsRes);
        setPlaylists(playlistsRes);

        if (statsRes.trackCount > 0) {
          const tracksRes = await fetchMusicTracks({ sort: sortBy });
          setTracks(tracksRes);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load music library');
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scan polling ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (scanStatus?.scanning) {
      scanPollRef.current = setInterval(async () => {
        try {
          const status = await getMusicScanStatus();
          setScanStatus(status);
          if (!status.scanning) {
            if (scanPollRef.current) clearInterval(scanPollRef.current);
            // Refresh data after scan
            const [statsRes, tracksRes] = await Promise.all([
              getMusicStats(),
              fetchMusicTracks({ sort: sortBy }),
            ]);
            setStats(statsRes);
            setTracks(tracksRes);
          }
        } catch { /* ignore poll errors */ }
      }, 1000);
    }
    return () => {
      if (scanPollRef.current) clearInterval(scanPollRef.current);
    };
  }, [scanStatus?.scanning, sortBy]);

  // ── Actions ──────────────────────────────────────────────────────────────
  const handleBrowseFolder = useCallback(async () => {
    if (window.tbmBridge?.openFolderDialog) {
      try {
        const selected = await window.tbmBridge.openFolderDialog();
        if (selected) {
          setFolderInput(selected);
          // Auto-set the folder after selection
          const res = await setMusicFolder(selected);
          setMusicFolderState(res.folder);
          setShowFolderConfig(false);
          setError(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open folder dialog');
      }
    }
  }, []);

  const handleSetFolder = useCallback(async () => {
    if (!folderInput.trim()) return;
    try {
      const res = await setMusicFolder(folderInput.trim());
      setMusicFolderState(res.folder);
      setShowFolderConfig(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to set folder');
    }
  }, [folderInput]);

  const handleScan = useCallback(async () => {
    try {
      setError(null);
      await startMusicScan();
      setScanStatus({ scanning: true, total: 0, processed: 0, errors: 0, currentFile: '', startedAt: new Date().toISOString() });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scan');
    }
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);

    // Cancel any pending debounce and in-flight request
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (searchAbortRef.current) searchAbortRef.current.abort();

    if (!query.trim()) {
      setViewMode('tracks');
      setSearchResults([]);
      setSearchMode(null);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    setViewMode('search');

    // Debounce: wait 300ms before firing the API call
    searchDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      try {
        const res = await searchMusic(query.trim());
        // Ignore results if this request was aborted
        if (controller.signal.aborted) return;
        setSearchResults(res.results);
        setSearchMode(res.mode);
      } catch (_err) {
        if (controller.signal.aborted) return;
        setSearchResults([]);
        setError('Search failed');
      } finally {
        if (!controller.signal.aborted) setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleLoadTracks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMusicTracks({ sort: sortBy, genre: filterGenre || undefined });
      setTracks(res);
    } catch {
      setError('Failed to load tracks');
    } finally {
      setLoading(false);
    }
  }, [sortBy, filterGenre]);

  useEffect(() => {
    if (viewMode === 'tracks') handleLoadTracks();
  }, [sortBy, filterGenre]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCreatePlaylist = useCallback(async () => {
    if (!newPlaylistName.trim()) return;
    try {
      await createPlaylist(newPlaylistName.trim());
      setNewPlaylistName('');
      setShowNewPlaylist(false);
      const res = await fetchPlaylists();
      setPlaylists(res);
    } catch {
      setError('Failed to create playlist');
    }
  }, [newPlaylistName]);

  const handleDeletePlaylist = useCallback(async (id: number) => {
    try {
      await deletePlaylist(id);
      setPlaylists(p => p.filter(pl => pl.id !== id));
      if (activePlaylist === id) {
        setActivePlaylist(null);
        setPlaylistTracks([]);
      }
    } catch {
      setError('Failed to delete playlist');
    }
  }, [activePlaylist]);

  const handleSelectPlaylist = useCallback(async (id: number) => {
    setActivePlaylist(id);
    try {
      const tracks = await fetchPlaylistTracks(id);
      setPlaylistTracks(tracks);
    } catch {
      setError('Failed to load playlist tracks');
    }
  }, []);

  const handleAddToPlaylist = useCallback(async (playlistId: number, trackId: number) => {
    try {
      await addTrackToPlaylist(playlistId, trackId);
      if (activePlaylist === playlistId) {
        const tracks = await fetchPlaylistTracks(playlistId);
        setPlaylistTracks(tracks);
      }
      const res = await fetchPlaylists();
      setPlaylists(res);
    } catch {
      setError('Track may already be in playlist');
    }
    setContextTrack(null);
  }, [activePlaylist]);

  const handleRemoveFromPlaylist = useCallback(async (trackId: number) => {
    if (!activePlaylist) return;
    try {
      await removeTrackFromPlaylist(activePlaylist, trackId);
      setPlaylistTracks(pt => pt.filter(t => t.id !== trackId));
    } catch { /* ignore */ }
  }, [activePlaylist]);

  const handleContextMenu = useCallback((e: React.MouseEvent, track: MusicTrack) => {
    e.preventDefault();
    setContextTrack(track);
    setContextPos({ x: e.clientX, y: e.clientY });
  }, []);

  // Close context menu on click elsewhere
  useEffect(() => {
    const close = () => setContextTrack(null);
    if (contextTrack) window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [contextTrack]);

  // Keyboard: Ctrl+F to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // ── Derived ──────────────────────────────────────────────────────────────
  const displayTracks = viewMode === 'search' ? searchResults
    : viewMode === 'playlists' ? playlistTracks
    : tracks;

  const genres = useMemo(() => stats?.genres ?? [], [stats]);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white select-none">
      {/* ── Top Bar: Search + Actions ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 p-3 border-b border-neutral-800 bg-neutral-900/60 separator-glow">
        {/* Search */}
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search music... (try 'upbeat house 128bpm' or artist name)"
            className="w-full pl-10 pr-8 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-sm placeholder-neutral-500 focus:border-blue-500 focus:outline-none"
            value={searchQuery}
            onChange={e => handleSearch(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white"
            >
              <X size={14} />
            </button>
          )}
          {isSearching && (
            <Loader2 className="absolute right-8 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400 animate-spin" />
          )}
        </div>

        {/* Search mode badge */}
        {viewMode === 'search' && searchMode && (
          <span className={`text-xs px-2 py-1 rounded-full ${searchMode === 'semantic' ? 'bg-purple-500/20 text-purple-300' : 'bg-blue-500/20 text-blue-300'}`}>
            {searchMode === 'semantic' ? 'AI' : 'Text'}
          </span>
        )}

        {/* Filter toggle */}
        <button
          onClick={() => setShowFilters(f => !f)}
          className={`p-2 rounded-lg transition-colors ${showFilters ? 'bg-blue-600 text-white' : 'bg-neutral-800 text-neutral-400 hover:text-white'}`}
          title="Filters"
        >
          <Filter size={16} />
        </button>

        {/* Scan button */}
        <button
          onClick={handleScan}
          disabled={scanStatus?.scanning}
          className="flex items-center gap-1.5 px-3 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-sm transition-colors disabled:opacity-50"
          title="Scan music folder"
        >
          <RefreshCw size={14} className={scanStatus?.scanning ? 'animate-spin' : ''} />
          {scanStatus?.scanning ? 'Scanning...' : 'Scan'}
        </button>

        {/* Folder config */}
        <button
          onClick={() => setShowFolderConfig(f => !f)}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-400 hover:text-white transition-colors"
          title="Music folder settings"
        >
          <FolderOpen size={16} />
        </button>
      </div>

      {/* ── Folder config panel ───────────────────────────────────────────── */}
      {showFolderConfig && (
        <div className="p-3 border-b border-neutral-800 bg-neutral-900/40">
          <div className="text-xs text-neutral-400 mb-2">Music folder (all tracks are loaded from here):</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={folderInput}
              onChange={e => setFolderInput(e.target.value)}
              className="flex-1 px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded text-sm font-mono focus:border-blue-500 focus:outline-none"
              placeholder="C:\Users\User\Music"
            />
            {window.tbmBridge?.openFolderDialog && (
              <button
                onClick={handleBrowseFolder}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-700 hover:bg-neutral-600 rounded text-sm font-medium transition-colors"
                title="Browse for folder"
              >
                <FolderOpen size={14} />
                Browse
              </button>
            )}
            <button
              onClick={handleSetFolder}
              className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
            >
              Set
            </button>
          </div>
          <div className="text-xs text-neutral-500 mt-1">Current: {musicFolder}</div>
        </div>
      )}

      {/* ── Filter bar ────────────────────────────────────────────────────── */}
      {showFilters && (
        <div className="flex items-center gap-3 p-2 px-3 border-b border-neutral-800 bg-neutral-900/30 separator-glow">
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400">Genre:</label>
            <select
              value={filterGenre}
              onChange={e => setFilterGenre(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs"
            >
              <option value="">All</option>
              {genres.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-neutral-400">Sort:</label>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded px-2 py-1 text-xs"
            >
              <option value="artist">Artist</option>
              <option value="title">Title</option>
              <option value="bpm">BPM</option>
              <option value="genre">Genre</option>
              <option value="duration">Duration</option>
            </select>
          </div>
        </div>
      )}

      {/* ── Scan progress ─────────────────────────────────────────────────── */}
      {scanStatus?.scanning && (
        <div className="p-2 px-3 border-b border-neutral-800 bg-blue-500/5">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-blue-300">Scanning: {scanStatus.currentFile}</span>
            <span className="text-neutral-400">{scanStatus.processed}/{scanStatus.total} ({scanStatus.errors} errors)</span>
          </div>
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: scanStatus.total > 0 ? `${(scanStatus.processed / scanStatus.total) * 100}%` : '0%' }}
            />
          </div>
        </div>
      )}

      {/* ── Error display ─────────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-2 p-2 px-3 border-b border-red-500/30 bg-red-500/5 text-red-300 text-xs">
          <AlertCircle size={14} />
          {error}
          <button onClick={() => setError(null)} className="ml-auto hover:text-white"><X size={12} /></button>
        </div>
      )}

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* ── Sidebar: view tabs + playlists ─────────────────────────────── */}
        <div className="w-48 border-r border-neutral-800 flex flex-col bg-neutral-900/30 shrink-0">
          {/* View tabs */}
          <div className="p-2 space-y-0.5">
            <button
              onClick={() => { setViewMode('tracks'); setActivePlaylist(null); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${viewMode === 'tracks' ? 'bg-blue-600/20 text-blue-300' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            >
              <Music size={14} /> All Tracks
            </button>
            <button
              onClick={() => setViewMode('playlists')}
              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors ${viewMode === 'playlists' ? 'bg-blue-600/20 text-blue-300' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
            >
              <ListMusic size={14} /> Playlists
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="px-3 py-2 border-t border-neutral-800 text-xs text-neutral-500 space-y-0.5">
              <div className="flex justify-between"><span>Tracks:</span><span>{stats.trackCount}</span></div>
              <div className="flex justify-between"><span>Artists:</span><span>{stats.artistCount}</span></div>
              <div className="flex justify-between"><span>Size:</span><span>{stats.totalSizeMB} MB</span></div>
              <div className="flex justify-between"><span>AI indexed:</span><span>{stats.embeddedCount}</span></div>
            </div>
          )}

          {/* Playlists list */}
          {viewMode === 'playlists' && (
            <div className="flex-1 overflow-y-auto border-t border-neutral-800">
              <div className="p-2">
                {showNewPlaylist ? (
                  <div className="flex gap-1 mb-2">
                    <input
                      type="text"
                      value={newPlaylistName}
                      onChange={e => setNewPlaylistName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleCreatePlaylist()}
                      placeholder="Playlist name"
                      className="flex-1 px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-xs focus:outline-none focus:border-blue-500"
                      autoFocus
                    />
                    <button onClick={handleCreatePlaylist} className="px-2 py-1 bg-blue-600 rounded text-xs">OK</button>
                    <button onClick={() => setShowNewPlaylist(false)} className="px-1 text-neutral-500"><X size={12} /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowNewPlaylist(true)}
                    className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-neutral-400 hover:text-white hover:bg-neutral-800 rounded transition-colors mb-1"
                  >
                    <Plus size={12} /> New Playlist
                  </button>
                )}

                {playlists.map(pl => (
                  <div
                    key={pl.id}
                    className={`flex items-center gap-1.5 px-2 py-1.5 rounded text-xs cursor-pointer transition-colors group ${activePlaylist === pl.id ? 'bg-blue-600/20 text-blue-300' : 'text-neutral-300 hover:bg-neutral-800'}`}
                    onClick={() => handleSelectPlaylist(pl.id)}
                  >
                    <ListMusic size={12} className="shrink-0" />
                    <span className="flex-1 truncate">{pl.name}</span>
                    <span className="text-neutral-500">{pl.track_count}</span>
                    <button
                      onClick={e => { e.stopPropagation(); handleDeletePlaylist(pl.id); }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Track list ─────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800 text-xs text-neutral-500 uppercase tracking-wider bg-neutral-900/40 shrink-0">
            <div className="w-8 text-center">#</div>
            <div className="flex-1 min-w-0">Title / Artist</div>
            <div className="w-24 hidden md:block">Genre</div>
            <div className="w-16 text-right hidden sm:block">BPM</div>
            <div className="w-12 text-right hidden sm:block">Key</div>
            <div className="w-14 text-right">Time</div>
            <div className="w-16 text-right hidden lg:block">Size</div>
            <div className="w-24 text-center shrink-0">Load</div>
          </div>

          {/* Track rows */}
          <div className="flex-1 overflow-y-auto">
            {displayTracks.length === 0 && !loading && (
              <div className="flex flex-col items-center justify-center h-full text-neutral-500">
                {stats?.trackCount === 0 ? (
                  <>
                    <HardDrive size={40} className="mb-3 opacity-40" />
                    <div className="text-sm mb-1">No tracks indexed yet</div>
                    <div className="text-xs mb-4">Point to your music folder and scan to get started</div>
                    <button
                      onClick={() => { setShowFolderConfig(true); }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
                    >
                      Set Music Folder
                    </button>
                  </>
                ) : viewMode === 'search' ? (
                  <>
                    <Search size={32} className="mb-2 opacity-40" />
                    <div className="text-sm">No results for &ldquo;{searchQuery}&rdquo;</div>
                    <div className="text-xs mt-1">Try different keywords or a natural language description</div>
                  </>
                ) : viewMode === 'playlists' && !activePlaylist ? (
                  <>
                    <ListMusic size={32} className="mb-2 opacity-40" />
                    <div className="text-sm">Select a playlist to view tracks</div>
                  </>
                ) : (
                  <>
                    <Music size={32} className="mb-2 opacity-40" />
                    <div className="text-sm">No tracks match the current filters</div>
                  </>
                )}
              </div>
            )}

            {loading && (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
              </div>
            )}

            {displayTracks.map((track, idx) => (
              <div
                key={track.id}
                className="flex items-center gap-2 px-3 py-1.5 border-b border-neutral-800/50 hover:bg-neutral-800/40 transition-colors group cursor-default"
                onContextMenu={e => handleContextMenu(e, track)}
              >
                {/* Index */}
                <div className="w-8 text-center text-xs text-neutral-500">{idx + 1}</div>

                {/* Title + Artist */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-neutral-200 truncate">{track.title || track.filename}</div>
                  <div className="text-xs text-neutral-500 truncate">
                    {track.artist || 'Unknown Artist'}
                    {track.album && <span className="text-neutral-600"> &middot; {track.album}</span>}
                  </div>
                </div>

                {/* Genre */}
                <div className="w-24 hidden md:block">
                  {track.genre && (
                    <span className="text-xs px-1.5 py-0.5 bg-neutral-800 rounded text-neutral-400 truncate block">
                      {track.genre}
                    </span>
                  )}
                </div>

                {/* BPM */}
                <div className="w-16 text-right text-xs text-neutral-400 hidden sm:block">
                  {track.bpm ? `${Math.round(track.bpm)}` : '--'}
                </div>

                {/* Key */}
                <div className="w-12 text-right text-xs text-neutral-400 hidden sm:block">
                  {track.key || '--'}
                </div>

                {/* Duration */}
                <div className="w-14 text-right text-xs text-neutral-400 font-mono">
                  {formatDuration(track.duration)}
                </div>

                {/* File size */}
                <div className="w-16 text-right text-xs text-neutral-500 hidden lg:block">
                  {formatFileSize(track.file_size)}
                </div>

                {/* Deck load buttons */}
                <div className="w-24 flex items-center justify-center gap-1 shrink-0">
                  <button
                    onClick={() => onLoadDeckA?.(musicStreamUrl(track.id), getTrackDisplayName(track))}
                    className="px-2 py-1 text-xs bg-blue-600/20 hover:bg-blue-600 text-blue-300 hover:text-white rounded transition-colors font-medium"
                    title="Load to Deck A"
                  >
                    A
                  </button>
                  <button
                    onClick={() => onLoadDeckB?.(musicStreamUrl(track.id), getTrackDisplayName(track))}
                    className="px-2 py-1 text-xs bg-red-600/20 hover:bg-red-600 text-red-300 hover:text-white rounded transition-colors font-medium"
                    title="Load to Deck B"
                  >
                    B
                  </button>
                  {viewMode === 'playlists' && activePlaylist && (
                    <button
                      onClick={() => handleRemoveFromPlaylist(track.id)}
                      className="px-1 py-1 text-xs text-neutral-500 hover:text-red-400 rounded transition-colors opacity-0 group-hover:opacity-100"
                      title="Remove from playlist"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Semantic score indicator */}
                {viewMode === 'search' && track.score !== undefined && (
                  <div className="w-10 text-right" title={`Match: ${(track.score * 100).toFixed(0)}%`}>
                    <div className="inline-block w-6 h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.min(track.score * 100, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Context menu (right-click) ────────────────────────────────────── */}
      {contextTrack && (
        <div
          className="fixed z-50 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextPos.x, top: contextPos.y }}
          onClick={e => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-neutral-500 truncate border-b border-neutral-800">
            {getTrackDisplayName(contextTrack)}
          </div>
          <button
            onClick={() => { onLoadDeckA?.(musicStreamUrl(contextTrack.id), getTrackDisplayName(contextTrack)); setContextTrack(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-300 hover:bg-blue-600/20 hover:text-blue-300 transition-colors"
          >
            <Disc3 size={14} /> Load to Deck A
          </button>
          <button
            onClick={() => { onLoadDeckB?.(musicStreamUrl(contextTrack.id), getTrackDisplayName(contextTrack)); setContextTrack(null); }}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-300 hover:bg-red-600/20 hover:text-red-300 transition-colors"
          >
            <Disc3 size={14} /> Load to Deck B
          </button>
          {playlists.length > 0 && (
            <>
              <div className="border-t border-neutral-800 my-0.5" />
              <div className="px-3 py-1 text-xs text-neutral-500">Add to playlist:</div>
              {playlists.map(pl => (
                <button
                  key={pl.id}
                  onClick={() => handleAddToPlaylist(pl.id, contextTrack.id)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-800 transition-colors"
                >
                  <ListMusic size={12} /> {pl.name}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default MusicLibrary;
