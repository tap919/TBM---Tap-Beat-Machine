interface TbmBridge {
  openFolderDialog(): Promise<string | null>;
  onPluginEvent?: (event: unknown) => void;
}

interface VstBridge {
  loadPlugin(pluginId: string): Promise<{ instanceId: string }>;
  unloadPlugin(pluginId: string): Promise<void>;
  setParam(pluginId: string, paramIndex: number, value: number): Promise<void>;
  scanPluginsPaths(paths: string[]): Promise<import("../lib/api").VstScanResult[]>;
  processBlock(instanceId: string, inputL: Float32Array, inputR: Float32Array, blockSize: number): Promise<{ outputL: ArrayBuffer; outputR: ArrayBuffer }>;
}

declare global {
  interface Window {
    electron?: unknown;
    tbmBridge?: TbmBridge;
    vstBridge?: VstBridge;
  }
}

export {};
