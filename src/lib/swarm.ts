export type RobotRole = {
  id: string;
  name: string;
  codename: string;
  emoji: string;
  color: "cyan" | "magenta" | "amber" | "lime";
  skill: string;
};

export type SwarmStep =
  | { type: "log"; from: string; text: string; tone?: "info" | "ok" | "warn" }
  | { type: "spawn"; robot: RobotRole }
  | { type: "message"; from: string; to: string; text: string }
  | { type: "status"; id: string; status: "thinking" | "working" | "done" }
  | { type: "artifact"; title: string; lines: string[] }
  | { type: "complete" };

type Plan = { intent: string; team: RobotRole[]; script: SwarmStep[] };

const palette: RobotRole["color"][] = ["cyan", "magenta", "amber", "lime"];

function role(
  i: number,
  name: string,
  codename: string,
  emoji: string,
  skill: string,
): RobotRole {
  return {
    id: `r-${codename.toLowerCase()}`,
    name,
    codename,
    emoji,
    skill,
    color: palette[i % palette.length],
  };
}

function classify(input: string): "homework" | "website" | "taxes" | "recipe" | "generic" {
  const t = input.toLowerCase();
  if (/(homework|essay|math|study|quiz|exam)/.test(t)) return "homework";
  if (/(website|landing|web ?app|portfolio|site)/.test(t)) return "website";
  if (/(tax|irs|deduct|w-?2|1099|return)/.test(t)) return "taxes";
  if (/(recipe|cook|dinner|meal|bake|food)/.test(t)) return "recipe";
  return "generic";
}

const teams: Record<ReturnType<typeof classify>, RobotRole[]> = {
  homework: [
    role(0, "Researcher", "SCRIBE-07", "📚", "Source gathering"),
    role(1, "Solver", "AXIOM-12", "🧮", "Logic & math"),
    role(2, "Writer", "QUILL-03", "✍️", "Composition"),
    role(3, "Proofer", "LENS-09", "🔍", "Fact-check"),
  ],
  website: [
    role(0, "Architect", "BLUEPRINT-01", "📐", "Information arch"),
    role(1, "Designer", "PRISM-04", "🎨", "Visual system"),
    role(2, "Engineer", "FORGE-22", "⚙️", "Implementation"),
    role(3, "Deployer", "ORBIT-08", "🚀", "Ship & QA"),
  ],
  taxes: [
    role(0, "Collector", "LEDGER-02", "📥", "Document intake"),
    role(1, "Auditor", "ABACUS-15", "🧾", "Calculation"),
    role(2, "Strategist", "VAULT-11", "💼", "Deductions"),
    role(3, "Filer", "STAMP-06", "📤", "Submission prep"),
  ],
  recipe: [
    role(0, "Pantry", "ROOT-05", "🥬", "Inventory"),
    role(1, "Chef", "EMBER-14", "🔥", "Recipe craft"),
    role(2, "Nutritionist", "BLOOM-19", "🥗", "Macro balance"),
    role(3, "Plater", "GLAZE-03", "🍽️", "Presentation"),
  ],
  generic: [
    role(0, "Analyst", "PARSE-01", "🧠", "Decompose task"),
    role(1, "Specialist", "CRAFT-09", "🛠️", "Core execution"),
    role(2, "Reviewer", "MIRROR-04", "🔍", "Quality pass"),
  ],
};

const artifacts: Record<ReturnType<typeof classify>, { title: string; lines: string[] }> = {
  homework: {
    title: "Assignment Draft v1",
    lines: [
      "✓ 4 sources cited (peer-reviewed)",
      "✓ Thesis: clear, defensible",
      "✓ Solutions verified — 12/12 steps",
      "→ Ready for your review",
    ],
  },
  website: {
    title: "Site Build Manifest",
    lines: [
      "✓ 5 pages routed",
      "✓ Design tokens compiled",
      "✓ Lighthouse: 98 / 100 / 100 / 100",
      "→ Preview link queued",
    ],
  },
  taxes: {
    title: "Return Summary (Draft)",
    lines: [
      "✓ Income reconciled across 3 forms",
      "✓ 7 deductions identified",
      "✓ Estimated refund: $1,248",
      "→ Awaiting your signature",
    ],
  },
  recipe: {
    title: "Tonight's Menu",
    lines: [
      "✓ Pantry scan complete (37 items)",
      "✓ Selected: Miso glazed salmon",
      "✓ Macro balance — 42P / 38C / 20F",
      "→ Prep time: 25 min",
    ],
  },
  generic: {
    title: "Task Result",
    lines: [
      "✓ Task decomposed into 3 phases",
      "✓ All sub-tasks executed",
      "✓ Output validated",
      "→ Delivered",
    ],
  },
};

export function buildPlan(input: string): Plan {
  const kind = classify(input);
  const team = teams[kind];
  const intent = input.trim() || "Awaiting directive…";
  const script: SwarmStep[] = [
    { type: "log", from: "PRIME", text: `Directive received: "${intent}"`, tone: "info" },
    { type: "log", from: "PRIME", text: `Intent classified → ${kind.toUpperCase()}`, tone: "info" },
    { type: "log", from: "PRIME", text: `Assembling specialist swarm of ${team.length}…` },
  ];
  team.forEach((r) => {
    script.push({ type: "spawn", robot: r });
    script.push({ type: "message", from: "PRIME", to: r.id, text: `Initialize. Role: ${r.skill}.` });
  });
  team.forEach((r, i) => {
    script.push({ type: "status", id: r.id, status: "thinking" });
    script.push({ type: "log", from: r.codename, text: `${r.skill} — analyzing scope…` });
    if (i > 0) {
      const prev = team[i - 1];
      script.push({ type: "message", from: prev.id, to: r.id, text: `Handoff: phase ${i} payload ready.` });
    }
    script.push({ type: "status", id: r.id, status: "working" });
    script.push({ type: "log", from: r.codename, text: `Executing…`, tone: "ok" });
    script.push({ type: "status", id: r.id, status: "done" });
    script.push({ type: "message", from: r.id, to: "PRIME", text: `Phase ${i + 1} complete.` });
  });
  script.push({ type: "log", from: "PRIME", text: "Synthesizing outputs…", tone: "info" });
  script.push({ type: "artifact", ...artifacts[kind] });
  script.push({ type: "log", from: "PRIME", text: "Mission complete.", tone: "ok" });
  script.push({ type: "complete" });
  return { intent, team, script };
}
