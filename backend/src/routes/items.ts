import { Router, type IRouter } from "express";
import { getErpUrl, getErpHeaders, erpFetch} from "../lib/erpnext-client";
import { itemCache } from "../lib/item-cache";
import { logger } from "../lib/logger";

const router: IRouter = Router();


type WebsiteItemRecord = Record<string, unknown>;

async function fetchSellingPriceForItem(itemCode: string): Promise<number | null> {
  const params = new URLSearchParams({
    fields: JSON.stringify(["price_list_rate", "price_list", "currency"]),
    filters: JSON.stringify([
      ["item_code", "=", itemCode],
      ["selling", "=", 1],
    ]),
    order_by: "price_list_rate desc",
    limit_page_length: "20",
  });

  const res = await erpFetch(
    getErpUrl(`/api/resource/Item Price?${params}`),
    { headers: getErpHeaders() },
  ).catch(() => null);

  if (!res?.ok) return null;

  const json = (await res.json()) as {
    data?: { price_list_rate?: number; price_list?: string; currency?: string }[];
  };

  const rows = (json.data ?? []).filter(
    (row) => typeof row.price_list_rate === "number" && row.price_list_rate > 0,
  );

  if (!rows.length) return null;

  const standardSelling = rows.find((row) =>
    row.price_list?.toLowerCase().includes("standard selling"),
  );

  return standardSelling?.price_list_rate ?? rows[0]?.price_list_rate ?? null;
}

async function fetchSellingPricesForItems(itemCodes: string[]): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  const uniqueCodes = [...new Set(itemCodes.filter(Boolean))];
  const chunkSize = 80;

  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    const params = new URLSearchParams({
      fields: JSON.stringify(["item_code", "price_list_rate", "price_list", "currency"]),
      filters: JSON.stringify([
        ["item_code", "in", chunk],
        ["selling", "=", 1],
      ]),
      order_by: "price_list_rate desc",
      limit_page_length: String(Math.max(100, chunk.length * 10)),
    });

    const res = await erpFetch(
      getErpUrl(`/api/resource/Item Price?${params}`),
      { headers: getErpHeaders() },
    ).catch(() => null);

    if (!res?.ok) continue;

    const json = (await res.json()) as {
      data?: {
        item_code?: string;
        price_list_rate?: number;
        price_list?: string;
        currency?: string;
      }[];
    };

    const rowsByItem = new Map<string, { price_list_rate: number; price_list?: string }[]>();
    for (const row of json.data ?? []) {
      if (!row.item_code || !row.price_list_rate || row.price_list_rate <= 0) continue;
      const rows = rowsByItem.get(row.item_code) ?? [];
      rows.push({ price_list_rate: row.price_list_rate, price_list: row.price_list });
      rowsByItem.set(row.item_code, rows);
    }

    for (const [itemCode, rows] of rowsByItem) {
      const standardSelling = rows.find((row) =>
        row.price_list?.toLowerCase().includes("standard selling"),
      );
      const highest = [...rows].sort((a, b) => b.price_list_rate - a.price_list_rate)[0];
      result[itemCode] = standardSelling?.price_list_rate ?? highest?.price_list_rate ?? 0;
    }
  }

  return result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await mapper(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );

  return results;
}


// ─── GET /api/items/version ───────────────────────────────────────────────────
router.get("/items/version", (_req, res) => {
  res.json({ version: itemCache.getVersion() });
});

// ─── GET /api/items ───────────────────────────────────────────────────────────
// Fetches from the ERPNext "Website Item" doctype.
// Only published items from the Website Item list are returned.
router.get("/items", async (req, res) => {
  try {
    const { search, limit = "60", _t } = req.query as {
      search?: string;
      limit?: string;
      _t?: string;
    };

    // _t param indicates a cacheBust request — skip cache and fetch fresh data
    const bustCache = Boolean(_t);

    const cacheKey = `website_items:${search ?? ""}:${limit}`;
    const cached = !bustCache && itemCache.get(cacheKey);

    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("X-Cache-Version", String(itemCache.getVersion()));
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      res.json({ data: cached, version: itemCache.getVersion() });
      return;
    }

    // Actual Website Item fields (schema-verified)
    const fields = JSON.stringify([
      "name",
      "item_code",
      "item_name",
      "web_item_name",
      "route",
      "published",
      "website_image",
      "website_image_alt",
      "thumbnail",
      "short_description",
      "description",
      "web_long_description",
      "item_group",
      "brand",
      "stock_uom",
      "ranking",
      "has_variants",
      "on_backorder",
      "custom_stock_qty",
      "website_warehouse",
    ]);

    // Only published Website Items
    const filters: Array<[string, string, string | number]> = [
      ["published", "=", 1],
    ];

    if (search) {
      filters.push(["item_name", "like", `%${search}%`]);
    }

    const params = new URLSearchParams({
      fields,
      filters: JSON.stringify(filters),
      limit_page_length: limit,
      order_by: "modified desc",
    });

    // "Website Item" doctype — separate endpoint from Item
    const erpRes = await erpFetch(
      getErpUrl(`/api/resource/Website Item?${params}`),
      { headers: getErpHeaders() },
    );

    if (!erpRes.ok) {
      const err = await erpRes.json().catch(() => ({}));
      logger.error({ err }, "[items] ERPNext Website Item error");
      res.status(502).json({ error: "Failed to fetch items from ERPNext." });
      return;
    }

    const data = (await erpRes.json()) as { data: Record<string, unknown>[] };

    // ── Batch fetch price + image fallback from the Item doctype ────────────
    const itemCodes = data.data
      .map((i) => i["item_code"] as string)
      .filter(Boolean);

    let itemDataMap: Record<string, { valuation_rate: number; image: string | null }> = {};
    const sellingPriceMap: Record<string, number> = {};

    if (itemCodes.length > 0) {
      const itemParams = new URLSearchParams({
        fields: JSON.stringify(["name", "valuation_rate", "standard_rate", "image"]),
        filters: JSON.stringify([["name", "in", itemCodes]]),
        limit_page_length: String(itemCodes.length),
      });

      const itemRes = await erpFetch(
        getErpUrl(`/api/resource/Item?${itemParams}`),
        { headers: getErpHeaders() },
      );

      if (itemRes.ok) {
        const itemJson = (await itemRes.json()) as {
          data: { name: string; valuation_rate: number; standard_rate?: number; image: string | null }[];
        };
        itemDataMap = Object.fromEntries(
          itemJson.data.map((i) => [
            i.name,
            {
              valuation_rate:
                i.standard_rate && i.standard_rate > 0
                  ? i.standard_rate
                  : i.valuation_rate ?? 0,
              image: i.image ?? null,
            },
          ]),
        );
      }

      // ── Item Price doctype se latest selling prices fetch ──────────────────
      // Fast path: batch fetch prices in chunks instead of one ERPNext request
      // per product. This removes the biggest catalog loading bottleneck.
      Object.assign(sellingPriceMap, await fetchSellingPricesForItems(itemCodes));

      // Safety fallback: if the batch query misses a few prices on a specific
      // ERPNext setup, verify only a small number individually. Items without
      // an Item Price will still use Item.standard_rate / valuation_rate below.
      const missingPriceCodes = itemCodes
        .filter((code) => !sellingPriceMap[code])
        .slice(0, 20);
      if (missingPriceCodes.length > 0) {
        const priceRows = await mapWithConcurrency(missingPriceCodes, 4, async (itemCode) => {
          const price = await fetchSellingPriceForItem(itemCode);
          return { itemCode, price };
        });

        for (const row of priceRows) {
          if (row.price && row.price > 0) {
            sellingPriceMap[row.itemCode] = row.price;
          }
        }
      }
      // ─────────────────────────────────────────────────────────────────────
    }
    // ────────────────────────────────────────────────────────────────────────

    // ── Batch fetch actual warehouse stock from Bin doctype ──────────────────
    // Each Website Item may have a website_warehouse field. We fetch actual_qty
    // from Bin for those item+warehouse combos to override custom_stock_qty so
    // In/Out of Stock reflects real inventory.
    const binQtyMap: Record<string, number> = {};

    const warehouseItems = (data.data as Record<string, unknown>[])
      .map((i) => ({
        item_code: i["item_code"] as string,
        warehouse: i["website_warehouse"] as string | null | undefined,
      }))
      .filter((i): i is { item_code: string; warehouse: string } =>
        Boolean(i.item_code && i.warehouse),
      );

    if (warehouseItems.length > 0) {
      const binItemCodes = [...new Set(warehouseItems.map((i) => i.item_code))];
      const binWarehouses = [...new Set(warehouseItems.map((i) => i.warehouse))];

      const binParams = new URLSearchParams({
        fields: JSON.stringify(["item_code", "warehouse", "actual_qty", "reserved_qty"]),
        filters: JSON.stringify([
          ["item_code", "in", binItemCodes],
          ["warehouse", "in", binWarehouses],
        ]),
        limit_page_length: String(warehouseItems.length * 2),
      });

      const binRes = await erpFetch(
        getErpUrl(`/api/resource/Bin?${binParams}`),
        { headers: getErpHeaders() },
      ).catch(() => null);

      if (binRes?.ok) {
        const binJson = (await binRes.json()) as {
          data: { item_code: string; warehouse: string; actual_qty: number; reserved_qty: number }[];
        };
        for (const row of binJson.data) {
          const available = (row.actual_qty ?? 0) - (row.reserved_qty ?? 0);
          binQtyMap[`${row.item_code}::${row.warehouse}`] = available;
        }
        logger.info({ rows: binJson.data.length }, "[items] Bin qty fetched");
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    // Normalize: website_image → image, and if website_image is missing use Item.image
    const normalized = (data.data as Record<string, unknown>[]).map((item) => {
      const itemCode = item["item_code"] as string;
      const warehouse = item["website_warehouse"] as string | null | undefined;
      const fallback = itemDataMap[itemCode] ?? { valuation_rate: 0, image: null };
      const resolvedPrice = sellingPriceMap[itemCode] ?? fallback.valuation_rate;

      // Use actual Bin qty when website_warehouse is set; else fall back to custom_stock_qty
      const stockQty = warehouse
        ? (binQtyMap[`${itemCode}::${warehouse}`] ?? 0)
        : ((item["custom_stock_qty"] as number | null) ?? null);

      return {
        ...item,
        image: (item["website_image"] as string | null) || fallback.image || null,
        item_name: item["web_item_name"] || item["item_name"],
        standard_rate: resolvedPrice,
        valuation_rate: resolvedPrice,
        custom_stock_qty: stockQty,
      };
    });

    itemCache.set(cacheKey, normalized);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("X-Cache-Version", String(itemCache.getVersion()));
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    res.json({ data: normalized, version: itemCache.getVersion() });
  } catch (err) {
    logger.error({ err }, "[items]");
    res.status(500).json({ error: "Internal server error." });
  }
});

// ─── GET /api/items/:name ─────────────────────────────────────────────────────
// Fetch a single item from Website Item first,
// fallback to the Item doctype if not found.
router.get("/items/:name", async (req, res) => {
  try {
    const { name } = req.params;
    const { _t } = req.query as { _t?: string };
    const bustCache = Boolean(_t);

    const cacheKey = `website_item:${name}`;

    const cached = !bustCache && itemCache.get(cacheKey);
    if (cached) {
      res.setHeader("X-Cache", "HIT");
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      res.json({ data: cached });
      return;
    }

    // Try the Website Item doctype first
    const webRes = await erpFetch(
      getErpUrl(`/api/resource/Website Item/${encodeURIComponent(name)}`),
      { headers: getErpHeaders() },
    );

    if (webRes.ok) {
      const webData = (await webRes.json()) as { data: Record<string, unknown> };
      const item = webData.data;
      const itemCode = item["item_code"] as string | undefined;
      logger.info({ name, itemCode }, "[items/:name] lookup");

      // ── Fetch valuation_rate + image fallback from the Item doctype ──────
      let valuation_rate = 0;
      let itemImage: string | null = null;

      if (itemCode) {
        // Item doctype se valuation_rate + image
        const priceRes = await erpFetch(
          getErpUrl(`/api/resource/Item/${encodeURIComponent(itemCode)}`),
          { headers: getErpHeaders() },
        ).catch(() => null);

        if (priceRes?.ok) {
          const priceData = (await priceRes.json()) as {
            data: { valuation_rate?: number; standard_rate?: number; image?: string | null };
          };
          valuation_rate =
            (priceData.data.standard_rate && priceData.data.standard_rate > 0
              ? priceData.data.standard_rate
              : priceData.data.valuation_rate) ?? 0;
          itemImage = priceData.data.image ?? null;
          logger.info({ standard_rate: priceData.data.standard_rate, valuation_rate: priceData.data.valuation_rate, resolved: valuation_rate }, "[items/:name] Item doctype resolved");
        } else {
          logger.info({ status: priceRes?.status }, "[items/:name] Item doctype fetch failed");
        }

        // ── Fetch selling price from the Item Price doctype (Standard Selling) ─
        const itemPriceParams = new URLSearchParams({
          fields: JSON.stringify(["price_list_rate", "price_list", "currency"]),
          filters: JSON.stringify([
            ["item_code", "=", itemCode],
            ["selling", "=", 1],
          ]),
          order_by: "price_list_rate desc",
          limit_page_length: "10",
        });

        const itemPriceRes = await erpFetch(
          getErpUrl(`/api/resource/Item Price?${itemPriceParams}`),
          { headers: getErpHeaders() },
        ).catch(() => null);

        if (itemPriceRes?.ok) {
          const itemPriceData = (await itemPriceRes.json()) as {
            data: { price_list_rate: number; price_list: string; currency: string }[];
          };
          logger.info({ rows: itemPriceData.data }, "[items/:name] Item Price rows");
          // Prefer the "Standard Selling" price list, otherwise use the first available
          const standardPrice = itemPriceData.data.find(
            (p) => p.price_list?.toLowerCase().includes("standard selling"),
          );
          const bestPrice = standardPrice ?? itemPriceData.data[0];
          if (bestPrice?.price_list_rate > 0) {
            valuation_rate = bestPrice.price_list_rate;
            logger.info({ price_list: bestPrice.price_list, rate: valuation_rate }, "[items/:name] Item Price selected");
          }
        } else {
          logger.info({ status: itemPriceRes?.status }, "[items/:name] Item Price fetch failed");
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Fetch Website Slideshow images ──────────────────────────────
      let slideshow_images: string[] = [];
      const slideshowName = item["website_slideshow"] as string | undefined;
      if (slideshowName) {
        const slideshowParams = new URLSearchParams({
          fields: JSON.stringify(["image"]),
          filters: JSON.stringify([["parent", "=", slideshowName]]),
          limit_page_length: "20",
          order_by: "idx asc",
        });
        const slideshowRes = await erpFetch(
          getErpUrl(`/api/resource/Website Slideshow Item?${slideshowParams}`),
          { headers: getErpHeaders() },
        ).catch(() => null);

        if (slideshowRes?.ok) {
          const slideshowData = (await slideshowRes.json()) as {
            data: { image: string }[];
          };
          slideshow_images = slideshowData.data
            .map((s) => s.image)
            .filter(Boolean);
          logger.info({ slideshowName, imageCount: slideshow_images.length }, "[items/:name] Slideshow loaded");
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // ── Fetch actual warehouse stock from Bin doctype ───────────────────
      let stockQtySingle: number | null = (item["custom_stock_qty"] as number | null) ?? null;
      const websiteWarehouse = item["website_warehouse"] as string | null | undefined;

      if (itemCode && websiteWarehouse) {
        const binSingleParams = new URLSearchParams({
          fields: JSON.stringify(["actual_qty", "reserved_qty"]),
          filters: JSON.stringify([
            ["item_code", "=", itemCode],
            ["warehouse", "=", websiteWarehouse],
          ]),
          limit_page_length: "1",
        });

        const binSingleRes = await erpFetch(
          getErpUrl(`/api/resource/Bin?${binSingleParams}`),
          { headers: getErpHeaders() },
        ).catch(() => null);

        if (binSingleRes?.ok) {
          const binSingleJson = (await binSingleRes.json()) as {
            data: { actual_qty: number; reserved_qty: number }[];
          };
          const row = binSingleJson.data[0];
          const available = row ? (row.actual_qty ?? 0) - (row.reserved_qty ?? 0) : 0;
          stockQtySingle = available;
          logger.info({ itemCode, warehouse: websiteWarehouse, actual: row?.actual_qty, reserved: row?.reserved_qty, available }, "[items/:name] Bin qty");
        }
      }
      // ────────────────────────────────────────────────────────────────────

      // Normalize fields
      const normalized = {
        ...item,
        image: (item["website_image"] as string | null) || itemImage || null,
        item_name: item["web_item_name"] || item["item_name"],
        standard_rate: valuation_rate,
        valuation_rate,
        slideshow_images,
        custom_stock_qty: stockQtySingle,
      };

      itemCache.set(cacheKey, normalized);
      res.setHeader("X-Cache", "MISS");
      res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
      res.json({ data: normalized });
      return;
    }

    // Fallback: try the Item doctype using item_code
    const itemRes = await erpFetch(
      getErpUrl(`/api/resource/Item/${encodeURIComponent(name)}`),
      { headers: getErpHeaders() },
    );

    if (!itemRes.ok) {
      logger.error({ name }, "[items/:name] Not found in Website Item or Item");
      res.status(404).json({ error: "Item not found." });
      return;
    }

    const itemData = (await itemRes.json()) as { data: unknown };
    itemCache.set(cacheKey, itemData.data);

    res.setHeader("X-Cache", "MISS");
    res.setHeader("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    res.json({ data: itemData.data });
  } catch (err) {
    logger.error({ err }, "[items/:name]");
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;