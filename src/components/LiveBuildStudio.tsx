import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { RobotRole } from "@/lib/swarm";

type Props = {
  html: string;
  generating: boolean;
  error: string | null;
  agents: RobotRole[];
  directive: string;
};

type LineMeta = { agent: RobotRole | null; ts: number };

function extractHtml(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const i = s.search(/<!doctype html|<html/i);
  if (i > 0) s = s.slice(i);
  return s;
}

// Lightweight HTML/CSS/JS tokenizer → colored spans
function highlight(line: string): { cls: string; t: string }[] {
  const out: { cls: string; t: string }[] = [];
  // tags + attrs
  const re = /(&lt;\/?[\w-]+|<\/?[\w-]+|<!--[\s\S]*?-->|"[^"]*"|'[^']*'|\{[^}]*\}|\/\*[\s\S]*?\*\/|\/\/[^\n]*|[\w-]+(?==)|[<>\/=])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    if (m.index > last) out.push({ cls: "tk-t", t: line.slice(last, m.index) });
    const tok = m[0];
    let cls = "tk-t";
    if (/^<!--/.test(tok) || /^\/\*/.test(tok) || /^\/\//.test(tok)) cls = "tk-c";
    else if (/^["']/.test(tok)) cls = "tk-s";
    else if (/^<\/?[\w-]+$/.test(tok) || /^&lt;\/?[\w-]+$/.test(tok)) cls = "tk-tag";
    else if (/^[\w-]+$/.test(tok)) cls = "tk-attr";
    else cls = "tk-p";
    out.push({ cls, t: tok });
    last = m.index + tok.length;
  }
  if (last < line.length) out.push({ cls: "tk-t", t: line.slice(last) });
  return out;
}

function inferFile(line: string, ctx: { inStyle: boolean; inScript: boolean }) {
  const l = line.toLowerCase();
  if (/<style/.test(l)) ctx.inStyle = true;
  if (/<\/style/.test(l)) {
    const r: "styles.css" = "styles.css";
    ctx.inStyle = false;
    return r;
  }
  if (/<script/.test(l) && !/src=/.test(l)) ctx.inScript = true;
  if (/<\/script/.test(l)) {
    ctx.inScript = false;
    return "app.js";
  }
  if (ctx.inStyle) return "styles.css";
  if (ctx.inScript) return "app.js";
  return "index.html";
}

export function LiveBuildStudio({ html, generating, error, agents, directive }: Props) {
  const cleaned = useMemo(() => extractHtml(html), [html]);
  const lines = useMemo(() => cleaned.split("\n"), [cleaned]);

  // Assign each line to an agent + file (round-robin agents, sticky by chunk)
  const meta = useMemo<LineMeta[]>(() => {
    const out: LineMeta[] = [];
    for (let i = 0; i < lines.length; i++) {
      const a = agents.length ? agents[Math.floor(i / 6) % agents.length] : null;
      out.push({ agent: a, ts: i });
    }
    return out;
  }, [lines.length, agents]);

  const fileMap = useMemo(() => {
    const ctx = { inStyle: false, inScript: false };
    const counts: Record<string, number> = { "index.html": 0, "styles.css": 0, "app.js": 0 };
    const per: string[] = [];
    for (const line of lines) {
      const f = inferFile(line, ctx);
      per.push(f);
      counts[f] = (counts[f] ?? 0) + 1;
    }
    return { per, counts };
  }, [lines]);

  const [activeFile, setActiveFile] = useState<"index.html" | "styles.css" | "app.js">("index.html");
  const [previewHtml, setPreviewHtml] = useState("");
  const [showPreview, setShowPreview] = useState(true);
  const codeRef = useRef<HTMLDivElement>(null);
  const lastCommitRef = useRef(0);

  // Throttle iframe updates (every 220ms while streaming)
  useEffect(() => {
    if (!generating) {
      setPreviewHtml(cleaned);
      return;
    }
    const now = Date.now();
    if (now - lastCommitRef.current > 220) {
      lastCommitRef.current = now;
      setPreviewHtml(cleaned + "\n</body></html>");
    }
  }, [cleaned, generating]);

  // Auto-scroll code panel to bottom while streaming
  useEffect(() => {
    if (codeRef.current && generating) {
      codeRef.current.scrollTop = codeRef.current.scrollHeight;
    }
  }, [cleaned, generating]);

  const totalLines = lines.length;
  const lastAgent = meta[meta.length - 1]?.agent;

  // Filter shown lines by active file (preserve original line numbers)
  const visible = useMemo(() => {
    const arr: { n: number; line: string; agent: RobotRole | null }[] = [];
    for (let i = 0; i < lines.length; i++) {
      if (fileMap.per[i] === activeFile) {
        arr.push({ n: i + 1, line: lines[i], agent: meta[i]?.agent ?? null });
      }
    }
    return arr;
  }, [lines, fileMap.per, activeFile, meta]);

  return (
    <div className="space-y-4">
      <style>{`
        .tk-tag { color: var(--gold); }
        .tk-attr { color: var(--cyan, #7dd3fc); }
        .tk-s { color: var(--champagne); }
        .tk-c { color: color-mix(in oklab, var(--muted-foreground) 90%, transparent); font-style: italic; }
        .tk-p { color: color-mix(in oklab, var(--gold) 70%, var(--platinum)); }
        .tk-t { color: color-mix(in oklab, var(--foreground) 88%, transparent); }
        .caret { display:inline-block; width:7px; height:1em; vertical-align:-2px; background:var(--gold); margin-left:2px; animation: caret 1s steps(2) infinite; box-shadow: 0 0 8px var(--gold); }
        @keyframes caret { 50% { opacity: 0; } }
        .scanline { position:absolute; left:0; right:0; height:140px; pointer-events:none; background:linear-gradient(180deg, transparent, color-mix(in oklab, var(--gold) 12%, transparent), transparent); mix-blend-mode:screen; animation: scan 3.6s linear infinite; }
        @keyframes scan { 0% { transform: translateY(-160px); } 100% { transform: translateY(720px); } }
        .gutter-glow { box-shadow: inset 3px 0 0 currentColor, 0 0 14px -2px currentColor; }
      `}</style>

      {/* Header bar */}
      <div className="flex items-end justify-between">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
            ◆ atelier · live fabrication
          </div>
          <div className="font-display text-3xl leading-tight">
            {generating ? (
              <span className="flex items-center gap-3">
                <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full" style={{ background: "var(--gold)", boxShadow: "0 0 14px var(--gold)" }} />
                The assembly is composing your build…
              </span>
            ) : error ? (
              <span style={{ color: "var(--rose)" }}>Composition halted</span>
            ) : (
              <span className="gold-text italic">Delivered — your build is live</span>
            )}
          </div>
          {directive && (
            <div className="mt-1 max-w-2xl truncate font-mono text-[11px] text-muted-foreground">
              ▸ directive: <span className="text-foreground/80">{directive}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Counter label="lines" value={totalLines} />
          <Counter label="bytes" value={cleaned.length} fmt={(v) => v.toLocaleString()} />
          <button
            onClick={() => setShowPreview((p) => !p)}
            className="rounded-full border border-panel-edge bg-background/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-platinum/70 transition hover:border-gold hover:text-gold"
          >
            {showPreview ? "hide preview" : "show preview"}
          </button>
          {cleaned && !generating && (
            <a
              href={URL.createObjectURL(new Blob([cleaned], { type: "text/html" }))}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-gold rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em]"
            >
              open ↗
            </a>
          )}
        </div>
      </div>

      <div
        className={`grid gap-5 ${showPreview ? "lg:grid-cols-[1.05fr_1fr]" : "grid-cols-1"}`}
      >
        {/* CODE EDITOR */}
        <div
          className="glass relative overflow-hidden rounded-2xl"
          style={{
            borderColor: "color-mix(in oklab, var(--gold) 35%, var(--panel-edge))",
            boxShadow: "0 30px 80px -30px color-mix(in oklab, var(--gold) 40%, transparent), inset 0 1px 0 #fff1",
          }}
        >
          {/* tabs */}
          <div className="flex items-center gap-1 border-b border-panel-edge/70 bg-background/60 px-3 pt-2.5">
            {(["index.html", "styles.css", "app.js"] as const).map((f) => {
              const active = activeFile === f;
              const cnt = fileMap.counts[f] ?? 0;
              return (
                <button
                  key={f}
                  onClick={() => setActiveFile(f)}
                  className={`group relative flex items-center gap-2 rounded-t-lg px-4 py-2 font-mono text-[11px] transition ${
                    active ? "text-gold" : "text-muted-foreground hover:text-foreground"
                  }`}
                  style={{
                    background: active ? "color-mix(in oklab, var(--gold) 10%, var(--panel))" : "transparent",
                    border: active ? "1px solid color-mix(in oklab, var(--gold) 40%, transparent)" : "1px solid transparent",
                    borderBottom: "none",
                  }}
                >
                  <FileIcon file={f} />
                  <span>{f}</span>
                  <span className="font-mono text-[9px] text-muted-foreground">{cnt}</span>
                  {active && (
                    <motion.span
                      layoutId="filebar"
                      className="absolute inset-x-2 -bottom-px h-px"
                      style={{ background: "var(--gold)", boxShadow: "0 0 10px var(--gold)" }}
                    />
                  )}
                </button>
              );
            })}
            <div className="ml-auto flex items-center gap-2 pr-1 font-mono text-[10px] text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: "#ff5f57" }} />
              <span className="h-2 w-2 rounded-full" style={{ background: "#febc2e" }} />
              <span className="h-2 w-2 rounded-full" style={{ background: "#28c840" }} />
            </div>
          </div>

          {/* editor */}
          <div className="relative">
            {generating && <div className="scanline" />}
            <div
              ref={codeRef}
              className="relative max-h-[640px] min-h-[640px] overflow-auto font-mono text-[11.5px] leading-[1.65]"
              style={{ background: "color-mix(in oklab, var(--obsidian) 88%, #000)" }}
            >
              {visible.length === 0 ? (
                <div className="flex h-[640px] items-center justify-center text-muted-foreground/60">
                  <div className="text-center">
                    <div className="mb-2 font-display text-base italic gold-text">awaiting the first stroke…</div>
                    <div className="font-mono text-[10px] tracking-widest">prime is convening the team</div>
                  </div>
                </div>
              ) : (
                <div className="py-3">
                  {visible.map((row, i) => {
                    const isLast = generating && i === visible.length - 1;
                    const tokens = highlight(escapeHtml(row.line));
                    const c = row.agent?.color ?? "gold";
                    return (
                      <div
                        key={row.n}
                        className="group relative flex hover:bg-white/[0.03]"
                        style={{ color: `var(--${c})` }}
                      >
                        {/* agent gutter (color stripe) */}
                        <div
                          className="w-1 shrink-0 transition-opacity"
                          style={{
                            background: row.agent ? `var(--${row.agent.color})` : "transparent",
                            opacity: isLast ? 1 : 0.55,
                            boxShadow: isLast ? `0 0 10px var(--${c})` : undefined,
                          }}
                        />
                        {/* line number */}
                        <div
                          className="w-12 select-none px-2 text-right font-mono text-[10px]"
                          style={{ color: "color-mix(in oklab, var(--muted-foreground) 80%, transparent)" }}
                        >
                          {row.n}
                        </div>
                        {/* agent badge on hover */}
                        {row.agent && (
                          <div
                            className="absolute left-14 top-0 z-10 -translate-y-1 scale-0 rounded bg-background/95 px-2 py-0.5 font-mono text-[9px] tracking-widest opacity-0 shadow-lg transition group-hover:scale-100 group-hover:opacity-100"
                            style={{ color: `var(--${row.agent.color})`, border: `1px solid color-mix(in oklab, var(--${row.agent.color}) 60%, transparent)` }}
                          >
                            {row.agent.emoji} {row.agent.codename}
                          </div>
                        )}
                        {/* code */}
                        <pre
                          className="flex-1 whitespace-pre-wrap break-words pl-3 pr-4"
                          style={{ color: "var(--foreground)" }}
                        >
                          {tokens.map((tk, j) => (
                            <span key={j} className={tk.cls}>{tk.t}</span>
                          ))}
                          {isLast && <span className="caret" />}
                        </pre>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* status bar */}
            <div
              className="flex items-center justify-between border-t border-panel-edge/70 bg-background/60 px-4 py-2 font-mono text-[10px]"
              style={{ color: "color-mix(in oklab, var(--gold) 80%, var(--platinum))" }}
            >
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${generating ? "flicker" : ""}`} style={{ background: generating ? "var(--gold)" : "var(--emerald)" }} />
                  {generating ? "writing" : "ready"}
                </span>
                <span>•</span>
                <span>{activeFile}</span>
                <span>•</span>
                <span>utf-8</span>
              </div>
              <div className="flex items-center gap-3">
                {lastAgent && generating && (
                  <span style={{ color: `var(--${lastAgent.color})` }}>
                    {lastAgent.emoji} {lastAgent.codename} typing…
                  </span>
                )}
                <span className="text-muted-foreground">ln {totalLines}</span>
              </div>
            </div>
          </div>
        </div>

        {/* LIVE PREVIEW */}
        {showPreview && (
          <div
            className="glass overflow-hidden rounded-2xl"
            style={{
              borderColor: "color-mix(in oklab, var(--gold) 30%, var(--panel-edge))",
              boxShadow: "0 30px 80px -30px color-mix(in oklab, var(--gold) 30%, transparent)",
            }}
          >
            <div className="flex items-center gap-2 border-b border-panel-edge/70 bg-background/60 px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
              </div>
              <div className="ml-3 flex-1 truncate rounded-md bg-background/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
                {generating ? (
                  <span className="flex items-center gap-2">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "var(--gold)" }} />
                    swarm://live.preview · painting
                  </span>
                ) : (
                  <span>swarm://live.preview · sealed</span>
                )}
              </div>
              <span className="font-mono text-[10px] text-gold/80">{previewHtml.length ? "rendering" : "—"}</span>
            </div>
            <div className="relative">
              <AnimatePresence>
                {!previewHtml && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 z-10 flex items-center justify-center bg-background/50 backdrop-blur"
                  >
                    <div className="text-center">
                      <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                      <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">awaiting first paint</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <iframe
                title="live build preview"
                sandbox="allow-scripts"
                srcDoc={previewHtml || "<html><body style='background:#0a0a0c'></body></html>"}
                className="h-[640px] w-full bg-white transition-opacity"
                style={{ opacity: previewHtml ? 1 : 0 }}
              />
            </div>
          </div>
        )}
      </div>

      {/* per-agent contribution strip */}
      {agents.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {agents.map((a) => {
            const written = meta.filter((m) => m.agent?.id === a.id).length;
            const pct = totalLines ? Math.round((written / totalLines) * 100) : 0;
            const active = lastAgent?.id === a.id && generating;
            return (
              <div
                key={a.id}
                className="glass relative overflow-hidden rounded-xl px-4 py-3"
                style={{
                  borderColor: `color-mix(in oklab, var(--${a.color}) 40%, var(--panel-edge))`,
                  boxShadow: active ? `0 0 24px -6px color-mix(in oklab, var(--${a.color}) 60%, transparent)` : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base">{a.emoji}</span>
                  <span className="font-mono text-[10px] tracking-[0.2em]" style={{ color: `var(--${a.color})` }}>
                    {a.codename}
                  </span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground">{written} ln</span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full" style={{ background: "color-mix(in oklab, var(--panel-edge) 70%, transparent)" }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ type: "spring", damping: 18 }}
                    className="h-full"
                    style={{ background: `linear-gradient(90deg, color-mix(in oklab, var(--${a.color}) 70%, transparent), var(--${a.color}))`, boxShadow: `0 0 8px var(--${a.color})` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="rounded-xl border px-4 py-3 font-mono text-[11px]" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function Counter({ label, value, fmt }: { label: string; value: number; fmt?: (v: number) => string }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground">{label}</span>
      <span className="font-display text-lg text-gold tabular-nums">{fmt ? fmt(value) : value}</span>
    </div>
  );
}

function FileIcon({ file }: { file: string }) {
  const color = file.endsWith(".html") ? "#e36b3a" : file.endsWith(".css") ? "#7dd3fc" : "#f7df1e";
  const label = file.endsWith(".html") ? "H" : file.endsWith(".css") ? "C" : "JS";
  return (
    <span
      className="grid h-4 w-4 place-items-center rounded-[3px] font-mono text-[8px] font-bold text-black"
      style={{ background: color }}
    >
      {label}
    </span>
  );
}

function escapeHtml(s: string) {
  // intentionally minimal — we only need it stable for the tokenizer
  return s;
}
