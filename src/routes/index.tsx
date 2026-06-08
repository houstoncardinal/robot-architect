import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SwarmStage3D } from "@/components/SwarmStage3D";
import { LiveBuildStudio } from "@/components/LiveBuildStudio";
import { buildPlan, type SwarmStep } from "@/lib/swarm";
import type { RobotRole } from "@/lib/swarm";

export const Route = createFileRoute("/")({
  component: Index,
});

type NodeState = { robot: RobotRole; status: "spawning" | "thinking" | "working" | "done" };
type LogEntry = { id: number; from: string; text: string; tone?: "info" | "ok" | "warn"; t: string };
type Pulse = { id: number; from: string; to: string };
type Artifact = { title: string; lines: string[] };
type BuildLine = { id: number; from: string; line: string };

const SUGGESTIONS = [
  "Compose my calculus revision on integration",
  "Atelier a portfolio site for my studio",
  "Reconcile my quarterly taxes",
  "Curate a dinner from my pantry",
];

function Index() {
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [primeActive, setPrimeActive] = useState(false);
  const [nodes, setNodes] = useState<NodeState[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [pulses, setPulses] = useState<Pulse[]>([]);
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [progress, setProgress] = useState(0);
  const [builds, setBuilds] = useState<Record<string, BuildLine[]>>({});
  const [buildTitle, setBuildTitle] = useState<string>("");
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const logRef = useRef<HTMLDivElement>(null);
  const buildRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(0);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  useEffect(() => {
    if (buildRef.current) buildRef.current.scrollTop = buildRef.current.scrollHeight;
  }, [builds]);

  function reset() {
    setNodes([]);
    setLogs([]);
    setPulses([]);
    setArtifact(null);
    setProgress(0);
    setBuilds({});
    setBuildTitle("");
    setGeneratedHtml("");
    setGenError(null);
  }

  async function streamGenerate(directive: string) {
    setGenerating(true);
    setGenError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: directive }),
      });
      if (!res.ok || !res.body) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Generation failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setGeneratedHtml(acc);
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Generation error");
    } finally {
      setGenerating(false);
    }
  }

  async function launch(directive: string) {
    if (running) return;
    reset();
    setRunning(true);
    setPrimeActive(true);
    const plan = buildPlan(directive);
    const total = plan.script.length;

    // Kick off real AI generation in parallel with the scripted swarm choreography.
    const genPromise = streamGenerate(directive);

    for (let i = 0; i < plan.script.length; i++) {
      const step = plan.script[i];
      await sleep(stepDelay(step));
      apply(step);
      setProgress(Math.round(((i + 1) / total) * 100));
    }

    await genPromise;
    setPrimeActive(false);
    setRunning(false);
  }

  function apply(step: SwarmStep) {
    const now = new Date().toLocaleTimeString("en-GB", { hour12: false });
    if (step.type === "log") {
      setLogs((l) => [...l, { id: ++idRef.current, from: step.from, text: step.text, tone: step.tone, t: now }]);
    } else if (step.type === "spawn") {
      setNodes((n) => [...n, { robot: step.robot, status: "spawning" }]);
      setLogs((l) => [
        ...l,
        { id: ++idRef.current, from: "PRIME", text: `▸ Commissioned ${step.robot.codename} (${step.robot.name})`, tone: "ok", t: now },
      ]);
    } else if (step.type === "message") {
      const pid = ++idRef.current;
      setPulses((p) => [...p, { id: pid, from: step.from, to: step.to }]);
      setTimeout(() => setPulses((p) => p.filter((x) => x.id !== pid)), 1200);
      setLogs((l) => [
        ...l,
        { id: ++idRef.current, from: step.from, text: `→ ${step.to.replace("r-", "").toUpperCase()} · ${step.text}`, t: now },
      ]);
    } else if (step.type === "status") {
      setNodes((n) => n.map((x) => (x.robot.id === step.id ? { ...x, status: step.status } : x)));
    } else if (step.type === "build") {
      setBuildTitle(step.title);
      setBuilds((b) => {
        const arr = b[step.from] ?? [];
        return { ...b, [step.from]: [...arr, { id: ++idRef.current, from: step.from, line: step.line }] };
      });
    } else if (step.type === "artifact") {
      setArtifact({ title: step.title, lines: step.lines });
    }
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-panel-edge/60 bg-background/70 backdrop-blur-2xl">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 py-5">
          <div className="flex items-center gap-4">
            <div
              className="relative flex h-11 w-11 items-center justify-center rounded-full"
              style={{
                background: "radial-gradient(circle at 30% 30%, var(--champagne), var(--gold) 40%, var(--gold-deep))",
                boxShadow: "inset 0 1px 0 #fff8, 0 6px 22px -4px color-mix(in oklab, var(--gold) 55%, transparent)",
              }}
            >
              <span className="font-display text-xl font-semibold text-obsidian" style={{ color: "var(--obsidian)" }}>S</span>
              <span className="absolute inset-0 rounded-full pulse-ring" style={{ border: "1px solid var(--gold)" }} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">
                <span className="gold-text">Swarm</span>
                <span className="ml-2 text-foreground/70">Atelier</span>
              </h1>
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                a private orchestrator · maison no. 01
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-8 md:flex">
            <Stat label="status" value={running ? "in session" : "at rest"} active={running} />
            <Stat label="agents" value={nodes.length.toString().padStart(2, "0")} />
            <Stat label="progress" value={`${progress}%`} />
          </div>
        </div>
        <div className="gold-rule" />
      </header>

      <main className="mx-auto max-w-[1600px] px-8 py-10">
        {/* Hero / Command */}
        <section className="mb-10 grid items-end gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
              ✦ a directive to the maison
            </div>
            <h2 className="font-display text-5xl leading-[1.05] tracking-tight text-foreground md:text-6xl">
              Speak once. <span className="italic gold-text">An assembly</span>
              <br />
              of robots will <span className="italic">attend to it.</span>
            </h2>
            <p className="mt-4 max-w-xl text-base leading-relaxed text-muted-foreground">
              The Prime convenes a bespoke team — each specialist commissioned for its craft.
              Watch them converse, deliberate, and produce, rendered in three dimensions like a
              ballroom of intelligent agents.
            </p>
          </div>

          <div className="glass rounded-3xl p-6">
            <div className="mb-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.32em] text-gold">
              <span className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gold flicker" />
                prime · awaiting directive
              </span>
              <span className="text-platinum/50">enter to dispatch</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                launch(input);
              }}
              className="flex flex-col gap-3"
            >
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-display text-2xl text-gold">
                  ❯
                </span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={running}
                  placeholder="Compose, build, reconcile, plan, curate…"
                  className="w-full rounded-2xl border bg-background/60 px-11 py-4 font-sans text-[15px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 disabled:opacity-60"
                  style={{
                    borderColor: "color-mix(in oklab, var(--gold) 30%, var(--panel-edge))",
                    boxShadow: "inset 0 1px 0 #fff1",
                  }}
                />
              </div>
              <button
                type="submit"
                disabled={running || !input.trim()}
                className="btn-gold rounded-2xl px-8 py-4 font-display text-base font-semibold tracking-wide transition hover:brightness-110 disabled:opacity-50"
              >
                {running ? "the maison is at work…" : "Dispatch the Swarm  ▸"}
              </button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={running}
                  onClick={() => {
                    setInput(s);
                    launch(s);
                  }}
                  className="rounded-full border border-panel-edge bg-background/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-platinum/70 transition hover:border-gold hover:text-gold disabled:opacity-40"
                >
                  ✦ {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Stage + Comms */}
        <section className="grid gap-6 lg:grid-cols-[1fr_400px]">
          <div className="h-[640px]">
            <SwarmStage3D primeActive={primeActive} nodes={nodes} pulses={pulses} />
          </div>

          <aside className="flex h-[640px] flex-col gap-4">
            <div className="glass flex flex-1 flex-col overflow-hidden rounded-2xl">
              <div className="flex items-center justify-between border-b border-panel-edge/70 px-5 py-4">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-gold flicker" />
                  salon · comms feed
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{logs.length} entries</span>
              </div>
              <div ref={logRef} className="flex-1 space-y-1.5 overflow-y-auto px-5 py-4 font-mono text-[11px]">
                {logs.length === 0 && (
                  <div className="text-muted-foreground/60">
                    <span className="text-gold">»</span> awaiting your directive…
                  </div>
                )}
                <AnimatePresence initial={false}>
                  {logs.map((l) => (
                    <motion.div
                      key={l.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex gap-2 leading-snug"
                    >
                      <span className="text-muted-foreground/40">{l.t}</span>
                      <span
                        className={
                          l.from === "PRIME"
                            ? "text-gold"
                            : l.tone === "ok"
                              ? "text-emerald"
                              : l.tone === "warn"
                                ? "text-rose"
                                : "text-champagne"
                        }
                        style={{
                          color:
                            l.from === "PRIME"
                              ? "var(--gold)"
                              : l.tone === "ok"
                                ? "var(--emerald)"
                                : l.tone === "warn"
                                  ? "var(--rose)"
                                  : "var(--champagne)",
                        }}
                      >
                        [{l.from}]
                      </span>
                      <span className="flex-1 text-foreground/90">{l.text}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>

            <AnimatePresence>
              {artifact && (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="rounded-2xl p-5"
                  style={{
                    background: "linear-gradient(180deg, color-mix(in oklab, var(--gold) 14%, var(--panel)), var(--panel))",
                    border: "1px solid color-mix(in oklab, var(--gold) 45%, transparent)",
                    boxShadow: "0 30px 60px -30px color-mix(in oklab, var(--gold) 45%, transparent)",
                  }}
                >
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]" style={{ color: "var(--gold)" }}>
                    ✦ delivered · {artifact.title}
                  </div>
                  <ul className="space-y-1 font-mono text-[11px] text-foreground/90">
                    {artifact.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </aside>
        </section>

        {/* Live AI build — real website streaming in */}
        {(generating || generatedHtml || genError) && (
          <section className="mt-10">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
                  ◆ live fabrication · real-time
                </div>
                <div className="font-display text-2xl">
                  {generating ? (
                    <span className="flex items-center gap-3">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: "var(--gold)" }} />
                      The swarm is writing your build…
                    </span>
                  ) : genError ? (
                    <span style={{ color: "var(--rose)" }}>Generation halted</span>
                  ) : (
                    <span>Delivered — your build is live</span>
                  )}
                </div>
                <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {generatedHtml ? `${generatedHtml.length.toLocaleString()} chars streamed` : "awaiting first token…"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setViewMode("preview")}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition ${
                    viewMode === "preview" ? "border-gold text-gold" : "border-panel-edge text-muted-foreground hover:text-foreground"
                  }`}
                >
                  preview
                </button>
                <button
                  onClick={() => setViewMode("code")}
                  className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition ${
                    viewMode === "code" ? "border-gold text-gold" : "border-panel-edge text-muted-foreground hover:text-foreground"
                  }`}
                >
                  source
                </button>
                {generatedHtml && !generating && (
                  <a
                    href={URL.createObjectURL(new Blob([extractHtml(generatedHtml)], { type: "text/html" }))}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-gold px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-gold hover:bg-gold/10"
                  >
                    open ↗
                  </a>
                )}
              </div>
            </div>

            <div
              className="glass overflow-hidden rounded-2xl"
              style={{
                borderColor: "color-mix(in oklab, var(--gold) 35%, var(--panel-edge))",
                boxShadow: "0 30px 80px -30px color-mix(in oklab, var(--gold) 35%, transparent)",
              }}
            >
              <div className="flex items-center gap-2 border-b border-panel-edge/70 bg-background/50 px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#ff5f57" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#febc2e" }} />
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#28c840" }} />
                <span className="ml-3 flex-1 truncate rounded-md bg-background/60 px-3 py-1 font-mono text-[10px] text-muted-foreground">
                  swarm://live-build/{Math.abs(hashStr(generatedHtml.slice(0, 40))).toString(36)}
                </span>
                {generating && (
                  <span className="font-mono text-[10px] text-gold">
                    ● writing
                  </span>
                )}
              </div>

              {viewMode === "preview" ? (
                <iframe
                  key={generatedHtml.length > 800 ? "ready" : "stream"}
                  title="live build"
                  sandbox="allow-scripts"
                  srcDoc={generatedHtml ? extractHtml(generatedHtml) : "<html><body style='background:#0a0a0c;color:#888;font-family:monospace;display:grid;place-items:center;height:100vh'>compiling…</body></html>"}
                  className="h-[700px] w-full bg-white"
                />
              ) : (
                <pre className="max-h-[700px] overflow-auto bg-background/40 p-5 font-mono text-[11px] leading-relaxed text-foreground/80">
                  <code>{generatedHtml || "// awaiting stream…"}</code>
                </pre>
              )}
            </div>

            {genError && (
              <div className="mt-3 rounded-xl border px-4 py-3 font-mono text-[11px]" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
                {genError}
              </div>
            )}
          </section>
        )}

        {/* Live build atelier */}
        {nodes.length > 0 && (
          <section className="mt-10">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">▣ workshop</div>
                <div className="font-display text-2xl">{buildTitle || "in progress"}</div>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.32em] text-muted-foreground">
                streaming from {nodes.length} ateliers
              </div>
            </div>
            <div ref={buildRef} className="grid max-h-[320px] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-4">
              {nodes.map((n) => {
                const stream = builds[n.robot.codename] ?? [];
                return (
                  <div
                    key={n.robot.id}
                    className="glass flex flex-col rounded-2xl p-4"
                    style={{ borderColor: `color-mix(in oklab, var(--${n.robot.color}) 45%, var(--panel-edge))` }}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <span className="text-base">{n.robot.emoji}</span>
                      <span
                        className="font-mono text-[10px] font-bold tracking-[0.2em]"
                        style={{ color: `var(--${n.robot.color})` }}
                      >
                        {n.robot.codename}
                      </span>
                      <span
                        className={`ml-auto h-1.5 w-1.5 rounded-full ${
                          n.status === "working" ? "flicker" : ""
                        }`}
                        style={{
                          background:
                            n.status === "done"
                              ? "var(--emerald)"
                              : n.status === "working"
                                ? `var(--${n.robot.color})`
                                : "var(--muted-foreground)",
                        }}
                      />
                    </div>
                    <div className="space-y-1 font-mono text-[10px] leading-snug text-foreground/85">
                      <AnimatePresence initial={false}>
                        {stream.map((b) => (
                          <motion.div
                            key={b.id}
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex gap-1"
                          >
                            <span style={{ color: `var(--${n.robot.color})` }}>›</span>
                            <span className="flex-1">{b.line.replace(`[${n.robot.codename}] `, "")}</span>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                      {stream.length === 0 && (
                        <div className="text-muted-foreground/50">awaiting task…</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Roster */}
        {nodes.length > 0 && (
          <section className="mt-8 pb-12">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.4em] text-gold/80">
              · the assembly
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {nodes.map((n) => (
                <motion.div
                  key={n.robot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass flex items-center gap-3 rounded-2xl p-4"
                >
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-xl text-xl"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, color-mix(in oklab, var(--${n.robot.color}) 35%, transparent), color-mix(in oklab, var(--${n.robot.color}) 5%, var(--panel)))`,
                      border: `1px solid color-mix(in oklab, var(--${n.robot.color}) 70%, transparent)`,
                      boxShadow: `0 0 18px color-mix(in oklab, var(--${n.robot.color}) 30%, transparent)`,
                    }}
                  >
                    {n.robot.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] font-bold tracking-[0.18em]" style={{ color: `var(--${n.robot.color})` }}>
                      {n.robot.codename}
                    </div>
                    <div className="truncate font-display text-base text-foreground/90">{n.robot.name}</div>
                    <div className="truncate font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                      {n.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-panel-edge/60 py-6">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-8 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <span>swarm atelier · maison no. 01</span>
          <span className="gold-text">— composed for the patron —</span>
        </div>
      </footer>
    </div>
  );
}

function Stat({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex flex-col items-end">
      <span className="font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">{label}</span>
      <span className="flex items-center gap-2 font-display text-lg">
        <span className={`h-1.5 w-1.5 rounded-full ${active ? "flicker" : ""}`} style={{ background: active ? "var(--gold)" : "var(--muted-foreground)" }} />
        <span style={{ color: active ? "var(--gold)" : "var(--foreground)" }}>{value}</span>
      </span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function extractHtml(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  const fence = s.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const i = s.search(/<!doctype html|<html/i);
  if (i > 0) s = s.slice(i);
  return s;
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

function stepDelay(step: SwarmStep): number {
  switch (step.type) {
    case "spawn":
      return 320;
    case "message":
      return 200;
    case "status":
      return 120;
    case "log":
      return 140;
    case "build":
      return 220;
    case "artifact":
      return 600;
    default:
      return 160;
  }
}
