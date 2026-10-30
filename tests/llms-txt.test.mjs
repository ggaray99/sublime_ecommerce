import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { llmsTxt } from "../src/lib/llms-txt.ts";

const site = { name: "Sublime", url: "https://example.com.ar", description: "Calcos y stickers." };

describe("llms.txt", () => {
  const text = llmsTxt({
    site,
    categories: [{ id: "stickers", label: "Calcos y stickers", tagline: "", description: "Stickers troquelados.", image: "" }],
    infoPages: [{ slug: "envios", title: "Envíos", description: "Cómo enviamos.", intro: "", sections: [] }],
  });

  it("starts with the store name and summary", () => {
    assert.ok(text.startsWith("# Sublime\n\n> Calcos y stickers.\n"));
  });

  it("links categories and info pages with absolute URLs", () => {
    assert.match(text, /- \[Calcos y stickers\]\(https:\/\/example\.com\.ar\/categorias\/stickers\): Stickers troquelados\./);
    assert.match(text, /- \[Envíos\]\(https:\/\/example\.com\.ar\/envios\): Cómo enviamos\./);
    assert.match(text, /\(https:\/\/example\.com\.ar\/encargos\)/);
  });
});
