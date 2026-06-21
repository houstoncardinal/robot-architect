import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  assemblePreview,
  fileIcon,
  languageFor,
  parseIdeStream,
} from "@/lib/ide-stream";

type Props = {
  directive: string;
  autoStartKey?: number; // bump to (re)kick generation
};

type TermLine = {
  id: number;
  tone: "sys" | "ok" | "warn" | "err" | "agent" | "user";
  prefix: string;
  text: string;
  t: string;
};

const AGENTS = ["architect", "designer", "engineer", "deployer"] as const;
type Agent = (typeof AGENTS)[number];
const AGENT_COLOR: Record<Agent, string> = {
  architect: "var(--gold)",
  designer: "var(--rose, #f5a8c4)",
  engineer: "var(--cyan, #7dd3fc)",
  deployer: "var(--emerald, #6ee7b7)",
};

export function IDEStudio({ directive, autoStartKey }: Props) {
  const [files, setFiles] = useState<Record<string, string>>({});
  const [deleted, setDeleted] = useState<Set<string>>(new Set());
  const [activePath, setActivePath] = useState<string>("index.html");
  const [streaming, setStreaming] = useState(false);
  const [term, setTerm] = useState<TermLine[]>([]);
  const [chat, setChat] = useState("");
  const [previewKey, setPreviewKey] = useState(0);
  const [tab, setTab] = useState<"preview" | "terminal">("preview");
  const [dirtyAt, setDirtyAt] = useState(0);
  const idRef = useRef(0);
  const termRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Throttled preview refresh
  const previewHtml = useMemo(() => assemblePreview(files), [files, dirtyAt]);
  const previewSrcRef = useRef("");
  const previewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [previewSrc, setPreviewSrc] = useState("");
  useEffect(() => {
    if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    previewTimerRef.current = setTimeout(() => {
      previewSrcRef.current = previewHtml;
      setPreviewSrc(previewHtml);
    }, streaming ? 280 : 80);
    return () => {
      if (previewTimerRef.current) clearTimeout(previewTimerRef.current);
    };
  }, [previewHtml, streaming]);

  useEffect(() => {
    if (termRef.current) termRef.current.scrollTop = termRef.current.scrollHeight;
  }, [term]);

  const pushTerm = useCallback((tone: TermLine["tone"], prefix: string, text: string) => {
    setTerm((t) => [
      ...t,
      {
        id: ++idRef.current,
        tone,
        prefix,
        text,
        t: new Date().toLocaleTimeString("en-GB", { hour12: false }),
      },
    ]);
  }, []);

  const pickAgentForPath = (path: string): Agent => {
    if (path.endsWith(".css")) return "designer";
    if (path.endsWith(".js") || path.endsWith(".ts")) return "engineer";
    if (path.endsWith(".html")) return "architect";
    return "deployer";
  };

  // Streaming runner — used by both initial generate and refinement chat
  const runStream = useCallback(
    async (opts: {
      url: string;
      body: unknown;
      mode: "generate" | "refine";
      userLabel?: string;
    }) => {
      if (streaming) return;
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      setStreaming(true);
      if (opts.userLabel) pushTerm("user", "you ❯", opts.userLabel);
      pushTerm("sys", "swarm ▸", opts.mode === "generate" ? "convening agents…" : "dispatching refinement to the team…");
      try {
        const res = await fetch(opts.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(opts.body),
          signal: ac.signal,
        });
        if (!res.ok || !res.body) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Stream failed (${res.status})`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let acc = "";
        const seenFiles = new Set<string>();
        const seenDeletes = new Set<string>();
        let lastActive: string | null = null;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          const parsed = parseIdeStream(acc);

          // Apply file updates incrementally
          setFiles((prev) => {
            const next = { ...prev };
            for (const [path, content] of Object.entries(parsed.files)) {
              if (deleted.has(path)) continue;
              next[path] = content;
            }
            return next;
          });
          if (parsed.deletes.length) {
            setDeleted((d) => {
              const nd = new Set(d);
              for (const p of parsed.deletes) {
                if (!seenDeletes.has(p)) {
                  seenDeletes.add(p);
                  nd.add(p);
                  pushTerm("warn", `${pickAgentForPath(p)} ✗`, `removed ${p}`);
                }
              }
              return nd;
            });
            setFiles((prev) => {
              const next = { ...prev };
              for (const p of parsed.deletes) delete next[p];
              return next;
            });
          }

          // Announce newly seen files
          for (const path of Object.keys(parsed.files)) {
            if (!seenFiles.has(path)) {
              seenFiles.add(path);
              const a = pickAgentForPath(path);
              pushTerm("agent", `${a} ✎`, `writing ${path}`);
              setActivePath(path);
            }
          }
          // Active-cursor follow
          if (parsed.activePath && parsed.activePath !== lastActive) {
            lastActive = parsed.activePath;
            setActivePath(parsed.activePath);
          }
        }

        pushTerm("ok", "swarm ✓", "delivery complete");
        setPreviewKey((k) => k + 1);
      } catch (e) {
        if ((e as Error).name === "AbortError") {
          pushTerm("warn", "swarm ⨯", "aborted");
        } else {
          pushTerm("err", "swarm ✗", (e as Error).message);
        }
      } finally {
        setStreaming(false);
        abortRef.current = null;
      }
    },
    [streaming, pushTerm, deleted],
  );

  // Auto-start generation when directive changes
  useEffect(() => {
    if (!directive) return;
    setFiles({});
    setDeleted(new Set());
    setTerm([]);
    setActivePath("index.html");
    runStream({
      url: "/api/ide/generate",
      body: { prompt: directive },
      mode: "generate",
      userLabel: directive,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStartKey]);

  const handleEditorMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const sortedPaths = useMemo(() => {
    return Object.keys(files).sort((a, b) => {
      const pri = (p: string) =>
        p === "index.html" ? 0 : p.endsWith(".html") ? 1 : p.endsWith(".css") ? 2 : p.endsWith(".js") ? 3 : 4;
      const d = pri(a) - pri(b);
      return d !== 0 ? d : a.localeCompare(b);
    });
  }, [files]);

  // Make sure activePath is always valid
  useEffect(() => {
    if (!files[activePath] && sortedPaths.length) {
      setActivePath(sortedPaths[0]);
    }
  }, [files, activePath, sortedPaths]);

  const total = useMemo(
    () => Object.values(files).reduce((n, s) => n + s.length, 0),
    [files],
  );
  const lineCount = useMemo(
    () => Object.values(files).reduce((n, s) => n + s.split("\n").length, 0),
    [files],
  );

  function refine() {
    const msg = chat.trim();
    if (!msg || streaming || !Object.keys(files).length) return;
    setChat("");
    runStream({
      url: "/api/ide/chat",
      body: { message: msg, files },
      mode: "refine",
      userLabel: msg,
    });
  }

  function newFile() {
    const name = window.prompt("New file path", "components.js")?.trim();
    if (!name) return;
    if (files[name] != null) {
      setActivePath(name);
      return;
    }
    setFiles((f) => ({ ...f, [name]: "" }));
    setActivePath(name);
    pushTerm("user", "you +", `created ${name}`);
  }

  function deleteFile(path: string) {
    if (!confirm(`Delete ${path}?`)) return;
    setFiles((f) => {
      const n = { ...f };
      delete n[path];
      return n;
    });
    pushTerm("user", "you ✗", `deleted ${path}`);
  }

  function download() {
    // Bundle as a single HTML if only index, else as a zip-like dump
    const asm = assemblePreview(files);
    const blob = new Blob([asm || files["index.html"] || ""], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "swarm-build.html";
    a.click();
    URL.revokeObjectURL(url);
  }

  function openStandalone() {
    const asm = assemblePreview(files);
    if (!asm) return;
    const blob = new Blob([asm], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-4">
      <style>{`
        .ide-shell { background: color-mix(in oklab, var(--obsidian) 92%, #000); }
        .scanline-soft { position:absolute; left:0; right:0; height:120px; pointer-events:none; background:linear-gradient(180deg, transparent, color-mix(in oklab, var(--gold) 8%, transparent), transparent); mix-blend-mode:screen; animation: scan2 4.2s linear infinite; }
        @keyframes scan2 { 0% { transform: translateY(-160px); } 100% { transform: translateY(720px); } }
        .dot-flick { animation: dotflick 1.2s ease-in-out infinite; }
        @keyframes dotflick { 0%,100%{opacity:1} 50%{opacity:.35} }
      `}</style>

      {/* Header bar */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
            ◆ swarm · ide
          </div>
          <div className="font-display text-3xl leading-tight">
            {streaming ? (
              <span className="flex items-center gap-3">
                <span className="dot-flick inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--gold)", boxShadow: "0 0 14px var(--gold)" }} />
                <span className="italic">the assembly is composing…</span>
              </span>
            ) : (
              <span className="gold-text italic">workspace · live</span>
            )}
          </div>
          {directive && (
            <div className="mt-1 max-w-2xl truncate font-mono text-[11px] text-muted-foreground">
              ▸ directive: <span className="text-foreground/80">{directive}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <Counter label="files" value={Object.keys(files).length} />
          <Counter label="lines" value={lineCount} />
          <Counter label="bytes" value={total} fmt={(v) => v.toLocaleString()} />
          <button
            onClick={download}
            disabled={!Object.keys(files).length}
            className="rounded-full border border-panel-edge bg-background/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-platinum/70 transition hover:border-gold hover:text-gold disabled:opacity-40"
          >
            download
          </button>
          <button
            onClick={openStandalone}
            disabled={!Object.keys(files).length}
            className="btn-gold rounded-full px-4 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] disabled:opacity-40"
          >
            open ↗
          </button>
        </div>
      </div>

      {/* IDE grid */}
      <div
        className="ide-shell glass overflow-hidden rounded-2xl"
        style={{
          borderColor: "color-mix(in oklab, var(--gold) 30%, var(--panel-edge))",
          boxShadow: "0 30px 80px -30px color-mix(in oklab, var(--gold) 35%, transparent), inset 0 1px 0 #fff1",
        }}
      >
        {/* Title bar */}
        <div className="flex items-center gap-2 border-b border-panel-edge/70 bg-background/60 px-4 py-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
          </div>
          <div className="ml-3 flex flex-1 items-center gap-2 truncate font-mono text-[10px] text-muted-foreground">
            <span className="text-gold">swarm-ide</span>
            <span>›</span>
            <span className="truncate">{activePath || "—"}</span>
            {streaming && (
              <span className="ml-2 flex items-center gap-1 text-gold">
                <span className="dot-flick inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--gold)" }} />
                streaming
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <TabBtn active={tab === "preview"} onClick={() => setTab("preview")}>preview</TabBtn>
            <TabBtn active={tab === "terminal"} onClick={() => setTab("terminal")}>terminal</TabBtn>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[220px_1.2fr_1fr]">
          {/* File tree */}
          <aside className="border-r border-panel-edge/60 bg-background/40">
            <div className="flex items-center justify-between border-b border-panel-edge/60 px-3 py-2">
              <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground">explorer</span>
              <button
                onClick={newFile}
                className="rounded border border-panel-edge/70 px-1.5 py-0.5 font-mono text-[9px] text-platinum/70 hover:border-gold hover:text-gold"
                title="new file"
              >
                + new
              </button>
            </div>
            <div className="max-h-[640px] min-h-[640px] overflow-auto py-2">
              {sortedPaths.length === 0 ? (
                <div className="px-3 py-6 text-center font-mono text-[10px] text-muted-foreground/60">
                  awaiting first file…
                </div>
              ) : (
                sortedPaths.map((p) => {
                  const ic = fileIcon(p);
                  const active = p === activePath;
                  return (
                    <div
                      key={p}
                      onClick={() => setActivePath(p)}
                      className={`group flex cursor-pointer items-center gap-2 px-3 py-1.5 font-mono text-[11px] ${active ? "bg-white/[0.05] text-gold" : "text-foreground/80 hover:bg-white/[0.025]"}`}
                    >
                      <span
                        className="grid h-4 w-4 shrink-0 place-items-center rounded-[3px] font-mono text-[8px] font-bold text-black"
                        style={{ background: ic.color }}
                      >
                        {ic.label}
                      </span>
                      <span className="flex-1 truncate">{p}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFile(p);
                        }}
                        className="opacity-0 transition group-hover:opacity-100 hover:text-rose-400"
                        title="delete"
                      >
                        ×
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </aside>

          {/* Editor */}
          <div className="relative border-r border-panel-edge/60">
            {streaming && <div className="scanline-soft" />}
            <div className="flex items-center gap-1 border-b border-panel-edge/60 bg-background/40 px-2 pt-1.5">
              {sortedPaths.slice(0, 6).map((p) => {
                const active = p === activePath;
                return (
                  <button
                    key={p}
                    onClick={() => setActivePath(p)}
                    className={`relative rounded-t-md px-3 py-1.5 font-mono text-[10px] transition ${active ? "text-gold" : "text-muted-foreground hover:text-foreground"}`}
                    style={{
                      background: active ? "color-mix(in oklab, var(--gold) 10%, var(--panel))" : "transparent",
                      border: active ? "1px solid color-mix(in oklab, var(--gold) 40%, transparent)" : "1px solid transparent",
                      borderBottom: "none",
                    }}
                  >
                    {p.split("/").pop()}
                    {active && (
                      <motion.span
                        layoutId="ide-tab"
                        className="absolute inset-x-2 -bottom-px h-px"
                        style={{ background: "var(--gold)", boxShadow: "0 0 10px var(--gold)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
            <div style={{ height: 640 }}>
              <Editor
                height="100%"
                theme="vs-dark"
                language={languageFor(activePath)}
                path={activePath}
                value={files[activePath] ?? ""}
                onMount={handleEditorMount}
                onChange={(v) => {
                  setFiles((f) => ({ ...f, [activePath]: v ?? "" }));
                  setDirtyAt(Date.now());
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12.5,
                  fontFamily: "ui-monospace, 'JetBrains Mono', Menlo, monospace",
                  lineNumbersMinChars: 3,
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "phase",
                  cursorSmoothCaretAnimation: "on",
                  renderLineHighlight: "gutter",
                  padding: { top: 12, bottom: 12 },
                  readOnly: streaming,
                  wordWrap: "on",
                }}
              />
            </div>
          </div>

          {/* Right: preview OR terminal */}
          <div className="relative">
            {tab === "preview" ? (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-panel-edge/60 bg-background/40 px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
                    live preview
                  </span>
                  <div className="ml-2 flex-1 truncate rounded-md bg-background/60 px-2 py-1 font-mono text-[10px] text-muted-foreground">
                    swarm://preview · {streaming ? "rendering" : "sealed"}
                  </div>
                  <button
                    onClick={() => setPreviewKey((k) => k + 1)}
                    className="rounded border border-panel-edge/70 px-2 py-0.5 font-mono text-[9px] text-platinum/70 hover:border-gold hover:text-gold"
                  >
                    ↻
                  </button>
                </div>
                <div className="relative flex-1" style={{ height: 640 }}>
                  <AnimatePresence>
                    {!previewSrc && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 grid place-items-center bg-background/60 backdrop-blur"
                      >
                        <div className="text-center">
                          <div className="mx-auto mb-3 h-12 w-12 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                          <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
                            awaiting first paint
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <iframe
                    key={previewKey}
                    title="swarm preview"
                    sandbox="allow-scripts allow-forms"
                    srcDoc={previewSrc || "<html><body style='background:#0a0a0c'></body></html>"}
                    className="h-full w-full bg-white"
                    style={{ height: 640 }}
                  />
                </div>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="flex items-center gap-2 border-b border-panel-edge/60 bg-background/40 px-3 py-2">
                  <span className="font-mono text-[9px] uppercase tracking-[0.32em] text-muted-foreground">
                    swarm terminal
                  </span>
                  <span className="ml-auto font-mono text-[9px] text-muted-foreground">{term.length} entries</span>
                </div>
                <div
                  ref={termRef}
                  className="flex-1 space-y-1 overflow-auto px-3 py-2 font-mono text-[11px]"
                  style={{ height: 640, background: "color-mix(in oklab, var(--obsidian) 95%, #000)" }}
                >
                  {term.length === 0 && (
                    <div className="text-muted-foreground/60">› terminal idle.</div>
                  )}
                  <AnimatePresence initial={false}>
                    {term.map((l) => (
                      <motion.div
                        key={l.id}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex gap-2 leading-snug"
                      >
                        <span className="text-muted-foreground/40">{l.t}</span>
                        <span
                          style={{
                            color:
                              l.tone === "ok"
                                ? "var(--emerald)"
                                : l.tone === "warn"
                                  ? "var(--rose)"
                                  : l.tone === "err"
                                    ? "#ff6b6b"
                                    : l.tone === "user"
                                      ? "var(--champagne)"
                                      : l.tone === "agent"
                                        ? "var(--gold)"
                                        : "var(--platinum)",
                          }}
                          className="shrink-0"
                        >
                          {l.prefix}
                        </span>
                        <span className="flex-1 text-foreground/90">{l.text}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Composer / chat for iterative refinement */}
        <div className="border-t border-panel-edge/70 bg-background/60 px-4 py-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              refine();
            }}
            className="flex items-center gap-2"
          >
            <span className="font-display text-lg text-gold">❯</span>
            <input
              value={chat}
              onChange={(e) => setChat(e.target.value)}
              disabled={streaming || !Object.keys(files).length}
              placeholder={
                Object.keys(files).length
                  ? "ask the swarm to refine — 'add a pricing section', 'switch to a dark emerald palette'…"
                  : "the assembly is preparing your workspace…"
              }
              className="flex-1 rounded-xl border bg-background/60 px-3 py-2 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
              style={{
                borderColor: "color-mix(in oklab, var(--gold) 25%, var(--panel-edge))",
              }}
            />
            {streaming ? (
              <button
                type="button"
                onClick={() => abortRef.current?.abort()}
                className="rounded-xl border border-rose-400/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-rose-300 hover:bg-rose-400/10"
              >
                stop
              </button>
            ) : (
              <button
                type="submit"
                disabled={!chat.trim() || !Object.keys(files).length}
                className="btn-gold rounded-xl px-4 py-2 font-mono text-[10px] uppercase tracking-[0.25em] disabled:opacity-40"
              >
                refine ▸
              </button>
            )}
          </form>
          {/* Agent legend */}
          <div className="mt-2 flex flex-wrap items-center gap-3 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {AGENTS.map((a) => (
              <span key={a} className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: AGENT_COLOR[a] }} />
                {a}
              </span>
            ))}
            <span className="ml-auto text-platinum/40">
              edits sync to preview · refinements stream from the team
            </span>
          </div>
        </div>
      </div>
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

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded-md px-3 py-1 uppercase tracking-[0.25em] transition"
      style={{
        background: active ? "color-mix(in oklab, var(--gold) 14%, transparent)" : "transparent",
        color: active ? "var(--gold)" : "var(--muted-foreground)",
        border: active ? "1px solid color-mix(in oklab, var(--gold) 45%, transparent)" : "1px solid transparent",
      }}
    >
      {children}
    </button>
  );
}
