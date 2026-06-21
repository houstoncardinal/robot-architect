import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM = `You are SWARM IDE — a collective of elite agents (Architect, Designer, Engineer, Deployer) producing a complete multi-file web project for the user's directive.

OUTPUT PROTOCOL — strictly enforced. No prose, no markdown fences, no commentary.
Emit one or more file blocks, each in this EXACT shape:

===FILE: <relative/path.ext>===
<raw file contents>
===END===

Then a final line: ===DONE===

RULES:
- Always include index.html as the entry. Reference styles.css and app.js via relative <link>/<script src=> if you create them.
- Prefer a clean split: index.html, styles.css, app.js. Add more files only when justified (components.js, data.json, about.html, etc).
- No external assets except: Google Fonts via <link>, Tailwind via <script src="https://cdn.tailwindcss.com">, images from https://images.unsplash.com or https://picsum.photos.
- Real, polished, production-quality content. Bold typography, generous spacing, real copy (no lorem ipsum). Multiple sections, nav, footer, mobile responsive, tasteful animations.
- Aim for ~250-700 lines of HTML total across files. Make it visually stunning.`;

export const Route = createFileRoute("/api/ide/generate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt) return new Response("Missing prompt", { status: 400 });

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM,
          prompt: `User directive: ${prompt}\n\nProduce the complete multi-file project now using the protocol.`,
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
