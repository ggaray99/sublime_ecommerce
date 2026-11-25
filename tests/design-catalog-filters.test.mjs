import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultDesignFilters,
  designFilterOptions,
  designFiltersToSearch,
  filterDesignCards,
  matchingBase,
  parseDesignFilters,
} from "../src/lib/designs/catalog-filters.ts";

const black = { key: "negro", label: "Negro" };
const white = { key: "blanco", label: "Blanco" };
const cream = { key: "crema", label: "Crema" };

const cards = [
  {
    id: "a",
    bases: [
      { kind: "tshirt", colors: [white, black] },
      { kind: "mug", colors: [] },
    ],
    themes: [{ slug: "futbol", label: "Fútbol" }],
  },
  { id: "b", bases: [{ kind: "oversize", colors: [cream] }], themes: [{ slug: "anime", label: "Anime" }] },
  { id: "c", bases: [{ kind: "sticker", colors: [] }], themes: [] },
];

const options = designFilterOptions(cards);
const params = (search) => new URLSearchParams(search);
const ids = (filters) => filterDesignCards(cards, filters).map((card) => card.id);

describe("design catalog filter options", () => {
  it("lists only the products, colors and themes the published designs have", () => {
    assert.deepEqual(
      options.kinds.map((kind) => kind.value),
      ["tshirt", "oversize", "mug", "sticker"],
    );
    assert.deepEqual(options.kinds[0], { value: "tshirt", label: "Remera clásica" });
    assert.deepEqual(options.colors, [white, black, cream]);
    assert.deepEqual(options.themes, [
      { slug: "anime", label: "Anime" },
      { slug: "futbol", label: "Fútbol" },
    ]);
  });
});

describe("design catalog filters", () => {
  it("shows every design without filters", () => {
    assert.deepEqual(ids(defaultDesignFilters), ["a", "b", "c"]);
  });

  it("filters by product", () => {
    assert.deepEqual(ids({ ...defaultDesignFilters, kind: "mug" }), ["a"]);
    assert.deepEqual(ids({ ...defaultDesignFilters, kind: "oversize" }), ["b"]);
  });

  it("filters by garment color", () => {
    assert.deepEqual(ids({ ...defaultDesignFilters, color: "negro" }), ["a"]);
    assert.deepEqual(ids({ ...defaultDesignFilters, color: "crema" }), ["b"]);
  });

  it("combines product and color on the same base product", () => {
    // Design a is black only on the classic T-shirt, not on the mug.
    assert.deepEqual(ids({ ...defaultDesignFilters, kind: "tshirt", color: "negro" }), ["a"]);
    assert.deepEqual(ids({ ...defaultDesignFilters, kind: "mug", color: "negro" }), []);
  });

  it("filters by theme", () => {
    assert.deepEqual(ids({ ...defaultDesignFilters, theme: "futbol" }), ["a"]);
    assert.deepEqual(ids({ ...defaultDesignFilters, theme: "futbol", kind: "oversize" }), []);
  });

  it("previews the base product and color that match the filters", () => {
    assert.deepEqual(matchingBase(cards[0], { ...defaultDesignFilters, kind: "mug" }), { kind: "mug", colors: [] });
    assert.deepEqual(matchingBase(cards[0], { ...defaultDesignFilters, color: "negro" }), cards[0].bases[0]);
    assert.equal(matchingBase(cards[2], { ...defaultDesignFilters, color: "negro" }), null);
  });
});

describe("design catalog filters in the URL", () => {
  it("reads known values and ignores unknown ones", () => {
    assert.deepEqual(parseDesignFilters(params("producto=tshirt&color=negro&tematica=futbol"), options), {
      kind: "tshirt",
      color: "negro",
      theme: "futbol",
    });
    assert.deepEqual(parseDesignFilters(params("producto=gorra&color=violeta&tematica=nada"), options), defaultDesignFilters);
    assert.deepEqual(parseDesignFilters(params(""), options), defaultDesignFilters);
  });

  it("writes only the filters in use", () => {
    assert.equal(designFiltersToSearch(defaultDesignFilters), "");
    assert.equal(designFiltersToSearch({ ...defaultDesignFilters, kind: "oversize", theme: "anime" }), "?producto=oversize&tematica=anime");
    assert.equal(designFiltersToSearch({ kind: "tshirt", color: "negro", theme: "todas" }), "?producto=tshirt&color=negro");
  });

  it("round-trips through the URL", () => {
    const filters = { kind: "tshirt", color: "negro", theme: "futbol" };
    assert.deepEqual(parseDesignFilters(params(designFiltersToSearch(filters).slice(1)), options), filters);
  });
});
