import { test } from "node:test";
import { equal, throws } from "node:assert/strict";
import { selectionMatches, validateCatalogItem, validateSelection } from "../lib/catalog-model.ts";

const fields = [
  { name: "price", type: "number" },
  { name: "tags", type: "array" },
  { name: "store", type: "geo" },
];

test("selection accepts no filters and enforces the results limit", () => {
  validateSelection({ name: "everything", filters: [], randomSort: true, resultLimit: 50 }, fields, 0);
  throws(() => validateSelection({ name: "too_many", filters: [], randomSort: true, resultLimit: 51 }, fields, 0), /Results limit/);
});

test("selection operators are constrained by the field type", () => {
  throws(() => validateSelection({ name: "bad", filters: [{ field: "price", operator: "includes_value", value: "7" }], randomSort: true, resultLimit: 3 }, fields, 0), /Invalid filter/);
  validateSelection({ name: "valid", filters: [{ field: "price", operator: "greater_than", value: "7" }], randomSort: true, resultLimit: 3 }, fields, 0);
});

test("catalog values and geo filters are evaluated with their native types", () => {
  validateCatalogItem({ id: "shop_1", fields: { price: 8, tags: ["sale"], store: [-73.99, 40.78] } }, fields);
  equal(selectionMatches({ id: "shop_1", fields: { price: 8, tags: ["sale"], store: [-73.99, 40.78] } }, [{ field: "store", operator: "geo_within", value: '{"center":[-73.99,40.78],"radiusKm":1}' }]), true);
});

test("selection Liquid resolves standard and custom user attributes", () => {
  equal(selectionMatches({ id: "item_1", fields: { audience: "Customer 1" } }, [{ field: "audience", operator: "equals", value: "{{${first_name}}}" }], { first_name: "Customer 1" }), true);
  equal(selectionMatches({ id: "item_1", fields: { audience: "gold" } }, [{ field: "audience", operator: "equals", value: "{{custom_attribute.${loyalty 等级}}}" }], { "loyalty 等级": "gold" }), true);
});
