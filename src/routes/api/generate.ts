import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM = `You are a swarm of elite agents (Architect, Designer, Engineer, Deployer) collectively building a single self-contained HTML document for the user's directive.

OUTPUT RULES — strictly enforced:
- Respond with ONLY raw HTML. No markdown fences, no commentary, no preamble.
- Start with <!DOCTYPE html> and end with </html>.
- Single file: inline <style> and <script>. No external assets except Google Fonts via <link> and images via https://images.unsplash.com/... or https://picsum.photos URLs.
- Use Tailwind via <script src="https://cdn.tailwindcss.com"></script> OR custom CSS — your choice.
- Make it visually stunning, modern, production-quality. Bold typography, generous spacing, real content (no lorem ipsum), polished hero, multiple sections, working nav, footer.
- Include real interactivity where it makes sense (smooth scroll, hover states, simple JS).
- Mobile responsive.
- Aim for ~400-900 lines of beautiful code.`;

export const Route = createFileRoute("/api/generate")({
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
          prompt: `User directive: ${prompt}\n\nProduce the complete HTML document now.`,
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
