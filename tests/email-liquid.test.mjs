import { test } from "node:test";
import { equal } from "node:assert/strict";
import { resolveLiquidPreview } from "../lib/email-editor-model.ts";

const workspace = {
  catalogItems: {
    games: [
      { id: "1234", name: "Tales", fields: { title: "Tales", category: "RPG", price: 7.49 } },
      { id: "1235", name: "Teslagrad", fields: { title: "Teslagrad", category: "Puzzle", price: 9.99 } },
    ],
  },
  catalogSelections: {
    games: [
      {
        name: "by_category",
        filters: [{ field: "category", operator: "equals", value: "{{custom_attribute.${favorite_category}}}" }],
        randomSort: false,
        sortField: "price",
        sortDirection: "ascending",
        resultLimit: 3,
      },
    ],
  },
};

test("catalog_items resolves requested rows and never substitutes a missing item", () => {
  const result = resolveLiquidPreview(
    "{% catalog_items Games 1234 missing %}{{ items[0].title }}|{{ items[1].title }}",
    undefined,
    "en",
    workspace,
  );
  equal(result, "Tales|");
});

test("catalog_selection_items filters live catalog rows with preview user data", () => {
  const result = resolveLiquidPreview(
    "{% catalog_selection_items Games by_category %}{{ items[0].title }}|{{ items[1].title }}",
    { favorite_category: "Puzzle" },
    "en",
    workspace,
  );
  equal(result, "Teslagrad|");
});

test("catalog output remains empty when a selection has no matches", () => {
  const result = resolveLiquidPreview(
    "{% catalog_selection_items Games by_category %}{{ items[0].title }}",
    { favorite_category: "Strategy" },
    "en",
    workspace,
  );
  equal(result, "");
});
