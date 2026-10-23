import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { isAuthEnabled } from "../src/server/auth/config.ts";
import { authErrorMessage } from "../src/server/auth/errors.ts";
import { createCustomerRepository, CustomerDataError } from "../src/server/customers/repository.ts";
import {
  MAX_ADDRESSES,
  parseAddress,
  parseProfile,
  parseSignIn,
  parseSignUp,
} from "../src/server/customers/validation.ts";

const form = (values) => new Map(Object.entries(values));
const migration = (name) => readFileSync(join(import.meta.dirname, "..", "db", "migrations", name), "utf8");

const validAddress = {
  label: "Casa",
  recipient: "Ana Pérez",
  street: "San Martín",
  streetNumber: "1234",
  apartment: "2B",
  city: "Mendoza",
  province: "Mendoza",
  postalCode: "m5500 abc",
  notes: "",
};

describe("isAuthEnabled (environment guard)", () => {
  const base = { NEON_AUTH_BASE_URL: "https://auth.example", NEON_AUTH_COOKIE_SECRET: "x".repeat(32) };

  it("needs the auth URL and a cookie secret of at least 32 characters", () => {
    assert.equal(isAuthEnabled({}), false);
    assert.equal(isAuthEnabled({ ...base, NEON_AUTH_COOKIE_SECRET: "short" }), false);
    assert.equal(isAuthEnabled(base), true);
  });

  it("stays off in production unless explicitly enabled", () => {
    assert.equal(isAuthEnabled({ ...base, VERCEL_ENV: "production" }), false);
    assert.equal(isAuthEnabled({ ...base, VERCEL_ENV: "production", SUBLIME_AUTH_IN_PRODUCTION: "enabled" }), true);
    assert.equal(isAuthEnabled({ ...base, VERCEL_ENV: "preview" }), true);
  });
});

describe("authErrorMessage", () => {
  it("maps Better Auth, normalized and HTTP-only errors to Spanish", () => {
    assert.equal(authErrorMessage({ code: "INVALID_EMAIL_OR_PASSWORD" }), "Email o contraseña incorrectos.");
    assert.equal(authErrorMessage({ code: "invalid_credentials" }), "Email o contraseña incorrectos.");
    assert.equal(authErrorMessage({ status: 401 }), "Email o contraseña incorrectos.");
    assert.match(authErrorMessage({ code: "user_already_exists" }), /Ya existe una cuenta/);
    assert.match(authErrorMessage({ status: 429 }), /demasiados intentos/);
  });

  it("explains a rejected sign-up (Neon reports existing emails as validation_failed/422)", () => {
    const duplicate = { code: "validation_failed", status: 422 };
    assert.match(authErrorMessage(duplicate, "sign-up"), /Si ya tenés cuenta, probá ingresar/);
    assert.match(authErrorMessage(duplicate, "sign-in"), /No pudimos completar/);
  });

  it("explains untrusted domains (Neon Auth answers 403)", () => {
    assert.match(authErrorMessage({ code: "feature_not_supported", status: 403 }, "sign-up"), /no está habilitado desde esta dirección/);
  });

  it("never echoes provider messages", () => {
    assert.match(authErrorMessage({ code: "internal_error", message: "db host 10.0.0.1 down" }), /No pudimos completar/);
    assert.match(authErrorMessage(null), /No pudimos completar/);
  });
});

describe("customer form validation", () => {
  it("accepts and normalizes a valid address", () => {
    const result = parseAddress(form(validAddress));
    assert.equal(result.ok, true);
    assert.equal(result.value.postalCode, "M5500ABC");
  });

  it("rejects unknown provinces, bad postal codes and missing fields", () => {
    const result = parseAddress(form({ ...validAddress, province: "Narnia", postalCode: "12", street: "" }));
    assert.equal(result.ok, false);
    assert.deepEqual(Object.keys(result.errors).sort(), ["postalCode", "province", "street"]);
  });

  it("validates profile, sign-up and sign-in input", () => {
    assert.equal(parseProfile(form({ fullName: "Ana", phone: "+54 261 555-1234" })).ok, true);
    assert.equal(parseProfile(form({ fullName: "Ana", phone: "llamame" })).ok, false);
    assert.equal(parseSignUp(form({ name: "Ana", email: "ANA@Example.com", password: "12345678" })).value.email, "ana@example.com");
    assert.equal(parseSignUp(form({ name: "Ana", email: "ana@example.com", password: "corta" })).ok, false);
    assert.equal(parseSignIn(form({ email: "no-es-email", password: "x" })).ok, false);
  });
});

describe("customer repository on PostgreSQL (PGlite)", () => {
  let db;
  let repo;
  let ana;
  let beto;

  before(async () => {
    db = new PGlite();
    await db.exec(migration("0001_catalog_inventory.sql"));
    await db.exec(migration("0002_customers.sql"));
    repo = createCustomerRepository({ query: async (text, params) => (await db.query(text, params)).rows });
    ana = await repo.ensureCustomer("auth-ana", "ana@example.com", "Ana");
    beto = await repo.ensureCustomer("auth-beto", "beto@example.com", "Beto");
  });
  after(() => db.close());

  const address = (overrides = {}) => parseAddress(form({ ...validAddress, ...overrides })).value;

  it("links one customer per auth user, idempotently", async () => {
    const again = await repo.ensureCustomer("auth-ana", "ana.nueva@example.com", "Otro nombre");
    assert.equal(again.id, ana.id);
    assert.equal(again.email, "ana.nueva@example.com");
    assert.equal(again.fullName, "Ana", "the profile name is not overwritten by later sign-ins");
  });

  it("updates the profile", async () => {
    const updated = await repo.updateProfile(ana.id, { fullName: "Ana Pérez", phone: "+54 261 555 1234" });
    assert.equal(updated.fullName, "Ana Pérez");
  });

  it("makes the first address the default and keeps a single default", async () => {
    const home = await repo.addAddress(ana.id, address());
    const work = await repo.addAddress(ana.id, address({ label: "Trabajo" }));
    assert.equal(home.isDefault, true);
    assert.equal(work.isDefault, false);
    await repo.setDefaultAddress(ana.id, work.id);
    const list = await repo.listAddresses(ana.id);
    assert.deepEqual(
      list.map((item) => [item.label, item.isDefault]),
      [
        ["Trabajo", true],
        ["Casa", false],
      ],
    );
  });

  it("promotes another address when the default is deleted", async () => {
    const [defaultAddress] = await repo.listAddresses(ana.id);
    await repo.deleteAddress(ana.id, defaultAddress.id);
    const list = await repo.listAddresses(ana.id);
    assert.equal(list.length, 1);
    assert.equal(list[0].isDefault, true);
  });

  it("never lets a customer read, change or delete another customer's address", async () => {
    const [anasAddress] = await repo.listAddresses(ana.id);
    assert.deepEqual(await repo.listAddresses(beto.id), []);
    await assert.rejects(repo.deleteAddress(beto.id, anasAddress.id), CustomerDataError);
    await assert.rejects(repo.setDefaultAddress(beto.id, anasAddress.id), CustomerDataError);
    assert.equal((await repo.listAddresses(ana.id)).length, 1, "Ana's address is untouched");
  });

  it("rejects malformed ids without reaching the database", async () => {
    await assert.rejects(repo.deleteAddress(ana.id, "1 OR 1=1"), CustomerDataError);
  });

  it(`limits each customer to ${MAX_ADDRESSES} addresses`, async () => {
    for (let index = (await repo.listAddresses(beto.id)).length; index < MAX_ADDRESSES; index++) {
      await repo.addAddress(beto.id, address({ label: `Dir ${index}` }));
    }
    await assert.rejects(repo.addAddress(beto.id, address()), (error) => error.code === "address_limit");
  });

  it("enforces formats and a single default in the database itself", async () => {
    await assert.rejects(db.exec("UPDATE customer_addresses SET postal_code = 'abc' WHERE true"));
    await assert.rejects(db.exec("UPDATE customer_addresses SET is_default = true WHERE true"));
    await assert.rejects(db.exec("INSERT INTO customers (auth_user_id, email) VALUES ('auth-ana', 'x@y.z')"));
  });
});
