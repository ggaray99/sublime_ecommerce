import { MAX_ADDRESSES, type AddressInput, type ProfileInput } from "./validation.ts";

/** Minimal query interface shared by the Neon HTTP client and test adapters. */
export type QueryFn = { query(text: string, params?: unknown[]): Promise<unknown[]> };

export type Customer = { id: string; authUserId: string; email: string; fullName: string; phone: string | null };
export type Address = AddressInput & { id: string; isDefault: boolean };

export class CustomerDataError extends Error {
  readonly code: "not_found" | "address_limit";

  constructor(code: "not_found" | "address_limit", message: string) {
    super(message);
    this.code = code;
  }
}

type CustomerRow = { id: string; auth_user_id: string; email: string; full_name: string; phone: string | null };
type AddressRow = {
  id: string;
  label: string;
  recipient: string;
  street: string;
  street_number: string;
  apartment: string;
  city: string;
  province: string;
  postal_code: string;
  notes: string;
  is_default: boolean;
};

const toCustomer = (row: CustomerRow): Customer => ({
  id: row.id,
  authUserId: row.auth_user_id,
  email: row.email,
  fullName: row.full_name,
  phone: row.phone,
});

const toAddress = (row: AddressRow): Address => ({
  id: row.id,
  label: row.label,
  recipient: row.recipient,
  street: row.street,
  streetNumber: row.street_number,
  apartment: row.apartment,
  city: row.city,
  province: row.province,
  postalCode: row.postal_code,
  notes: row.notes,
  isDefault: row.is_default,
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Ids from forms are untrusted: reject malformed ones before they reach SQL. */
function assertAddressId(addressId: string) {
  if (!UUID.test(addressId)) throw new CustomerDataError("not_found", "La dirección no existe.");
}

const ADDRESS_COLUMNS =
  "id, label, recipient, street, street_number, apartment, city, province, postal_code, notes, is_default";

/**
 * Every address query is scoped by the customer id resolved from the session,
 * never by an id coming from the browser alone: a customer cannot read or change
 * another customer's data even with a guessed address id.
 */
export function createCustomerRepository(sql: QueryFn) {
  return {
    /** Finds or creates the customer linked to an auth user (idempotent). */
    async ensureCustomer(authUserId: string, email: string, name: string): Promise<Customer> {
      const rows = (await sql.query(
        `INSERT INTO customers (auth_user_id, email, full_name) VALUES ($1, $2, $3)
         ON CONFLICT (auth_user_id) DO UPDATE SET email = EXCLUDED.email, updated_at = now()
         RETURNING id, auth_user_id, email, full_name, phone`,
        [authUserId, email, name.slice(0, 120)],
      )) as CustomerRow[];
      return toCustomer(rows[0]);
    },

    async updateProfile(customerId: string, input: ProfileInput): Promise<Customer> {
      const rows = (await sql.query(
        `UPDATE customers SET full_name = $2, phone = $3, updated_at = now() WHERE id = $1
         RETURNING id, auth_user_id, email, full_name, phone`,
        [customerId, input.fullName, input.phone],
      )) as CustomerRow[];
      if (!rows.length) throw new CustomerDataError("not_found", "Cliente inexistente.");
      return toCustomer(rows[0]);
    },

    async listAddresses(customerId: string): Promise<Address[]> {
      const rows = (await sql.query(
        `SELECT ${ADDRESS_COLUMNS} FROM customer_addresses WHERE customer_id = $1 ORDER BY is_default DESC, created_at`,
        [customerId],
      )) as AddressRow[];
      return rows.map(toAddress);
    },

    /** The first address becomes the default automatically. */
    async addAddress(customerId: string, input: AddressInput): Promise<Address> {
      const rows = (await sql.query(
        `INSERT INTO customer_addresses
           (customer_id, label, recipient, street, street_number, apartment, city, province, postal_code, notes, is_default)
         SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
                NOT EXISTS (SELECT 1 FROM customer_addresses WHERE customer_id = $1)
         WHERE (SELECT count(*) FROM customer_addresses WHERE customer_id = $1) < $11
         RETURNING ${ADDRESS_COLUMNS}`,
        [
          customerId,
          input.label,
          input.recipient,
          input.street,
          input.streetNumber,
          input.apartment,
          input.city,
          input.province,
          input.postalCode,
          input.notes,
          MAX_ADDRESSES,
        ],
      )) as AddressRow[];
      if (!rows.length) throw new CustomerDataError("address_limit", `Podés guardar hasta ${MAX_ADDRESSES} direcciones.`);
      return toAddress(rows[0]);
    },

    async deleteAddress(customerId: string, addressId: string): Promise<void> {
      assertAddressId(addressId);
      const rows = (await sql.query(
        "DELETE FROM customer_addresses WHERE customer_id = $1 AND id = $2 RETURNING is_default",
        [customerId, addressId],
      )) as { is_default: boolean }[];
      if (!rows.length) throw new CustomerDataError("not_found", "La dirección no existe.");
      if (rows[0].is_default) {
        // Promote the oldest remaining address so there is always a default when any exist.
        await sql.query(
          `UPDATE customer_addresses SET is_default = true, updated_at = now()
           WHERE id = (SELECT id FROM customer_addresses WHERE customer_id = $1 ORDER BY created_at LIMIT 1)`,
          [customerId],
        );
      }
    },

    async setDefaultAddress(customerId: string, addressId: string): Promise<void> {
      assertAddressId(addressId);
      const owned = (await sql.query("SELECT 1 FROM customer_addresses WHERE customer_id = $1 AND id = $2", [
        customerId,
        addressId,
      ])) as unknown[];
      if (!owned.length) throw new CustomerDataError("not_found", "La dirección no existe.");
      // Two statements so the partial unique index never sees two defaults at once.
      await sql.query(
        "UPDATE customer_addresses SET is_default = false, updated_at = now() WHERE customer_id = $1 AND is_default AND id <> $2",
        [customerId, addressId],
      );
      await sql.query(
        "UPDATE customer_addresses SET is_default = true, updated_at = now() WHERE customer_id = $1 AND id = $2",
        [customerId, addressId],
      );
    },
  };
}

export type CustomerRepository = ReturnType<typeof createCustomerRepository>;
