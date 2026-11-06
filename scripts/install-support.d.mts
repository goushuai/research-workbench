export const COPILOT_VERSION: string;
export const PROXY_VERSION: string;
export function installationTarget(platform: string, arch: string): { file: string; digest: string; url: string; executable: string };
export function verifyDownload(buffer: Uint8Array, digest: string): void;
