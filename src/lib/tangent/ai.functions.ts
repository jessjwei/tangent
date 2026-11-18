import { createServerFn } from "@tanstack/react-start";

type DescribeInput = { slides: { index: number; imageDataUrl: string }[] };
type MatchInput = {
  current: number;
  recent: string;
  slides: { index: number; text: string }[];
};

export type AiResult<T> = { ok: true; data: T } | { ok: false; error: string };

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function validateDescribe(input: unknown): DescribeInput {
  const record = asRecord(input);
  const slides = record?.["slides"];
  if (!Array.isArray(slides) || slides.length < 1 || slides.length > 4) {
    throw new Error("Send 1 to 4 slides");
  }
  return {
    slides: slides.map((slide) => {
      const item = asRecord(slide);
      const index = item?.["index"];
      const imageDataUrl = item?.["imageDataUrl"];
      if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
        throw new Error("Bad slide index");
      }
      if (typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
        throw new Error("Expected a slide image");
      }
      if (imageDataUrl.length > 700_000) throw new Error("Slide image is too large");
      return { index, imageDataUrl };
    }),
  };
}

function validateMatch(input: unknown): MatchInput {
  const record = asRecord(input);
  const current = record?.["current"];
  const recent = record?.["recent"];
  const slides = record?.["slides"];
  if (typeof current !== "number" || typeof recent !== "string" || !Array.isArray(slides)) {
    throw new Error("Bad match request");
  }
  if (slides.length < 1 || slides.length > 12) throw new Error("Send the nearby slides only");
  if (recent.length > 1600) throw new Error("Speech snippet is too long");
  return {
    current,
    recent,
    slides: slides.map((slide) => {
      const item = asRecord(slide);
      const index = item?.["index"];
      const text = item?.["text"];
      if (typeof index !== "number" || typeof text !== "string") throw new Error("Bad slide");
      return { index, text: text.slice(0, 700) };
    }),
  };
}

async function grok(messages: unknown, maxTokens: number): Promise<AiResult<string>> {
  const apiKey = process.env["XAI_API_KEY"];
  if (!apiKey) return { ok: false, error: "AI is not available in this environment" };
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "grok-4.5",
      temperature: 0.1,
      max_tokens: maxTokens,
      messages,
    }),
  });
  if (!response.ok) return { ok: false, error: `Grok could not answer (${response.status})` };
  const body = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = body.choices?.[0]?.message?.content ?? "";
  if (!text) return { ok: false, error: "Grok returned an empty answer" };
  return { ok: true, data: text };
}

function readJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("No JSON");
  return JSON.parse(text.slice(start, end + 1)) as unknown;
}

export const describeSlides = createServerFn({ method: "POST" })
  .validator(validateDescribe)
  .handler(async ({ data }): Promise<AiResult<{ index: number; summary: string }[]>> => {
    const content: unknown[] = [
      {
        type: "text",
        text: "Describe each lecture slide for a student note-taking app. One sentence per slide, naming the distinctive terms a professor would say aloud. Reply with JSON only: {\"slides\":[{\"index\":0,\"summary\":\"...\"}]}",
      },
    ];
    for (const slide of data.slides) {
      content.push({ type: "text", text: `Slide index ${slide.index}` });
      content.push({ type: "image_url", image_url: { url: slide.imageDataUrl } });
    }
    const result = await grok([{ role: "user", content }], 500);
    if (!result.ok) return result;
    try {
      const parsed = asRecord(readJson(result.data));
      const slides = parsed?.["slides"];
      if (!Array.isArray(slides)) return { ok: false, error: "Could not read slide descriptions" };
      const descriptions = slides.flatMap((slide) => {
        const item = asRecord(slide);
        const index = item?.["index"];
        const summary = item?.["summary"];
        if (typeof index !== "number" || typeof summary !== "string" || !summary.trim()) return [];
        return [{ index, summary: summary.trim().slice(0, 400) }];
      });
      if (descriptions.length === 0) return { ok: false, error: "Could not read slide descriptions" };
      return { ok: true, data: descriptions };
    } catch {
      return { ok: false, error: "Could not read slide descriptions" };
    }
  });

export const matchTranscript = createServerFn({ method: "POST" })
  .validator(validateMatch)
  .handler(async ({ data }): Promise<AiResult<{ slide: number; confidence: number; reason: string }>> => {
    const catalog = data.slides
      .map((slide) => `${slide.index}: ${slide.text || "(no words on this slide)"}`)
      .join("\n");
    const result = await grok(
      [
        {
          role: "user",
          content: `You track which lecture slide a professor is speaking about. Slides use zero-based indexes. Current slide: ${data.current}. Prefer staying unless the speech clearly moved, and prefer a forward move over a jump backward.\nRecent speech:\n${data.recent}\nSlides:\n${catalog}\nReply JSON only: {"slide":0,"confidence":0.0,"reason":"short"}`,
        },
      ],
      180,
    );
    if (!result.ok) return result;
    try {
      const parsed = asRecord(readJson(result.data));
      const slide = parsed?.["slide"];
      const confidence = parsed?.["confidence"];
      const reason = parsed?.["reason"];
      if (typeof slide !== "number" || typeof confidence !== "number") {
        return { ok: false, error: "Could not read the match" };
      }
      const allowed = data.slides.some((item) => item.index === slide);
      if (!allowed) return { ok: false, error: "Match pointed at an unknown slide" };
      return {
        ok: true,
        data: {
          slide,
          confidence: Math.max(0, Math.min(1, confidence)),
          reason: typeof reason === "string" ? reason.slice(0, 180) : "Grok match",
        },
      };
    } catch {
      return { ok: false, error: "Could not read the match" };
    }
  });
