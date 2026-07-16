/**
 * Shared helpers for all ERPNext API calls.
 * Centralises base-URL resolution and Authorization header construction
 * so individual route files stay focused on business logic.
 *
 * Uses a persistent undici Agent for connection pooling — this eliminates
 * the per-request TCP + TLS handshake overhead that caused 3-12s latency
 * on every ERPNext call.
 */

import { Agent, fetch as undiciFetch } from "undici";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Connection pool — one persistent Agent for all ERPNext calls.
// connections: max simultaneous sockets to ERPNext (default 10 is enough).
// keepAliveTimeout: how long to keep idle connections open (ms).
// ---------------------------------------------------------------------------
const _erpAgent = new Agent({
  connections: 10,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 60_000,
  connectTimeout: 10_000,
});

/**
 * Drop-in replacement for the global `fetch` that routes through the
 * connection pool. Use this for every ERPNext call instead of global fetch.
 */
export function erpFetch(
  url: string,
  init?: Parameters<typeof undiciFetch>[1],
): ReturnType<typeof undiciFetch> {
  return undiciFetch(url, { ...init, dispatcher: _erpAgent });
}

export function getErpUrl(path: string): string {
  const base = (process.env["ERPNEXT_URL"] ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

export function getErpHeaders(): Record<string, string> {
  const apiKey = process.env["ERPNEXT_API_KEY"] ?? "";
  const apiSecret = process.env["ERPNEXT_API_SECRET"] ?? "";
  return {
    "Content-Type": "application/json",
    Authorization: `token ${apiKey}:${apiSecret}`,
  };
}

/**
 * Ping ERPNext to check if it is reachable.
 * Returns true if ERPNext responds with 2xx, false on any error or timeout.
 * Timeout: 5 seconds.
 */
export async function pingErpNext(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5_000);
    const res = await erpFetch(getErpUrl("/api/method/ping"), {
      headers: getErpHeaders(),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Parse ERPNext's nested `_server_messages` error format into a plain string.
 * Returns an empty string when the field is absent or unparseable.
 */
export function parseErpError(errData: { _server_messages?: string }): string {
  if (!errData._server_messages) return "";
  try {
    const arr = JSON.parse(errData._server_messages) as string[];
    const first = JSON.parse(arr[0] ?? "{}") as { message?: string };
    return (first.message ?? "")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  } catch {
    return "";
  }
}

/**
 * Look up the ERPNext Customer name for a given email.
 * Checks the Customer doctype first, then falls back to
 * Contact → Dynamic Link resolution.
 *
 * Returns the customer name (e.g. "CUST-00001") or an empty string
 * if no customer is found.
 */
export async function findCustomerByEmail(email: string): Promise<string> {
  let customerName = "";

  const customerParams = new URLSearchParams({
    fields: JSON.stringify(["name", "customer_name", "email_id"]),
    filters: JSON.stringify([["email_id", "=", email]]),
    limit_page_length: "1",
  });

  const customerRes = await erpFetch(
    getErpUrl(`/api/resource/Customer?${customerParams.toString()}`),
    { headers: getErpHeaders() },
  );

  if (customerRes.ok) {
    const customerData = (await customerRes.json()) as {
      data: { name: string }[];
    };
    customerName = customerData.data?.[0]?.name ?? "";
  }

  // Fallback: lookup via Contact → Dynamic Link
  if (!customerName) {
    const contactParams = new URLSearchParams({
      fields: JSON.stringify(["name"]),
      filters: JSON.stringify([["user", "=", email]]),
      limit_page_length: "1",
    });
    const contactRes = await erpFetch(
      getErpUrl(`/api/resource/Contact?${contactParams.toString()}`),
      { headers: getErpHeaders() },
    );
    if (contactRes.ok) {
      const contactData = (await contactRes.json()) as {
        data: { name: string }[];
      };
      const contactName = contactData.data?.[0]?.name;
      if (contactName) {
        const linkParams = new URLSearchParams({
          fields: JSON.stringify(["link_name"]),
          filters: JSON.stringify([
            ["parent", "=", contactName],
            ["link_doctype", "=", "Customer"],
          ]),
          limit_page_length: "1",
        });
        const linkRes = await erpFetch(
          getErpUrl(`/api/resource/Dynamic Link?${linkParams.toString()}`),
          { headers: getErpHeaders() },
        );
        if (linkRes.ok) {
          const linkData = (await linkRes.json()) as {
            data: { link_name: string }[];
          };
          customerName = linkData.data?.[0]?.link_name ?? "";
        }
      }
    }
  }

  return customerName;
}

/**
 * Verify that an ERPNext Address record is linked to the given customer.
 * If the link is missing it patches the address in-place.
 * Returns silently on success, or when the address cannot be fetched.
 */
export async function ensureAddressLinkedToCustomer(
  addressName: string,
  customerName: string,
): Promise<boolean> {
  try {
    const res = await erpFetch(
      getErpUrl(
        `/api/resource/Address/${encodeURIComponent(addressName)}?fields=${encodeURIComponent(
          JSON.stringify(["name", "links"]),
        )}`,
      ),
      { headers: getErpHeaders() },
    );
    if (!res.ok) return false;
    const addrData = (await res.json()) as {
      data?: { name: string; links?: { link_doctype: string; link_name: string }[] };
    };
    const links = addrData.data?.links ?? [];
    const alreadyLinked = links.some(
      (l) => l.link_doctype === "Customer" && l.link_name === customerName,
    );
    if (alreadyLinked) return true;
    // Link is missing — patch it in
    const patchRes = await erpFetch(
      getErpUrl(`/api/resource/Address/${encodeURIComponent(addressName)}`),
      {
        method: "PUT",
        headers: getErpHeaders(),
        body: JSON.stringify({
          links: [...links, { link_doctype: "Customer", link_name: customerName }],
        }),
      },
    );
    return patchRes.ok;
  } catch {
    logger.warn({ addressName, customerName }, "ensureAddressLinkedToCustomer failed");
    return false;
  }
}
