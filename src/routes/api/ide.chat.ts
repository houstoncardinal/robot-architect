import { createFileRoute } from "@tanstack/react-router";
import { streamText } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

const SYSTEM = `You are SWARM IDE — applying a precise refinement to an existing multi-file web project.

OUTPUT PROTOCOL — strict, no prose, no markdown fences:
For every file you ADD or MODIFY, emit:

===FILE: <relative/path.ext>===
<entire new file contents — full file, not a diff>
===END===

Then: ===DONE===

RULES:
- Only emit files you change or add. Untouched files: do NOT emit.
- To delete a file, emit: ===DELETE: <path>===
- Preserve overall design language and the rest of the project. Make the requested change cleanly and completely.
- Keep external-asset constraints: Google Fonts, Tailwind CDN, Unsplash/Picsum images only.`;

export const Route = createFileRoute("/api/ide/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        const { message, files } = (await request.json()) as {
          message?: string;
          files?: Record<string, string>;
        };
        if (!message || !files) return new Response("Missing message or files", { status: 400 });

        const filesDump = Object.entries(files)
          .map(([path, content]) => `===FILE: ${path}===\n${content}\n===END===`)
          .join("\n\n");

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: SYSTEM,
          prompt: `CURRENT PROJECT FILES:\n\n${filesDump}\n\n---\n\nUSER REQUEST: ${message}\n\nApply the refinement now. Emit only changed/new files.`,
        });
        return result.toTextStreamResponse();
      },
    },
  },
});
