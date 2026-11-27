import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { AdminUnavailable, priceInput } from "@/components/admin/shared";
import { PickupForm, ShippingRuleForm, type RuleFormValues } from "@/components/admin/shipping-forms";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { parsePesos } from "@/server/admin/validation";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { PROVINCES } from "@/server/customers/validation";
import { getShippingRepository } from "@/server/orders/session";
import { etaLabel, quoteShipping, SCOPE_LABEL, type ShippingRule } from "@/server/shipping/rules";
import { deleteShippingRuleAction } from "./actions";

export const metadata: Metadata = {
  title: "Envíos · Administración",
  robots: { index: false, follow: false },
};

const zone = (rule: ShippingRule) =>
  rule.scope === "postal_code"
    ? rule.postalFrom === rule.postalTo
      ? `CP ${rule.postalFrom}`
      : `CP ${rule.postalFrom} a ${rule.postalTo}`
    : rule.scope === "city"
      ? `${rule.city} (${rule.province})`
      : rule.scope === "province"
        ? rule.province
        : "Todo el país";

const toForm = (rule?: ShippingRule): RuleFormValues => ({
  ruleId: rule?.id,
  scope: rule?.scope ?? "province",
  label: rule?.label ?? "",
  province: rule?.province ?? "",
  city: rule?.city ?? "",
  postalFrom: rule?.postalFrom ? String(rule.postalFrom) : "",
  postalTo: rule?.postalTo && rule.postalTo !== rule.postalFrom ? String(rule.postalTo) : "",
  cost: rule ? priceInput(rule.costMinor) : "",
  freeFrom: rule?.freeFromMinor ? priceInput(rule.freeFromMinor) : "",
  etaMinDays: String(rule?.etaMinDays ?? 2),
  etaMaxDays: String(rule?.etaMaxDays ?? 4),
  available: rule?.available ?? true,
  active: rule?.active ?? true,
});

type Query = Record<string, string | string[] | undefined>;
const one = (query: Query, key: string) => (typeof query[key] === "string" ? (query[key] as string) : "");

async function Shipping({ searchParams }: { searchParams: PageProps<"/admin/envios">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const query = await searchParams;
  const repo = getShippingRepository();
  const [rules, pickup] = await Promise.all([repo.listRules(), repo.getPickup()]);
  const editing = rules.find((rule) => rule.id === one(query, "editar"));

  // Simulator: which rule applies to an address, and what it would cost.
  const sim = { province: one(query, "provincia"), city: one(query, "localidad"), postalCode: one(query, "cp"), subtotal: one(query, "subtotal") };
  const simulated = sim.province && sim.postalCode ? quoteShipping(rules, sim, parsePesos(sim.subtotal || "0") ?? 0) : null;

  return (
    <div className="account account--wide">
      <AdminNav current="envios" />

      <section className="account__section" aria-labelledby="reglas-title">
        <h2 id="reglas-title">Reglas de envío</h2>
        <p className="muted">
          Para cada dirección se aplica <strong>la regla activa más específica</strong>: código postal → localidad → provincia →
          resto del país. La base de datos impide reglas activas superpuestas del mismo tipo, así que nunca hay dos posibles.
        </p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th scope="col">Regla</th>
                <th scope="col">Tipo</th>
                <th scope="col">Zona</th>
                <th scope="col">Costo</th>
                <th scope="col">Plazo</th>
                <th scope="col">
                  <span className="visually-hidden">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className={rule.active ? undefined : "is-inactive"}>
                  <th scope="row">
                    {rule.label}
                    {!rule.active && <span className="badge badge--pending">Inactiva</span>}
                  </th>
                  <td>{SCOPE_LABEL[rule.scope]}</td>
                  <td>{zone(rule)}</td>
                  <td>
                    {!rule.available
                      ? "Sin cobertura"
                      : rule.costMinor
                        ? formatPrice(rule.costMinor / 100)
                        : "Sin cargo"}
                    {rule.freeFromMinor && <span className="muted"> · gratis desde {formatPrice(rule.freeFromMinor / 100)}</span>}
                  </td>
                  <td>{rule.available ? etaLabel(rule.etaMinDays, rule.etaMaxDays) : "—"}</td>
                  <td>
                    <div className="image-admin__actions">
                      <Link href={`/admin/envios?editar=${rule.id}#editar`}>
                        Editar<span className="visually-hidden"> {rule.label}</span>
                      </Link>
                      <form action={deleteShippingRuleAction}>
                        <input type="hidden" name="ruleId" value={rule.id} />
                        <ConfirmButton message={`¿Borrar la regla "${rule.label}"? Los pedidos ya hechos conservan su costo.`}>
                          Borrar<span className="visually-hidden"> {rule.label}</span>
                        </ConfirmButton>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <div className="admin-layout admin-layout--even">
        <section className="account__section" aria-labelledby="editar-title" id="editar">
          <h2 id="editar-title">{editing ? `Editar: ${editing.label}` : "Nueva regla"}</h2>
          {editing && <Link href="/admin/envios">Cancelar edición</Link>}
          <ShippingRuleForm key={editing?.id ?? "new"} initial={toForm(editing)} provinces={PROVINCES} />
        </section>

        <section className="account__section" aria-labelledby="simulador-title">
          <h2 id="simulador-title">Probar una dirección</h2>
          <form action="/admin/envios" className="quote-form">
            <div className="form-grid">
              <div className="field">
                <label htmlFor="sim-provincia">Provincia</label>
                <select id="sim-provincia" name="provincia" defaultValue={sim.province}>
                  <option value="">Elegí una provincia</option>
                  {PROVINCES.map((province) => (
                    <option key={province}>{province}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sim-localidad">Localidad</label>
                <input id="sim-localidad" name="localidad" defaultValue={sim.city} />
              </div>
              <div className="field">
                <label htmlFor="sim-cp">Código postal</label>
                <input id="sim-cp" name="cp" defaultValue={sim.postalCode} inputMode="numeric" />
              </div>
              <div className="field">
                <label htmlFor="sim-subtotal">Subtotal (ARS)</label>
                <input id="sim-subtotal" name="subtotal" defaultValue={sim.subtotal} inputMode="decimal" />
              </div>
            </div>
            <button type="submit" className="btn btn--coal">
              Probar
            </button>
          </form>
          {simulated && (
            <p className={simulated.covered ? "panel panel--muted" : "form-alert"} role="status">
              {simulated.covered
                ? `Se aplica "${simulated.label}" (${SCOPE_LABEL[simulated.scope].toLowerCase()}): ${
                    simulated.free ? "gratis por el subtotal" : simulated.costMinor ? formatPrice(simulated.costMinor / 100) : "sin cargo"
                  }, ${etaLabel(simulated.etaMinDays, simulated.etaMaxDays)}.`
                : simulated.reason}
            </p>
          )}
        </section>
      </div>

      <section className="account__section" aria-labelledby="retiro-title">
        <h2 id="retiro-title">Retiro en el taller</h2>
        <PickupForm initial={pickup} />
      </section>
    </div>
  );
}

export default function AdminShippingPage({ searchParams }: PageProps<"/admin/envios">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Envíos" tone="light">
        <p>Reglas de costo y plazo por zona, y el punto de retiro.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Shipping searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
