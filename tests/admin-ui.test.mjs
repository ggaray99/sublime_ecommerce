// Sublime Admin design system: the pure helpers behind the UI primitives
// (class names, token contrast, pagination links, toast queue). React
// rendering has no harness here; the showcase page covers it visually.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { cx } from "../src/components/admin/ui/class-names.ts";
import { contrastRatio, parseCustomProperties, relativeLuminance } from "../src/components/admin/ui/contrast.ts";
import { pageHref, paginationState } from "../src/components/admin/ui/pagination-links.ts";
import { MAX_TOASTS, toastDuration, toastReducer } from "../src/components/admin/ui/toast-queue.ts";

describe("cx", () => {
  it("joins truthy class names and skips empty values", () => {
    assert.equal(cx("a", false, null, undefined, "", "b"), "a b");
    assert.equal(cx(), "");
  });
});

describe("contrast", () => {
  it("computes WCAG luminance and ratios", () => {
    assert.equal(relativeLuminance("#000000"), 0);
    assert.equal(relativeLuminance("#ffffff"), 1);
    assert.equal(Math.round(contrastRatio("#000", "#fff") * 100) / 100, 21);
    assert.equal(contrastRatio("#777777", "#777777"), 1);
    // Order does not matter.
    assert.equal(contrastRatio("#35bdf2", "#18181b"), contrastRatio("#18181b", "#35bdf2"));
  });

  it("rejects values that are not hex colors", () => {
    assert.throws(() => relativeLuminance("red"), /hex/);
  });

  it("reads the --sa- custom properties of a stylesheet", () => {
    const tokens = parseCustomProperties(".theme {\n  --sa-color-text: #18181b;\n  --sa-space-2: 8px;\n  --other: 1px;\n}");
    assert.deepEqual(tokens, { "--sa-color-text": "#18181b", "--sa-space-2": "8px" });
  });

  // Every text/background pair the components use must reach WCAG AA (4.5:1),
  // and non-text UI (focus ring, field borders) 3:1 against its surface.
  const tokens = parseCustomProperties(readFileSync(new URL("../src/components/admin/ui/tokens.module.css", import.meta.url), "utf8"));
  const color = (name) => {
    const value = tokens[`--sa-color-${name}`];
    assert.ok(value, `missing token --sa-color-${name}`);
    return value;
  };
  const TEXT_PAIRS = [
    ["text", "surface"],
    ["text", "canvas"],
    ["text", "surface-subdued"],
    ["text-subdued", "surface"],
    ["text-subdued", "canvas"],
    ["text-subdued", "surface-subdued"],
    ["text-on-primary", "primary"],
    ["text-on-primary", "primary-hover"],
    ["text-on-accent", "accent"],
    ["text-on-critical", "critical-strong"],
    ["text-link", "surface"],
    ["success-text", "success-bg"],
    ["warning-text", "warning-bg"],
    ["critical-text", "critical-bg"],
    ["critical-text", "surface"],
    ["info-text", "info-bg"],
    ["attention-text", "attention-bg"],
    ["neutral-text", "neutral-bg"],
    ["inverse-text", "inverse-surface"],
    ["inverse-text", "inverse-surface-hover"],
  ];
  for (const [text, bg] of TEXT_PAIRS) {
    it(`${text} on ${bg} reaches 4.5:1`, () => {
      const ratio = contrastRatio(color(text), color(bg));
      assert.ok(ratio >= 4.5, `${text} on ${bg} is ${ratio.toFixed(2)}:1`);
    });
  }
  const UI_PAIRS = [
    ["focus", "surface"],
    ["focus", "canvas"],
    ["border-input", "surface"],
    ["inverse-focus", "inverse-surface"],
    ["inverse-info-icon", "inverse-surface"],
    ["inverse-success-icon", "inverse-surface"],
    ["inverse-warning-icon", "inverse-surface"],
    ["inverse-critical-icon", "inverse-surface"],
    ["success-icon", "surface"],
    ["warning-icon", "surface"],
    ["critical-icon", "surface"],
    ["info-icon", "surface"],
  ];
  for (const [ui, bg] of UI_PAIRS) {
    it(`${ui} on ${bg} reaches 3:1`, () => {
      const ratio = contrastRatio(color(ui), color(bg));
      assert.ok(ratio >= 3, `${ui} on ${bg} is ${ratio.toFixed(2)}:1`);
    });
  }
});

describe("pageHref", () => {
  it("sets the page parameter and keeps the other filters", () => {
    assert.equal(pageHref("/admin", { q: "taza", estado: "active" }, 3), "/admin?q=taza&estado=active&pagina=3");
  });

  it("drops the parameter on page 1 and replaces an existing one", () => {
    assert.equal(pageHref("/admin", { q: "taza", pagina: "4" }, 1), "/admin?q=taza");
    assert.equal(pageHref("/admin", { pagina: "4" }, 1), "/admin");
    assert.equal(pageHref("/admin", { pagina: "4" }, 5), "/admin?pagina=5");
  });

  it("supports repeated values, a custom parameter and skips empty values", () => {
    assert.equal(pageHref("/admin/pedidos", { tag: ["a", "b"], vacio: "", nada: undefined }, 2, "p"), "/admin/pedidos?tag=a&tag=b&p=2");
  });
});

describe("paginationState", () => {
  it("knows prev/next and the range shown from a total", () => {
    assert.deepEqual(paginationState({ page: 2, pageSize: 50, total: 120 }), {
      page: 2,
      pageCount: 3,
      hasPrevious: true,
      hasNext: true,
      from: 51,
      to: 100,
      total: 120,
    });
    assert.deepEqual(paginationState({ page: 3, pageSize: 50, total: 120 }).hasNext, false);
  });

  it("works without a total when the caller knows if there is a next page", () => {
    const state = paginationState({ page: 1, pageSize: 50, hasNext: true });
    assert.equal(state.hasPrevious, false);
    assert.equal(state.hasNext, true);
    assert.equal(state.pageCount, undefined);
    assert.equal(state.from, 1);
    assert.equal(state.to, undefined);
  });

  it("clamps an out-of-range or invalid page", () => {
    assert.equal(paginationState({ page: 9, pageSize: 50, total: 120 }).page, 3);
    assert.equal(paginationState({ page: 0, pageSize: 50, total: 120 }).page, 1);
    assert.equal(paginationState({ page: Number.NaN, pageSize: 50, total: 0 }).page, 1);
    const empty = paginationState({ page: 1, pageSize: 50, total: 0 });
    assert.equal(empty.pageCount, 1);
    assert.equal(empty.from, 0);
    assert.equal(empty.to, 0);
  });
});

describe("toast queue", () => {
  const toast = (id, tone = "info") => ({ id, tone, message: `Mensaje ${id}` });

  it("adds toasts in order and ignores a repeated id", () => {
    let state = toastReducer([], { type: "add", toast: toast("a") });
    state = toastReducer(state, { type: "add", toast: toast("b") });
    state = toastReducer(state, { type: "add", toast: toast("a") });
    assert.deepEqual(state.map((t) => t.id), ["a", "b"]);
  });

  it(`keeps at most ${3} toasts, dropping the oldest`, () => {
    assert.equal(MAX_TOASTS, 3);
    let state = [];
    for (const id of ["a", "b", "c", "d"]) state = toastReducer(state, { type: "add", toast: toast(id) });
    assert.deepEqual(state.map((t) => t.id), ["b", "c", "d"]);
  });

  it("dismisses one toast or clears all", () => {
    const state = [toast("a"), toast("b")];
    assert.deepEqual(toastReducer(state, { type: "dismiss", id: "a" }).map((t) => t.id), ["b"]);
    assert.equal(toastReducer(state, { type: "dismiss", id: "zz" }), state);
    assert.deepEqual(toastReducer(state, { type: "clear" }), []);
  });

  it("auto-dismisses after 5 s except critical toasts, which stay until closed", () => {
    assert.equal(toastDuration("info"), 5000);
    assert.equal(toastDuration("success"), 5000);
    assert.equal(toastDuration("warning"), 5000);
    assert.equal(toastDuration("critical"), null);
    assert.equal(toastDuration("info", 8000), 8000);
    assert.equal(toastDuration("critical", 8000), 8000);
  });
});
