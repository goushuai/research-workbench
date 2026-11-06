import { createHash } from "node:crypto";
export const COPILOT_VERSION = "1.0.106";
export const PROXY_VERSION = "8.0.57";
const proxyDigests = {
  "win32-x64": "45687b19ee71aad70236daefc31d33a8b9390b8ad1831c2c84acadc981a2964c",
  "win32-arm64": "c059bcb52b19ddf393c1fb9135dea1f94472a43d47cd55e7e06f6cd0db9265c8",
  "darwin-x64": "428ad123451238972d208ba76d360df461517647e78bcb2ef8ab7cce5b3eebe1",
  "darwin-arm64": "dd620c0d24e000ffe908d0d8eeb4a6c7315a31d3776fa09f198856b09fd7821f",
};
export function installationTarget(platform, arch) {
  const digest = proxyDigests[`${platform}-${arch}`];
  if (!digest) throw new Error(`尚未支持的安装平台 ${platform}/${arch}`);
  const file = `CLIProxyAPI_${PROXY_VERSION}_${platform === "win32" ? "windows" : "darwin"}_${arch === "arm64" ? "aarch64" : "amd64"}.${platform === "win32" ? "zip" : "tar.gz"}`;
  return {
    file,
    digest,
    url: `https://github.com/router-for-me/CLIProxyAPI/releases/download/v${PROXY_VERSION}/${file}`,
    executable: `cli-proxy-api${platform === "win32" ? ".exe" : ""}`,
  };
}
export function verifyDownload(buffer, digest) {
  if (createHash("sha256").update(buffer).digest("hex") !== digest)
    throw new Error("下载文件校验失败，请重新下载官方发行包");
}
