import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SwarmCanvas } from "@/components/SwarmCanvas";
import { buildPlan, type RobotRole, type SwarmStep } from "@/lib/swarm";

export const Route = createFileRoute("/")({
  component: Index,
});

type NodeState = { robot: RobotRole; status: "spawning" | "thinking" | "working" | "done" };
type LogEntry = { id: number; from: string; text: string; tone?: "info" | "ok" | "warn"; t: string };
type Pulse = { id: number; from: string; to: string };
type Artifact = { title: string; lines: string[] };
type BuildLine = { id: number; from: string; line: string };

const SUGGESTIONS = [
  "Do my calculus homework on integration",
  "Build me a portfolio website",
  "Help me file my taxes",
  "Plan dinner from what I have",
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
  }

  async function launch(directive: string) {
    if (running) return;
    reset();
    setRunning(true);
    setPrimeActive(true);
    const plan = buildPlan(directive);
    const total = plan.script.length;

    for (let i = 0; i < plan.script.length; i++) {
      const step = plan.script[i];
      await sleep(stepDelay(step));
      apply(step);
      setProgress(Math.round(((i + 1) / total) * 100));
    }

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
        { id: ++idRef.current, from: "PRIME", text: `▶ Spawned ${step.robot.codename} (${step.robot.name})`, tone: "ok", t: now },
      ]);
    } else if (step.type === "message") {
      const pid = ++idRef.current;
      setPulses((p) => [...p, { id: pid, from: step.from, to: step.to }]);
      setTimeout(() => setPulses((p) => p.filter((x) => x.id !== pid)), 1000);
      setLogs((l) => [
        ...l,
        { id: ++idRef.current, from: step.from, text: `→ ${step.to.replace("r-", "").toUpperCase()}: ${step.text}`, t: now },
      ]);
    } else if (step.type === "status") {
      setNodes((n) => n.map((x) => (x.robot.id === step.id ? { ...x, status: step.status } : x)));
    } else if (step.type === "artifact") {
      setArtifact({ title: step.title, lines: step.lines });
    }
  }

  return (
    <div className="min-h-screen w-full">
      {/* Header */}
      <header className="border-b border-panel-edge bg-panel/30 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-cyan bg-cyan/10">
              <span className="text-xl">🤖</span>
              <span className="absolute inset-0 rounded-full pulse-ring border border-cyan" />
            </div>
            <div>
              <h1 className="font-mono text-base font-bold tracking-[0.3em] text-foreground">SWARM</h1>
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                robotic task orchestrator · v0.1
              </p>
            </div>
          </div>
          <div className="hidden items-center gap-6 font-mono text-[10px] uppercase tracking-widest md:flex">
            <Stat label="status" value={running ? "active" : "standby"} active={running} />
            <Stat label="agents" value={nodes.length.toString().padStart(2, "0")} />
            <Stat label="progress" value={`${progress}%`} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {/* Command bar */}
        <section className="mb-6">
          <div className="rounded-2xl border border-panel-edge bg-panel/40 p-5 backdrop-blur">
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyan">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan" />
              prime · awaiting directive
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                launch(input);
              }}
              className="flex flex-col gap-3 md:flex-row"
            >
              <div className="relative flex-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 font-mono text-cyan">
                  ❯
                </span>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={running}
                  placeholder="Tell me what to do… build, solve, plan, anything"
                  className="w-full rounded-xl border border-panel-edge bg-background/60 px-10 py-4 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-cyan focus:outline-none focus:ring-1 focus:ring-cyan disabled:opacity-60"
                />
              </div>
              <button
                type="submit"
                disabled={running || !input.trim()}
                className="group relative overflow-hidden rounded-xl border border-cyan bg-cyan/10 px-8 py-4 font-mono text-xs font-bold uppercase tracking-widest text-cyan transition hover:bg-cyan hover:text-background disabled:opacity-50"
              >
                {running ? "swarm active…" : "deploy swarm ▸"}
              </button>
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  disabled={running}
                  onClick={() => {
                    setInput(s);
                    launch(s);
                  }}
                  className="rounded-full border border-panel-edge bg-background/40 px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition hover:border-magenta hover:text-magenta disabled:opacity-40"
                >
                  + {s}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Visual workspace */}
        <section className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="h-[600px]">
            <SwarmCanvas primeActive={primeActive} nodes={nodes} pulses={pulses} />
          </div>

          <aside className="flex h-[600px] flex-col gap-4">
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-panel-edge bg-panel/40 backdrop-blur">
              <div className="flex items-center justify-between border-b border-panel-edge px-4 py-3">
                <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-magenta">
                  <span className="h-1.5 w-1.5 rounded-full bg-magenta flicker" />
                  comms feed
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{logs.length} entries</span>
              </div>
              <div ref={logRef} className="flex-1 space-y-1 overflow-y-auto px-4 py-3 font-mono text-[11px]">
                {logs.length === 0 && (
                  <div className="text-muted-foreground/60">
                    <span className="text-cyan">$</span> waiting for directive…
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
                      <span className="text-muted-foreground/50">{l.t}</span>
                      <span
                        className={
                          l.from === "PRIME"
                            ? "text-cyan"
                            : l.tone === "ok"
                              ? "text-lime"
                              : l.tone === "warn"
                                ? "text-amber"
                                : "text-magenta"
                        }
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
                  className="rounded-2xl border border-lime/60 bg-lime/5 p-4 backdrop-blur"
                  style={{ boxShadow: "0 0 30px color-mix(in oklab, var(--lime) 20%, transparent)" }}
                >
                  <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-lime">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime" />
                    output · {artifact.title}
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

        {/* Roster */}
        {nodes.length > 0 && (
          <section className="mt-6">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              · active roster
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {nodes.map((n) => (
                <motion.div
                  key={n.robot.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-xl border border-panel-edge bg-panel/40 p-3 backdrop-blur"
                >
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-lg"
                    style={{
                      background: `color-mix(in oklab, var(--${n.robot.color}) 15%, transparent)`,
                      border: `1px solid var(--${n.robot.color})`,
                    }}
                  >
                    {n.robot.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[10px] font-bold tracking-wider" style={{ color: `var(--${n.robot.color})` }}>
                      {n.robot.codename}
                    </div>
                    <div className="truncate text-xs text-foreground/80">{n.robot.name}</div>
                    <div className="truncate font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {n.status}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, active }: { label: string; value: string; active?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-lime flicker" : "bg-muted-foreground/50"}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className={active ? "text-lime" : "text-foreground"}>{value}</span>
    </div>
  );
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function stepDelay(step: SwarmStep): number {
  switch (step.type) {
    case "spawn":
      return 450;
    case "message":
      return 280;
    case "status":
      return 180;
    case "log":
      return 220;
    case "artifact":
      return 600;
    default:
      return 200;
  }
}
