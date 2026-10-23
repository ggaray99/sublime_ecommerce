import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hasDatabase } from "../src/server/db/client.ts";

const url = "postgres://placeholder";

describe("hasDatabase (environment guard)", () => {
  it("is off without DATABASE_URL", () => {
    assert.equal(hasDatabase({}), false);
  });

  it("is on in preview and local development when DATABASE_URL exists", () => {
    assert.equal(hasDatabase({ DATABASE_URL: url, VERCEL_ENV: "preview" }), true);
    assert.equal(hasDatabase({ DATABASE_URL: url }), true);
  });

  it("stays off in production unless explicitly enabled", () => {
    assert.equal(hasDatabase({ DATABASE_URL: url, VERCEL_ENV: "production" }), false);
    assert.equal(hasDatabase({ DATABASE_URL: url, VERCEL_ENV: "production", SUBLIME_DB_IN_PRODUCTION: "yes" }), false);
    assert.equal(hasDatabase({ DATABASE_URL: url, VERCEL_ENV: "production", SUBLIME_DB_IN_PRODUCTION: "enabled" }), true);
  });
});
