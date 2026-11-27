import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { AdminNav } from "@/components/admin/admin-nav";
import { ConfirmButton } from "@/components/admin/confirm-button";
import { PromotionForm, type PromotionFormValues } from "@/components/admin/promotion-form";
import { AdminUnavailable, loadCategoryOptions, priceInput } from "@/components/admin/shared";
import { argentinaTime } from "@/components/orders/order-view";
import { PageIntro } from "@/components/page-intro";
import { formatPrice } from "@/lib/format";
import { PROMOTION_KINDS, promotionLive, type Promotion } from "@/lib/promotions";
import { toArgentinaInput } from "@/server/admin/product-extras";
import { adminAvailable, getCurrentAdmin } from "@/server/admin/session";
import { getPromotionRepository } from "@/server/orders/session";
import { deletePromotionAction, togglePromotionAction } from "./actions";

export const metadata: Metadata = {
  title: "Promociones · Administración",
  robots: { index: false, follow: false },
};

const pesos = (minor: number) => formatPrice(minor / 100);

/** One line that says what the promotion gives. */
function detail(promotion: Promotion): string {
  const { params } = promotion;
  switch (promotion.kind) {
    case "percent":
      return `${params.percent} % de descuento`;
    case "fixed":
      return `${pesos(params.amountMinor ?? 0)} de descuento`;
    case "quantity_tiers":
      return (params.tiers ?? []).map((tier) => `desde ${tier.minQuantity}: −${tier.percent} %`).join(" · ");
    case "buy_x_pay_y":
      return `Llevá ${params.buy}, pagá ${params.pay}`;
    case "free_shipping":
      return "Envío gratis";
    case "bundle":
      return `${(params.items ?? []).map((item) => `${item.quantity} × ${item.productId}`).join(" + ")} a ${pesos(params.priceMinor ?? 0)}`;
    case "payment_method":
      return `${params.percent} % pagando por transferencia o efectivo`;
  }
}

function scopeLabel(promotion: Promotion, categories: Map<string, string>): string {
  if (promotion.scope === "categories") return promotion.categoryIds.map((id) => categories.get(id) ?? id).join(", ");
  if (promotion.scope === "products") return promotion.productIds.join(", ");
  return promotion.kind === "bundle" ? "Productos del combo" : "Toda la tienda";
}

function status(promotion: Promotion, now: Date): { label: string; tone: string } {
  if (!promotion.active) return { label: "Pausada", tone: "badge--pending" };
  if (promotion.startsAt && now < promotion.startsAt) return { label: "Programada", tone: "badge--pending" };
  if (!promotionLive(promotion, now)) return { label: promotion.endsAt && now >= promotion.endsAt ? "Terminada" : "Agotada", tone: "badge--pending" };
  return { label: "Vigente", tone: "badge--ok" };
}

const toForm = (promotion?: Promotion): PromotionFormValues => {
  const params = promotion?.params ?? {};
  const tier = (index: number) => params.tiers?.[index];
  const item = (index: number) => params.items?.[index];
  return {
    promotionId: promotion?.id,
    name: promotion?.name ?? "",
    kind: promotion?.kind ?? "percent",
    scope: promotion?.scope ?? "all",
    categoryIds: promotion?.categoryIds ?? [],
    productIds: promotion?.productIds.join(", ") ?? "",
    percent: params.percent ? String(params.percent) : "",
    amount: params.amountMinor ? priceInput(params.amountMinor) : "",
    tierMin1: tier(0) ? String(tier(0)!.minQuantity) : "",
    tierPercent1: tier(0) ? String(tier(0)!.percent) : "",
    tierMin2: tier(1) ? String(tier(1)!.minQuantity) : "",
    tierPercent2: tier(1) ? String(tier(1)!.percent) : "",
    tierMin3: tier(2) ? String(tier(2)!.minQuantity) : "",
    tierPercent3: tier(2) ? String(tier(2)!.percent) : "",
    buy: params.buy ? String(params.buy) : "",
    pay: params.pay ? String(params.pay) : "",
    bundleProduct1: item(0)?.productId ?? "",
    bundleQuantity1: item(0) ? String(item(0)!.quantity) : "",
    bundleProduct2: item(1)?.productId ?? "",
    bundleQuantity2: item(1) ? String(item(1)!.quantity) : "",
    bundleProduct3: item(2)?.productId ?? "",
    bundleQuantity3: item(2) ? String(item(2)!.quantity) : "",
    bundlePrice: params.priceMinor ? priceInput(params.priceMinor) : "",
    couponCode: promotion?.couponCode ?? "",
    minSubtotal: promotion?.minSubtotalMinor ? priceInput(promotion.minSubtotalMinor) : "",
    startsAt: toArgentinaInput(promotion?.startsAt ?? null),
    endsAt: toArgentinaInput(promotion?.endsAt ?? null),
    maxUses: promotion?.maxUses ? String(promotion.maxUses) : "",
    active: promotion?.active ?? true,
  };
};

async function Promotions({ searchParams }: { searchParams: PageProps<"/admin/promociones">["searchParams"] }) {
  await connection();
  if (!adminAvailable()) return <AdminUnavailable />;
  if (!(await getCurrentAdmin())) notFound();

  const query = await searchParams;
  const [promotions, categoryOptions] = await Promise.all([getPromotionRepository().list(), loadCategoryOptions()]);
  const categories = new Map(categoryOptions.map((option) => [option.value, option.label]));
  const editing = promotions.find((promotion) => promotion.id === query.editar);
  const creating = !editing && query.nuevo === "1";
  const now = new Date();

  return (
    <div className="account account--wide">
      <AdminNav current="promociones" />

      <section className="account__section" aria-labelledby="promos-title">
        <div className="account__head">
          <h2 id="promos-title">Promociones</h2>
          <Link className="btn btn--acid" href="/admin/promociones?nuevo=1#editar">
            + Nueva promoción
          </Link>
        </div>
        <p className="muted">
          Cada producto recibe como máximo una promoción automática (la que más le conviene al cliente). Encima se suma un cupón, y
          al final el descuento por medio de pago. Las ofertas de un producto (precio tachado) se cargan en su ficha.
        </p>
        {promotions.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th scope="col">Promoción</th>
                  <th scope="col">Se aplica a</th>
                  <th scope="col">Cupón</th>
                  <th scope="col">Vigencia</th>
                  <th scope="col">Usos</th>
                  <th scope="col">
                    <span className="visually-hidden">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {promotions.map((promotion) => {
                  const badge = status(promotion, now);
                  return (
                    <tr key={promotion.id} className={promotion.active ? undefined : "is-inactive"}>
                      <th scope="row">
                        {promotion.name} <span className={`badge ${badge.tone}`}>{badge.label}</span>
                        <br />
                        <span className="muted">
                          {PROMOTION_KINDS[promotion.kind]}: {detail(promotion)}
                          {promotion.minSubtotalMinor > 0 && ` · desde ${pesos(promotion.minSubtotalMinor)}`}
                        </span>
                      </th>
                      <td>{scopeLabel(promotion, categories)}</td>
                      <td>{promotion.couponCode ? <code>{promotion.couponCode}</code> : <span className="muted">Automática</span>}</td>
                      <td>
                        {promotion.startsAt || promotion.endsAt ? (
                          <>
                            {promotion.startsAt ? argentinaTime(promotion.startsAt) : "Ya"} → {promotion.endsAt ? argentinaTime(promotion.endsAt) : "sin fin"}
                          </>
                        ) : (
                          <span className="muted">Sin fechas</span>
                        )}
                      </td>
                      <td>
                        {promotion.usesCount}
                        {promotion.maxUses !== null && ` / ${promotion.maxUses}`}
                      </td>
                      <td>
                        <div className="image-admin__actions">
                          <Link href={`/admin/promociones?editar=${promotion.id}#editar`}>
                            Editar<span className="visually-hidden"> {promotion.name}</span>
                          </Link>
                          <form action={togglePromotionAction}>
                            <input type="hidden" name="promotionId" value={promotion.id} />
                            <input type="hidden" name="active" value={String(!promotion.active)} />
                            <button type="submit" className="link-button">
                              {promotion.active ? "Pausar" : "Activar"}
                              <span className="visually-hidden"> {promotion.name}</span>
                            </button>
                          </form>
                          {promotion.usesCount === 0 && (
                            <form action={deletePromotionAction}>
                              <input type="hidden" name="promotionId" value={promotion.id} />
                              <ConfirmButton message={`¿Borrar "${promotion.name}"?`}>
                                Borrar<span className="visually-hidden"> {promotion.name}</span>
                              </ConfirmButton>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="panel panel--muted">Todavía no hay promociones. Tocá “Nueva promoción” para crear la primera.</p>
        )}
      </section>

      {(editing || creating) && (
        <section className="account__section" aria-labelledby="editar-title" id="editar">
          <div className="account__head">
            <h2 id="editar-title">{editing ? `Editar: ${editing.name}` : "Nueva promoción"}</h2>
            <Link href="/admin/promociones">Cancelar</Link>
          </div>
          <PromotionForm key={editing?.id ?? "new"} initial={toForm(editing)} categories={categoryOptions} />
        </section>
      )}
    </div>
  );
}

export default function AdminPromotionsPage({ searchParams }: PageProps<"/admin/promociones">) {
  return (
    <main id="contenido" className="page page--light">
      <PageIntro kicker="Administración" title="Promociones" tone="light">
        <p>Descuentos automáticos, cupones, combos y descuento por medio de pago.</p>
      </PageIntro>
      <Suspense fallback={<p className="panel panel--muted">Cargando…</p>}>
        <Promotions searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
