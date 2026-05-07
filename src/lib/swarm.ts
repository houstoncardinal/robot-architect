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
  | { type: "build"; from: string; line: string; title: string }
  | { type: "artifact"; title: string; lines: string[] }
  | { type: "complete" };

type Kind = "homework" | "website" | "taxes" | "recipe" | "generic";
type Plan = { intent: string; kind: Kind; team: RobotRole[]; script: SwarmStep[] };

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

function classify(input: string): Kind {
  const t = input.toLowerCase();
  if (/(homework|essay|math|study|quiz|exam)/.test(t)) return "homework";
  if (/(website|landing|web ?app|portfolio|site)/.test(t)) return "website";
  if (/(tax|irs|deduct|w-?2|1099|return)/.test(t)) return "taxes";
  if (/(recipe|cook|dinner|meal|bake|food)/.test(t)) return "recipe";
  return "generic";
}

const teams: Record<Kind, RobotRole[]> = {
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

// Per-agent build lines and inter-agent chatter
const buildScripts: Record<Kind, { title: string; agentLines: string[][]; chatter: [number, number, string][]; final: string[] }> = {
  homework: {
    title: "Assignment Draft",
    agentLines: [
      ["Scanning 14 academic sources…", "Filtering peer-reviewed → 4 selected", "Citations formatted (APA)"],
      ["Parsing problem set: 12 items", "Symbolic solve → 12/12 verified", "Step-by-step traces ready"],
      ["Drafting thesis statement", "Outlining 5 body sections", "Prose pass — 1,240 words"],
      ["Cross-checking sources vs claims", "Grammar + tone sweep", "Approved ✓"],
    ],
    chatter: [
      [0, 1, "Sources locked — passing references."],
      [1, 2, "Solutions ready, weave into section 3."],
      [0, 2, "Quote suggestions appended."],
      [2, 3, "Draft ready for proof."],
      [3, 1, "Verify equation 7 once more?"],
      [1, 3, "Confirmed. Step 7 valid."],
    ],
    final: ["✓ 4 sources cited (peer-reviewed)", "✓ 12/12 problems solved", "✓ 1,240-word essay drafted", "→ Ready for your review"],
  },
  website: {
    title: "Site Build",
    agentLines: [
      ["Sitemap → 5 routes", "Component tree mapped", "Content model: 3 entities"],
      ["Palette: indigo + warm neutrals", "Typography: Fraunces / Inter", "12 components themed"],
      ["Scaffolded routes & layouts", "Wired forms + state", "Build OK — 0 errors"],
      ["Lighthouse run: 98/100/100/100", "OG tags injected", "Preview link queued"],
    ],
    chatter: [
      [0, 1, "Arch ready — design over to you."],
      [1, 2, "Tokens exported, hand off to engineering."],
      [2, 1, "Need a hover state for cards."],
      [1, 2, "Pushed: --hover-elevate token."],
      [2, 3, "Build green, ship it."],
      [3, 0, "QA passed across viewports."],
    ],
    final: ["✓ 5 pages routed", "✓ Design system compiled", "✓ Lighthouse 98 / 100 / 100 / 100", "→ Preview link queued"],
  },
  taxes: {
    title: "Return Draft",
    agentLines: [
      ["Ingested W-2 × 1, 1099 × 2", "OCR confidence: 99.4%", "Income normalized"],
      ["Bracket calc complete", "AMT check — clear", "Liability: $4,712"],
      ["Scanning deductions…", "7 qualifying items found", "Saved: $1,480"],
      ["Form 1040 populated", "Schedules attached", "Ready to e-file"],
    ],
    chatter: [
      [0, 1, "All forms parsed, totals attached."],
      [1, 2, "Liability draft — find me deductions."],
      [2, 1, "Mortgage interest qualifies. +$612."],
      [2, 3, "Final deductions locked."],
      [1, 3, "Refund estimate: $1,248."],
      [3, 0, "Need signature page."],
    ],
    final: ["✓ Income reconciled (3 forms)", "✓ 7 deductions identified", "✓ Estimated refund: $1,248", "→ Awaiting your signature"],
  },
  recipe: {
    title: "Tonight's Menu",
    agentLines: [
      ["Pantry scan: 37 items", "Fresh: salmon, miso, scallion", "Staples confirmed"],
      ["Matched 6 recipes → ranked", "Selected: miso glazed salmon", "Mise en place plotted"],
      ["Macros: 42P / 38C / 20F", "Calories: 580/serving", "Allergen check: clear"],
      ["Plating concept: charred greens", "Garnish: sesame + lime zest", "Photo brief ready"],
    ],
    chatter: [
      [0, 1, "Inventory in. What's the play?"],
      [1, 2, "Miso salmon — check macros?"],
      [2, 1, "Within target. Approved."],
      [1, 3, "Plating notes please."],
      [3, 0, "Need 2 limes — on list?"],
      [0, 3, "Affirmative. Limes confirmed."],
    ],
    final: ["✓ Pantry scan complete (37)", "✓ Selected: Miso glazed salmon", "✓ Macros 42P / 38C / 20F", "→ Prep time: 25 min"],
  },
  generic: {
    title: "Task Result",
    agentLines: [
      ["Decomposed → 3 phases", "Dependencies mapped", "Plan locked"],
      ["Executing core action…", "Sub-tasks 4/4 complete", "Output staged"],
      ["Validation pass", "All checks green", "Sealed"],
    ],
    chatter: [
      [0, 1, "Plan handed over."],
      [1, 2, "Output ready, review please."],
      [2, 0, "Approved. Closing loop."],
    ],
    final: ["✓ Task decomposed into 3 phases", "✓ All sub-tasks executed", "✓ Output validated", "→ Delivered"],
  },
};

// Interleave arrays round-robin
function interleave<T>(arrs: T[][]): T[] {
  const out: T[] = [];
  const max = Math.max(...arrs.map((a) => a.length));
  for (let i = 0; i < max; i++) for (const a of arrs) if (i < a.length) out.push(a[i]);
  return out;
}

export function buildPlan(input: string): Plan {
  const kind = classify(input);
  const team = teams[kind];
  const intent = input.trim() || "Awaiting directive…";
  const cfg = buildScripts[kind];
  const script: SwarmStep[] = [
    { type: "log", from: "PRIME", text: `Directive received: "${intent}"`, tone: "info" },
    { type: "log", from: "PRIME", text: `Intent classified → ${kind.toUpperCase()}`, tone: "info" },
    { type: "log", from: "PRIME", text: `Assembling specialist swarm of ${team.length}…` },
  ];

  // Spawn all agents quickly with brief PRIME briefing
  team.forEach((r) => {
    script.push({ type: "spawn", robot: r });
    script.push({ type: "message", from: "PRIME", to: r.id, text: `Online. Owning: ${r.skill}.` });
  });

  script.push({ type: "log", from: "PRIME", text: "Team assembled. Beginning collaborative work…", tone: "ok" });

  // Set everyone to thinking
  team.forEach((r) => script.push({ type: "status", id: r.id, status: "thinking" }));

  // Real-time interleaved work: each agent emits build lines round-robin,
  // with peer-to-peer chatter mixed in.
  const buildSteps: SwarmStep[][] = team.map((r, idx) => {
    const lines = cfg.agentLines[idx] ?? [];
    const steps: SwarmStep[] = [{ type: "status", id: r.id, status: "working" }];
    lines.forEach((line) => {
      steps.push({ type: "log", from: r.codename, text: line });
      steps.push({ type: "build", from: r.codename, line: `[${r.codename}] ${line}`, title: cfg.title });
    });
    steps.push({ type: "status", id: r.id, status: "done" });
    steps.push({ type: "message", from: r.id, to: "PRIME", text: `Phase complete.` });
    return steps;
  });

  const interleaved = interleave(buildSteps);

  // Splice peer-to-peer chatter in at intervals
  const chatter: SwarmStep[] = cfg.chatter.map(([fromIdx, toIdx, text]) => ({
    type: "message" as const,
    from: team[fromIdx].id,
    to: team[toIdx].id,
    text,
  }));

  const merged: SwarmStep[] = [];
  let chatIdx = 0;
  interleaved.forEach((s, i) => {
    merged.push(s);
    if (i > 0 && i % 3 === 0 && chatIdx < chatter.length) {
      merged.push(chatter[chatIdx++]);
    }
  });
  while (chatIdx < chatter.length) merged.push(chatter[chatIdx++]);

  script.push(...merged);

  script.push({ type: "log", from: "PRIME", text: "Synthesizing outputs…", tone: "info" });
  script.push({ type: "artifact", title: cfg.title + " v1", lines: cfg.final });
  script.push({ type: "log", from: "PRIME", text: "Mission complete.", tone: "ok" });
  script.push({ type: "complete" });
  return { intent, kind, team, script };
}
