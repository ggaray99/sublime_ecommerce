// Contact data, social links and informational pages edited from /admin/ajustes.
// Validation, what the store shows, and storage over PostgreSQL (PGlite).
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { contactItems, createContactRepository, DEFAULT_CONTACT, parseContact } from "../src/server/settings/contact.ts";
import { createPagesRepository, mergeInfoPage, parsePageContent } from "../src/server/settings/pages.ts";

const migrations = () =>
  readdirSync(join("db", "migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => readFileSync(join("db", "migrations", name), "utf8"));

async function database() {
  const db = new PGlite();
  for (const sql of migrations()) await db.exec(sql);
  return { db, query: { query: async (text, params) => (await db.query(text, params)).rows } };
}

const admin = { authUserId: "admin-1", email: "admin@example.com" };

const fullContact = {
  whatsapp: "+54 9 261 555-1234",
  email: " Hola@Sublime.com.ar ",
  phone: "261 555-1234",
  address: "Av. San Martín 1234, Mendoza",
  hours: "Lunes a viernes de 9 a 18",
  instagram: "@sublime.stickers",
  facebook: "https://www.facebook.com/sublimestickers/",
  tiktok: "tiktok.com/@sublime",
};

describe("contact settings", () => {
  it("accepts every field and normalizes the social links", () => {
    const parsed = parseContact(fullContact);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.value, {
      whatsapp: "5492615551234",
      email: "hola@sublime.com.ar",
      phone: "261 555-1234",
      address: "Av. San Martín 1234, Mendoza",
      hours: "Lunes a viernes de 9 a 18",
      instagram: "https://www.instagram.com/sublime.stickers",
      facebook: "https://www.facebook.com/sublimestickers",
      tiktok: "https://www.tiktok.com/@sublime",
    });
  });

  it("accepts an empty form: nothing is shown", () => {
    const parsed = parseContact({});
    assert.deepEqual(parsed, { ok: true, value: DEFAULT_CONTACT });
    assert.deepEqual(contactItems(parsed.value), []);
  });

  it("rejects an invalid email, a short phone and links to other sites", () => {
    const parsed = parseContact({ ...fullContact, email: "hola@", phone: "1234", instagram: "https://evil.example/sublime" });
    assert.equal(parsed.ok, false);
    assert.deepEqual(Object.keys(parsed.errors).sort(), ["email", "instagram", "phone"]);
    assert.equal(parsed.errors.email, "Revisá el email, ej.: hola@sublime.com.ar.");
    assert.equal(parsed.errors.instagram, "Escribí el usuario (ej.: @sublime) o el link de tu perfil de Instagram.");
  });

  it("lists only the data that is set, with links where they make sense", () => {
    const parsed = parseContact({ email: "hola@sublime.com.ar", instagram: "sublime", whatsapp: "+54 9 261 555 1234" });
    assert.deepEqual(contactItems(parsed.value), [
      { label: "WhatsApp", value: "+5492615551234", href: "https://wa.me/5492615551234" },
      { label: "Email", value: "hola@sublime.com.ar", href: "mailto:hola@sublime.com.ar" },
      { label: "Instagram", value: "@sublime", href: "https://www.instagram.com/sublime" },
    ]);
  });

  it("reads contact data saved before these fields existed", async () => {
    const { db, query } = await database();
    await db.query("INSERT INTO store_settings (key, value, updated_by) VALUES ('contact', $1, 'x')", [{ whatsapp: "5492615551234" }]);
    assert.deepEqual(await createContactRepository(query).get(), { ...DEFAULT_CONTACT, whatsapp: "5492615551234" });
    await db.close();
  });
});

const base = {
  slug: "politicas",
  title: "Políticas",
  description: "Políticas comerciales.",
  intro: "Se están terminando de definir.",
  sections: [{ title: "Privacidad", body: "A definir.", status: "pendiente" }],
};

const pageForm = {
  intro: "Cómo trabajamos.",
  title1: "Cambios",
  body1: "Tenés 30 días.\n\nEl envío lo pagamos nosotros.",
  title2: "",
  body2: "",
  title3: "Privacidad",
  body3: "No compartimos tus datos.",
};

describe("informational pages", () => {
  it("keeps the filled sections in order and skips empty rows", () => {
    const parsed = parsePageContent(pageForm);
    assert.deepEqual(parsed, {
      ok: true,
      value: {
        intro: "Cómo trabajamos.",
        sections: [
          { title: "Cambios", body: "Tenés 30 días.\n\nEl envío lo pagamos nosotros." },
          { title: "Privacidad", body: "No compartimos tus datos." },
        ],
      },
    });
  });

  it("asks for the missing half of a section, an intro and at least one section", () => {
    const parsed = parsePageContent({ intro: "", title1: "Cambios", body1: "" });
    assert.equal(parsed.ok, false);
    assert.equal(parsed.errors.intro, "Escribí una introducción.");
    assert.equal(parsed.errors.body1, "Escribí el texto de esta sección o borrá el título.");
    assert.equal(parsePageContent({ intro: "Hola" }).errors.title1, "Agregá al menos una sección.");
  });

  it("shows the saved text, without the pending badge, and the default text until something is saved", () => {
    assert.deepEqual(mergeInfoPage(base, null), base);
    const merged = mergeInfoPage(base, parsePageContent(pageForm).value);
    assert.equal(merged.title, "Políticas");
    assert.equal(merged.intro, "Cómo trabajamos.");
    assert.deepEqual(merged.sections.map((section) => section.status), [undefined, undefined]);
  });

  it("saves one page per slug with an audit entry and rejects unknown pages", async () => {
    const { db, query } = await database();
    const repo = createPagesRepository(query);
    assert.equal(await repo.get("politicas"), null);
    await repo.save(admin, "politicas", parsePageContent(pageForm).value);
    assert.equal((await repo.get("politicas")).intro, "Cómo trabajamos.");
    assert.equal(await repo.get("envios"), null);
    await assert.rejects(repo.save(admin, "otra", parsePageContent(pageForm).value), /Página desconocida/);
    const { rows } = await db.query("SELECT action, entity_id FROM audit_logs WHERE entity = 'settings'");
    assert.deepEqual(rows, [{ action: "settings.page", entity_id: "page_politicas" }]);
    await db.close();
  });
});
