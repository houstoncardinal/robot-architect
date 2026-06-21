// Incremental parser for the SWARM IDE streaming protocol.
// Files are emitted as:
//   ===FILE: path===
//   ...content...
//   ===END===
// Deletes:
//   ===DELETE: path===
// Terminator:
//   ===DONE===

export type ParsedStream = {
  files: Record<string, string>;
  deletes: string[];
  activePath: string | null;
  done: boolean;
};

const FILE_RE = /^===FILE:\s*(.+?)\s*===\s*$/;
const END_RE = /^===END===\s*$/;
const DEL_RE = /^===DELETE:\s*(.+?)\s*===\s*$/;
const DONE_RE = /^===DONE===\s*$/;

export function parseIdeStream(raw: string): ParsedStream {
  const files: Record<string, string> = {};
  const deletes: string[] = [];
  let activePath: string | null = null;
  let buf: string[] = [];
  let done = false;

  const lines = raw.split("\n");
  for (const line of lines) {
    if (DONE_RE.test(line)) {
      done = true;
      continue;
    }
    const del = line.match(DEL_RE);
    if (del) {
      if (activePath) {
        files[activePath] = buf.join("\n");
        activePath = null;
        buf = [];
      }
      deletes.push(del[1]);
      continue;
    }
    const open = line.match(FILE_RE);
    if (open) {
      if (activePath) files[activePath] = buf.join("\n");
      activePath = open[1];
      buf = [];
      continue;
    }
    if (END_RE.test(line)) {
      if (activePath) {
        files[activePath] = buf.join("\n");
        activePath = null;
        buf = [];
      }
      continue;
    }
    if (activePath) buf.push(line);
  }
  // commit in-progress file so the editor shows partial content
  if (activePath) files[activePath] = buf.join("\n");
  return { files, deletes, activePath, done };
}

// Build a self-contained preview document from a virtual file map.
// Inlines local <link rel="stylesheet" href="styles.css"> and
// <script src="app.js"> by path lookup; leaves http(s) URLs alone.
export function assemblePreview(files: Record<string, string>): string {
  const index =
    files["index.html"] ??
    files["/index.html"] ??
    Object.entries(files).find(([k]) => k.toLowerCase().endsWith("index.html"))?.[1] ??
    "";
  if (!index) return "";

  let html = index;

  // Inline <link rel="stylesheet" href="local.css">
  html = html.replace(
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    (match, href) => {
      if (/^https?:\/\//i.test(href) || href.startsWith("//")) return match;
      const key = normalize(href);
      const css = files[key] ?? files[key.replace(/^\//, "")];
      if (css == null) return match;
      // only inline when it's a stylesheet link
      if (!/stylesheet/i.test(match) && !key.endsWith(".css")) return match;
      return `<style data-from="${key}">\n${css}\n</style>`;
    },
  );

  // Inline <script src="local.js">
  html = html.replace(
    /<script\b([^>]*)\bsrc=["']([^"']+)["']([^>]*)><\/script>/gi,
    (match, pre, src, post) => {
      if (/^https?:\/\//i.test(src) || src.startsWith("//")) return match;
      const key = normalize(src);
      const js = files[key] ?? files[key.replace(/^\//, "")];
      if (js == null) return match;
      const attrs = `${pre} ${post}`.replace(/\s+/g, " ").trim();
      return `<script data-from="${key}" ${attrs}>\n${js}\n</script>`;
    },
  );

  return html;
}

function normalize(p: string): string {
  return p.replace(/^\.\//, "").replace(/^\//, "");
}

export function languageFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html" || ext === "htm") return "html";
  if (ext === "css") return "css";
  if (ext === "js" || ext === "mjs") return "javascript";
  if (ext === "ts") return "typescript";
  if (ext === "tsx") return "typescript";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "svg" || ext === "xml") return "xml";
  return "plaintext";
}

export function fileIcon(path: string): { label: string; color: string } {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "html") return { label: "H", color: "#e36b3a" };
  if (ext === "css") return { label: "C", color: "#7dd3fc" };
  if (ext === "js") return { label: "JS", color: "#f7df1e" };
  if (ext === "json") return { label: "{}", color: "#a3e635" };
  if (ext === "md") return { label: "M", color: "#cbd5e1" };
  return { label: "•", color: "#94a3b8" };
}
