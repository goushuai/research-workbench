import { marked, Renderer } from "marked";

export function reportHtml(
  content: string,
  artifactId: string,
  imageSource?: (path: string) => string,
): string {
  const renderer = new Renderer();
  renderer.html = () => "";
  renderer.link = function ({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    if (!/^(https?:|mailto:|#)/i.test(href)) return label;
    const safeHref = href.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  };
  renderer.image = ({ href, text }) => {
    let path: string;
    try {
      path = decodeURIComponent(href).replaceAll("\\", "/");
    } catch {
      return "";
    }
    if (
      /^[a-z][a-z0-9+.-]*:|^\//i.test(path) ||
      path.split("/").includes("..") ||
      !/\.(png|jpe?g|gif|webp|avif)$/i.test(path)
    )
      return "";
    const alt = text
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
    const src = imageSource
      ? imageSource(path)
      : `/api/artifacts/${encodeURIComponent(artifactId)}/resource?path=${encodeURIComponent(path)}`;
    return src ? `<img src="${src}" alt="${alt}"${imageSource ? "" : ' loading="lazy"'}>` : "";
  };
  return marked.parse(content, { async: false, renderer });
}
