import React, { useState, useEffect, useRef } from 'react';
import { 
  getBackups, 
  restoreBackup, 
  clearState, 
  getStorageInfo,
  TBMProjectState 
} from '../lib/statePersistence';
import { logger } from '../lib/logger';
import { 
  RotateCcw, 
  Trash2, 
  Calendar, 
  Database, 
  CheckCircle, 
  AlertCircle,
  HardDrive,
  RefreshCw
} from 'lucide-react';

interface RecoveryManagerProps {
  onRecoveryComplete?: () => void;
  onError?: (error: string) => void;
}

export function RecoveryManager({ onRecoveryComplete, onError }: RecoveryManagerProps) {
  const [backups, setBackups] = useState<Array<{timestamp: string; state: TBMProjectState}>>([]);
  const [storageInfo, setStorageInfo] = useState<ReturnType<typeof getStorageInfo>>({
    totalSize: 0,
    itemCount: 0,
    backupsCount: 0
  });
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBackup, setSelectedBackup] = useState<string | null>(null);
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load backups and storage info
  useEffect(() => {
    refreshData();
  }, []);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    };
  }, []);

  const refreshData = () => {
    try {
      const backupList = getBackups();
      setBackups(backupList);
      
      const info = getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      logger.error('Failed to load recovery data', error as Error);
      onError?.('Failed to load recovery data');
    }
  };

  const handleRestoreBackup = async (timestamp: string) => {
    try {
      setIsLoading(true);
      const restored = restoreBackup(timestamp);
      
      if (restored) {
        logger.info('Backup restored', { timestamp });
        setSelectedBackup(timestamp);
        
        // Show success message
        if (onRecoveryComplete) {
          onRecoveryComplete();
        }
        
        // Refresh the page to apply restored state
        if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
        reloadTimerRef.current = setTimeout(() => {
          window.location.reload();
        }, 1000);
      } else {
        throw new Error('Backup not found');
      }
    } catch (error) {
      logger.error('Failed to restore backup', error as Error, { timestamp });
      onError?.(`Failed to restore backup: ${error instanceof Error ? error.message : 'Unknown error'}`);
      if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearAllBackups = () => {
    if (window.confirm('Are you sure you want to delete all backups? This cannot be undone.')) {
      try {
        clearState();
        refreshData();
        logger.info('All backups cleared');
      } catch (error) {
        logger.error('Failed to clear backups', error as Error);
        onError?.('Failed to clear backups');
      }
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const getTimeAgo = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  return (
    <div className="p-6 bg-neutral-900 rounded-lg border border-neutral-800 vignette">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <RotateCcw className="w-5 h-5 text-neutral-400" />
          <h2 className="text-lg font-semibold text-white">Recovery & Backups</h2>
        </div>
        <button
          onClick={refreshData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm bg-neutral-800 hover:bg-neutral-700 rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Storage Info */}
      <div className="mb-6 p-4 bg-neutral-800 rounded-lg noise-texture relative">
        <div className="flex items-center gap-3 mb-3">
          <HardDrive className="w-5 h-5 text-neutral-400" />
          <h3 className="text-sm font-medium text-white">Storage Information</h3>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{storageInfo.backupsCount}</div>
            <div className="text-xs text-neutral-400">Backups</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{storageInfo.itemCount}</div>
            <div className="text-xs text-neutral-400">Items</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-white">{formatBytes(storageInfo.totalSize)}</div>
            <div className="text-xs text-neutral-400">Used</div>
          </div>
        </div>
      </div>

      {/* Backups List */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-neutral-400" />
            <h3 className="text-sm font-medium text-white">Available Backups</h3>
          </div>
          {backups.length > 0 && (
            <button
              onClick={handleClearAllBackups}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              Clear All
            </button>
          )}
        </div>

        {backups.length === 0 ? (
          <div className="p-4 text-center border border-dashed border-neutral-700 rounded-lg">
            <AlertCircle className="w-8 h-8 text-neutral-600 mx-auto mb-2" />
            <p className="text-sm text-neutral-400">No backups available</p>
            <p className="text-xs text-neutral-500 mt-1">Auto-save backups will appear here</p>
          </div>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {backups.map((backup) => (
              <div
                key={backup.timestamp}
                className={`p-3 rounded-lg border transition-colors vignette ${
                  selectedBackup === backup.timestamp
                    ? 'bg-blue-900/20 border-blue-700'
                    : 'bg-neutral-800 border-neutral-700 hover:bg-neutral-750'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-neutral-400" />
                    <span className="text-sm font-medium text-white">
                      {formatDate(backup.timestamp)}
                    </span>
                  </div>
                  <span className="text-xs text-neutral-500">
                    {getTimeAgo(backup.timestamp)}
                  </span>
                </div>
                
                <div className="text-xs text-neutral-400 mb-3">
                  Version: {backup.state.version} • {backup.state.pads.length} pads • BPM: {backup.state.bpm}
                </div>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {selectedBackup === backup.timestamp ? (
                      <>
                        <CheckCircle className="w-3 h-3 text-green-400" />
                        <span className="text-xs text-green-400">Restored</span>
                      </>
                    ) : (
                      <span className="text-xs text-neutral-500">Click to restore</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleRestoreBackup(backup.timestamp)}
                    disabled={isLoading || selectedBackup === backup.timestamp}
                    className="flex items-center gap-1 px-2 py-1 text-xs bg-neutral-700 hover:bg-neutral-600 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <RotateCcw className="w-3 h-3" />
                    Restore
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recovery Instructions */}
      <div className="p-4 bg-neutral-800 rounded-lg noise-texture relative">
        <h3 className="text-sm font-medium text-white mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-yellow-400" />
          Recovery Information
        </h3>
        <ul className="text-xs text-neutral-400 space-y-1">
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 mt-1.5 rounded-full bg-neutral-600" />
            <span>Auto-save occurs every 30 seconds when changes are detected</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 mt-1.5 rounded-full bg-neutral-600" />
            <span>Manual saves create additional backups (max 5 kept)</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 mt-1.5 rounded-full bg-neutral-600" />
            <span>Restoring a backup will reload the application</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="w-1 h-1 mt-1.5 rounded-full bg-neutral-600" />
            <span>Backups are stored locally in your browser</span>
          </li>
        </ul>
      </div>

      {/* Status */}
      {isLoading && (
        <div className="mt-4 p-3 bg-blue-900/20 border border-blue-700 rounded-lg">
          <div className="flex items-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
            <span className="text-sm text-blue-300">Restoring backup...</span>
          </div>
        </div>
      )}

      {selectedBackup && (
        <div className="mt-4 p-3 bg-green-900/20 border border-green-700 rounded-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-400" />
            <span className="text-sm text-green-300">
              Backup restored! Page will reload shortly...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}