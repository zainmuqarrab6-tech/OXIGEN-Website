/**
 * order-queue.ts
 *
 * Lightweight persistent order queue with exponential-backoff retry.
 *
 * Features:
 *  - Zero external dependencies (no RabbitMQ / Redis required)
 *  - Survives server restarts via JSON file persistence
 *  - Exponential backoff: 1 min → 5 min → 15 min → 1 h → dead-letter
 *  - Idempotency keys prevent duplicate Sales Orders on retry
 *  - Dead-letter file for permanently failed orders (manual review)
 *  - Graceful shutdown: flushes in-flight jobs before exit
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "./logger.js";
import { getErpUrl, getErpHeaders, parseErpError, pingErpNext, erpFetch, findCustomerByEmail, ensureAddressLinkedToCustomer } from "./erpnext-client.js";
import { sendMail, buildOrderConfirmationEmail } from "./mailer.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, "../../data");
const QUEUE_FILE = resolve(DATA_DIR, "order-queue.json");
const DLQ_FILE = resolve(DATA_DIR, "order-dlq.json");
const COMPLETED_FILE = resolve(DATA_DIR, "order-completed.json");

/** Retry delays in milliseconds (exponential backoff) */
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,   // 1 min
  5 * 60 * 1000,   // 5 min
  15 * 60 * 1000,  // 15 min
  60 * 60 * 1000,  // 1 h
];

const MAX_RETRIES = RETRY_DELAYS_MS.length; // 4 attempts then → DLQ

/** Hard cap — naye orders reject honge jab queue full ho */
const parsedMaxQueueSize = Number.parseInt(process.env.MAX_QUEUE_SIZE ?? "100", 10);
const MAX_QUEUE_SIZE = Number.isFinite(parsedMaxQueueSize) && parsedMaxQueueSize >= 1 ? parsedMaxQueueSize : 100;

/** Is threshold se zyada pending jobs = alert email admin ko */
const ALERT_THRESHOLD = 20;

/** Alert max har 30 min mein ek baar */
const ALERT_COOLDOWN_MS = 30 * 60 * 1000;

let _lastAlertAt: number | null = null;

// ---------------------------------------------------------------------------
// Queue Full Error — user.ts mein 503 return karne ke liye
// ---------------------------------------------------------------------------
export class QueueFullError extends Error {
  constructor(size: number) {
    super(`Order queue is full (${size}/${MAX_QUEUE_SIZE} jobs). ERPNext may be down. Please try again in a few minutes.`);
    this.name = "QueueFullError";
  }
}
const TICK_INTERVAL_MS = 10_000; // 10 seconds

// ---------------------------------------------------------------------------
// Circuit Breaker
// ---------------------------------------------------------------------------

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

const FAILURE_THRESHOLD = 3;
const OPEN_TIMEOUT_MS = 60_000;

let _circuitState: CircuitState = "CLOSED";
let _consecutiveFailures = 0;
let _openedAt: number | null = null;

function recordErpSuccess(): void {
  _consecutiveFailures = 0;
  if (_circuitState !== "CLOSED") {
    _circuitState = "CLOSED";
    _openedAt = null;
    logger.info("order-queue: circuit breaker CLOSED — ERPNext is healthy");
  }
}

function recordErpFailure(): void {
  _consecutiveFailures += 1;
  if (_circuitState === "CLOSED" && _consecutiveFailures >= FAILURE_THRESHOLD) {
    _circuitState = "OPEN";
    _openedAt = Date.now();
    logger.warn(
      { failures: _consecutiveFailures },
      "order-queue: circuit breaker OPEN — ERPNext appears down"
    );
  }
}

async function isErpNextReachable(): Promise<boolean> {
  if (_circuitState === "CLOSED") return true;
  if (_circuitState === "OPEN") {
    const elapsed = Date.now() - (_openedAt ?? 0);
    if (elapsed < OPEN_TIMEOUT_MS) return false;
    _circuitState = "HALF_OPEN";
    logger.info("order-queue: circuit HALF_OPEN — probing ERPNext");
  }
  const alive = await pingErpNext();
  if (alive) { recordErpSuccess(); return true; }
  _circuitState = "OPEN";
  _openedAt = Date.now();
  logger.warn("order-queue: probe failed — circuit back to OPEN");
  return false;
}

export function getCircuitState(): { state: CircuitState; consecutiveFailures: number } {
  return { state: _circuitState, consecutiveFailures: _consecutiveFailures };
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrderJobStatus = "pending" | "processing" | "dead" | "completed";

export interface OrderJobPayload {
  email: string;
  items: { item_code: string; qty: number }[];
  delivery_date?: string;
  addressName?: string;
  shippingAddress?: {
    address_line1: string;
    address_line2?: string;
    city: string;
    state?: string;
    country: string;
    pincode?: string;
    phone?: string;
  };
  setAsDefault?: boolean;
  defaultWarehouse: string;
  defaultCompany: string;
}

export interface OrderJob {
  /** Idempotency key — deterministic, derived from cart contents */
  id: string;
  status: OrderJobStatus;
  payload: OrderJobPayload;
  retryCount: number;
  /** ISO timestamp: when this job may next be attempted */
  nextAttemptAt: string;
  /** ISO timestamp: when the job was first enqueued */
  createdAt: string;
  lastError?: string;
  /** ERPNext Sales Order name, set on success */
  orderName?: string;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}


function readJsonArray<T>(filePath: string): T[] {
  ensureDataDir();
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T[];
  } catch {
    logger.warn({ filePath }, "order-queue: could not parse json file");
    return [];
  }
}

function loadQueue(): OrderJob[] {
  ensureDataDir();
  if (!existsSync(QUEUE_FILE)) return [];
  try {
    const raw = readFileSync(QUEUE_FILE, "utf-8");
    return JSON.parse(raw) as OrderJob[];
  } catch {
    logger.warn("order-queue: could not parse queue file, starting fresh");
    return [];
  }
}

function saveQueue(jobs: OrderJob[]): void {
  ensureDataDir();
  const tmp = QUEUE_FILE + ".tmp";
  writeFileSync(tmp, JSON.stringify(jobs, null, 2), "utf-8");
  renameSync(tmp, QUEUE_FILE);
}


function appendCompleted(job: OrderJob, orderName: string): void {
  ensureDataDir();
  const existing = readJsonArray<OrderJob>(COMPLETED_FILE);
  const completedJob: OrderJob = {
    ...job,
    status: "completed",
    orderName,
    lastError: undefined,
  };

  const withoutSameJob = existing.filter((j) => j.id !== job.id);
  withoutSameJob.push(completedJob);

  // Sirf last 500 entries rakho — file infinitely grow nahi karegi
  const MAX_COMPLETED = 500;
  const pruned = withoutSameJob.length > MAX_COMPLETED
    ? withoutSameJob.slice(-MAX_COMPLETED)
    : withoutSameJob;

  const tmpC = COMPLETED_FILE + ".tmp";
  writeFileSync(tmpC, JSON.stringify(pruned, null, 2), "utf-8");
  renameSync(tmpC, COMPLETED_FILE);
}

function appendDlq(job: OrderJob): void {
  ensureDataDir();
  let existing: OrderJob[] = [];
  if (existsSync(DLQ_FILE)) {
    try {
      existing = JSON.parse(readFileSync(DLQ_FILE, "utf-8")) as OrderJob[];
    } catch {
      // ignore parse errors
    }
  }
  existing.push({ ...job, status: "dead" });
  const tmpD = DLQ_FILE + ".tmp";
  writeFileSync(tmpD, JSON.stringify(existing, null, 2), "utf-8");
  renameSync(tmpD, DLQ_FILE);
}

// ---------------------------------------------------------------------------
// Queue state (in-memory, backed by file)
// ---------------------------------------------------------------------------

let _queue: OrderJob[] = loadQueue();

// Reset any "processing" jobs from a previous crash to "pending"
_queue = _queue.map((j) =>
  j.status === "processing" ? { ...j, status: "pending" as OrderJobStatus } : j
);
saveQueue(_queue);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Enqueue a new order.
 *
 * @param idempotencyKey  Caller-supplied key (e.g. sha256 of email+items).
 *                        If a pending/processing job with the same key exists
 *                        the call is a no-op and returns the existing job id.
 * @param payload         All data needed to create the Sales Order.
 * @returns               The job id.
 */
export function enqueueOrder(
  idempotencyKey: string,
  payload: OrderJobPayload
): string {
  // Idempotency check
  const existing = _queue.find(
    (j) => j.id === idempotencyKey && j.status !== "dead"
  );
  if (existing) {
    logger.info(
      { jobId: idempotencyKey },
      "order-queue: duplicate enqueue suppressed (idempotency)"
    );
    return existing.id;
  }

  // ── Queue size cap — hard limit ──────────────────────────────────────────
  const activeCount = _queue.filter(
    (j) => j.status === "pending" || j.status === "processing"
  ).length;

  if (activeCount >= MAX_QUEUE_SIZE) {
    logger.error(
      { queueSize: activeCount, limit: MAX_QUEUE_SIZE },
      "order-queue: queue full — rejecting new order"
    );
    throw new QueueFullError(activeCount);
  }

  const job: OrderJob = {
    id: idempotencyKey,
    status: "pending",
    payload,
    retryCount: 0,
    nextAttemptAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  _queue.push(job);
  saveQueue(_queue);

  logger.info({ jobId: job.id }, "order-queue: job enqueued");
  return job.id;
}

/**
 * Return a snapshot of a job by id (for polling / status endpoint).
 */
export function getJobStatus(
  jobId: string
): (Pick<OrderJob, "id" | "status" | "retryCount" | "lastError" | "orderName" | "nextAttemptAt"> & { email: string }) | undefined {
  // Important: read from disk each time. In production/build, API routes and
  // processor can run in separate module instances/processes, so in-memory
  // _queue may not be shared.
  const activeJobs = loadQueue();
  const completedJobs = readJsonArray<OrderJob>(COMPLETED_FILE);
  const deadJobs = readJsonArray<OrderJob>(DLQ_FILE);

  const job =
    activeJobs.find((j) => j.id === jobId) ??
    completedJobs.find((j) => j.id === jobId) ??
    deadJobs.find((j) => j.id === jobId);

  if (!job) return undefined;

  const { id, status, retryCount, lastError, orderName, nextAttemptAt, payload } = job;
  return { id, status, retryCount, lastError, orderName, nextAttemptAt, email: payload.email };
}

/**
 * Queue stats — useful for the health endpoint.
 */
export function getQueueStats(): {
  pending: number;
  processing: number;
  dead: number;
  completed: number;
  total: number;
  circuit: { state: string; consecutiveFailures: number };
  backlogAlert: boolean;
  queueCapPercent: number;
  maxQueueSize: number;
  alertThreshold: number;
} {
  // Read from disk so monitor stays accurate even after restart/build process changes.
  const activeJobs = loadQueue();
  const dlqJobs = readJsonArray<OrderJob>(DLQ_FILE);
  const completedJobs = readJsonArray<OrderJob>(COMPLETED_FILE);

  const pending = activeJobs.filter((j) => j.status === "pending").length;
  const processing = activeJobs.filter((j) => j.status === "processing").length;
  const dead = dlqJobs.length;
  const completed = completedJobs.length;

  return {
    pending,
    processing,
    dead,
    completed,
    total: pending + processing,
    circuit: getCircuitState(),
    backlogAlert: pending >= ALERT_THRESHOLD,
    queueCapPercent: Math.round(((pending + processing) / MAX_QUEUE_SIZE) * 100),
    maxQueueSize: MAX_QUEUE_SIZE,
    alertThreshold: ALERT_THRESHOLD,
  };
}

/** Returns all jobs currently in the dead-letter queue */
export function getDlqJobs(): OrderJob[] {
  return readJsonArray<OrderJob>(DLQ_FILE);
}

/** Returns all completed jobs */
export function getCompletedJobs(): OrderJob[] {
  return readJsonArray<OrderJob>(COMPLETED_FILE);
}

/** Returns all pending jobs */
export function getPendingJobs(): OrderJob[] {
  return loadQueue().filter((j) => j.status === "pending");
}

/** Returns all processing jobs */
export function getProcessingJobs(): OrderJob[] {
  return loadQueue().filter((j) => j.status === "processing");
}

/**
 * Moves all DLQ jobs back to pending so they get retried.
 * Clears the DLQ file and re-enqueues each job.
 * Returns the number of jobs re-queued.
 */
export function retryDlqJobs(): number {
  const dlqJobs = readJsonArray<OrderJob>(DLQ_FILE);
  if (dlqJobs.length === 0) return 0;

  for (const job of dlqJobs) {
    const alreadyActive = _queue.find((j) => j.id === job.id);
    if (alreadyActive) continue;

    _queue.push({
      ...job,
      status: "pending",
      retryCount: 0,
      nextAttemptAt: new Date().toISOString(),
      lastError: undefined,
    });
  }

  saveQueue(_queue);
  // Clear DLQ file
  const tmpR = DLQ_FILE + ".tmp";
  writeFileSync(tmpR, JSON.stringify([], null, 2), "utf-8");
  renameSync(tmpR, DLQ_FILE);
  logger.info({ count: dlqJobs.length }, "order-queue: DLQ jobs re-queued by admin");
  return dlqJobs.length;
}

// ---------------------------------------------------------------------------
// ERPNext order creation (extracted from user.ts logic)
// ---------------------------------------------------------------------------

async function createErpOrder(payload: OrderJobPayload): Promise<string> {
  const {
    email,
    items,
    delivery_date,
    addressName,
    shippingAddress,
    setAsDefault,
    defaultWarehouse,
    defaultCompany,
  } = payload;

  // ── Step 1: Find Customer (shared utility) ─────────────────────────────────
  const customerName = await findCustomerByEmail(email);
  if (!customerName) {
    throw new Error(`Customer not found for email: ${email}`);
  }

  // ── Step 2: Resolve address ────────────────────────────────────────────────
  const today = new Date().toISOString().split("T")[0];
  let billingAddressName: string | undefined;
  let shippingAddressName: string | undefined;

  if (addressName) {
    shippingAddressName = addressName;
    billingAddressName = addressName;
    if (setAsDefault) {
      try {
        await erpFetch(
          getErpUrl(`/api/resource/Address/${encodeURIComponent(addressName)}`),
          {
            method: "PUT",
            headers: getErpHeaders(),
            body: JSON.stringify({
              is_primary_address: 1,
              is_shipping_address: 1,
            }),
          }
        );
      } catch {
        // Non-fatal
      }
    }
  } else if (shippingAddress) {
    try {
      const newAddressBody: Record<string, unknown> = {
        address_title: `${customerName.replace(/\s+/g, "-")}-${Date.now()}`,
        address_type: "Shipping",
        address_line1: shippingAddress.address_line1,
        ...(shippingAddress.address_line2
          ? { address_line2: shippingAddress.address_line2 }
          : {}),
        city: shippingAddress.city,
        ...(shippingAddress.state ? { state: shippingAddress.state } : {}),
        country: shippingAddress.country,
        ...(shippingAddress.pincode
          ? { pincode: shippingAddress.pincode }
          : {}),
        ...(shippingAddress.phone ? { phone: shippingAddress.phone } : {}),
        owner: email,
        email_id: email,
        is_shipping_address: setAsDefault ? 1 : 0,
        is_primary_address: setAsDefault ? 1 : 0,
        links: [{ link_doctype: "Customer", link_name: customerName }],
      };
      const createAddrRes = await erpFetch(getErpUrl("/api/resource/Address"), {
        method: "POST",
        headers: getErpHeaders(),
        body: JSON.stringify(newAddressBody),
      });
      if (createAddrRes.ok) {
        const addrData = (await createAddrRes.json()) as {
          data: { name: string };
        };
        shippingAddressName = addrData.data?.name;
        billingAddressName = shippingAddressName;
      }
    } catch {
      // Non-fatal — proceed without address
    }
  } else {
    // Fallback: find saved address by email
    const params = new URLSearchParams({
      fields: JSON.stringify([
        "name",
        "address_type",
        "is_primary_address",
        "is_shipping_address",
      ]),
      filters: JSON.stringify([["email_id", "=", email]]),
      limit_page_length: "20",
      order_by: "modified desc",
    });
    const addressRes = await erpFetch(
      getErpUrl(`/api/resource/Address?${params.toString()}`),
      { headers: getErpHeaders() }
    );
    if (addressRes.ok) {
      const addressData = (await addressRes.json()) as {
        data: {
          name: string;
          address_type?: string;
          is_primary_address?: 0 | 1;
          is_shipping_address?: 0 | 1;
        }[];
      };
      const addresses = addressData.data ?? [];
      const billing =
        addresses.find((a) => a.address_type === "Billing") ??
        addresses.find((a) => a.is_primary_address === 1) ??
        addresses[0];
      const shipping =
        addresses.find((a) => a.address_type === "Shipping") ??
        addresses.find((a) => a.is_shipping_address === 1) ??
        billing ??
        addresses[0];
      billingAddressName = billing?.name;
      shippingAddressName = shipping?.name;
    }
  }

  // ── Step 2b: Ensure resolved addresses are linked to the customer ──────────
  // ERPNext rejects a Sales Order if customer_address doesn't belong to the
  // customer. We verify (and repair) both address names here so that a retry
  // of an old job that has a stale / unlinked address never hard-fails.
  if (billingAddressName) {
    const ok = await ensureAddressLinkedToCustomer(billingAddressName, customerName);
    if (!ok) {
      // Can't guarantee ownership — drop address so order still goes through
      billingAddressName = undefined;
      shippingAddressName = undefined;
    }
  }
  if (shippingAddressName && shippingAddressName !== billingAddressName) {
    const ok = await ensureAddressLinkedToCustomer(shippingAddressName, customerName);
    if (!ok) shippingAddressName = undefined;
  }

  // ── Step 3: Resolve item codes ─────────────────────────────────────────────
  const resolvedItems = await Promise.all(
    items.map(async (i) => {
      let actualItemCode = i.item_code;
      const websiteItemRes = await erpFetch(
        getErpUrl(
          `/api/resource/Website Item/${encodeURIComponent(i.item_code)}?fields=${encodeURIComponent(
            JSON.stringify(["item_code", "web_item_name"])
          )}`
        ),
        { headers: getErpHeaders() }
      );
      if (websiteItemRes.ok) {
        const websiteItemData = (await websiteItemRes.json()) as {
          data?: { item_code?: string };
        };
        if (websiteItemData.data?.item_code) {
          actualItemCode = websiteItemData.data.item_code;
        }
      }
      return { item_code: actualItemCode, qty: i.qty, warehouse: defaultWarehouse };
    })
  );

  // ── Step 4: Create Sales Order ────────────────────────────────────────────
  const orderPayload = {
    doctype: "Sales Order",
    company: defaultCompany,
    customer: customerName,
    transaction_date: today,
    delivery_date: delivery_date ?? today,
    order_type: "Shopping Cart",
    ...(billingAddressName
      ? { customer_address: billingAddressName }
      : {}),
    ...(shippingAddressName
      ? { shipping_address_name: shippingAddressName }
      : {}),
    items: resolvedItems,
  };

  const orderRes = await erpFetch(getErpUrl("/api/resource/Sales Order"), {
    method: "POST",
    headers: getErpHeaders(),
    body: JSON.stringify(orderPayload),
  });

  if (!orderRes.ok) {
    const err = (await orderRes.json().catch(() => ({}))) as {
      _server_messages?: string;
      message?: string;
      exception?: string;
    };
    const message =
      parseErpError(err) ||
      err.message ||
      err.exception ||
      `ERPNext responded with ${orderRes.status}`;
    throw new Error(message);
  }

  const orderData = (await orderRes.json()) as {
    data: { name: string } & Record<string, unknown>;
  };

  // ── Step 5: Submit the order ──────────────────────────────────────────────
  const submitRes = await erpFetch(
    getErpUrl("/api/method/frappe.client.submit"),
    {
      method: "POST",
      headers: getErpHeaders(),
      body: JSON.stringify({ doc: orderData.data }),
    }
  );

  if (!submitRes.ok) {
    const err = (await submitRes.json().catch(() => ({}))) as {
      _server_messages?: string;
      message?: string;
      exception?: string;
    };
    const message =
      parseErpError(err) ||
      err.message ||
      err.exception ||
      `Submit responded with ${submitRes.status}`;
    throw new Error(`Order created but submit failed: ${message}`);
  }

  const submitData = (await submitRes.json()) as {
    message?: { name?: string };
  };

  return submitData.message?.name ?? orderData.data.name;
}

// ---------------------------------------------------------------------------
// Backlog Alert — admin ko email bhejta hai jab queue bhar jaye
// ---------------------------------------------------------------------------

async function checkAndAlertBacklog(): Promise<void> {
  const pending = _queue.filter((j) => j.status === "pending").length;
  if (pending < ALERT_THRESHOLD) return;

  const now = Date.now();
  if (_lastAlertAt && now - _lastAlertAt < ALERT_COOLDOWN_MS) return;
  _lastAlertAt = now;

  const adminEmail = process.env["ADMIN_EMAIL"];
  if (!adminEmail) return;

  const capPercent = Math.round((pending / MAX_QUEUE_SIZE) * 100);
  const frontendUrl = (process.env["FRONTEND_URL"] ?? "http://localhost:5173").replace(/\/$/, "");
  const monitorUrl = `${frontendUrl}/admin/monitor`;

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#dc2626;margin:0 0 12px;">Queue Backlog Alert</h2>
      <p style="color:#374151;margin:0 0 20px;">
        OXIGEN order queue mein <strong>${pending} pending orders</strong> hain
        (${capPercent}% of ${MAX_QUEUE_SIZE} max capacity).
        ERPNext down ya slow ho sakta hai.
      </p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Pending Jobs</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;color:#dc2626;">${pending}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Queue Capacity</td>
          <td style="padding:8px 12px;font-size:13px;font-weight:600;">${capPercent}% (${pending}/${MAX_QUEUE_SIZE})</td>
        </tr>
        <tr style="background:#f3f4f6;">
          <td style="padding:8px 12px;font-size:13px;color:#6b7280;">Time</td>
          <td style="padding:8px 12px;font-size:13px;">${new Date().toLocaleString()}</td>
        </tr>
      </table>
      <a href="${monitorUrl}" style="display:inline-block;background:#16a34a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Admin Monitor Kholain
      </a>
      <p style="margin-top:16px;font-size:12px;color:#9ca3af;">
        Yeh alert har 30 min mein ek baar aata hai jab tak queue ${ALERT_THRESHOLD}+ pe ho.
      </p>
    </div>`;

  try {
    await sendMail({
      to: adminEmail,
      subject: `OXIGEN Queue Alert: ${pending} orders pending (${capPercent}% full)`,
      html,
    });
    logger.warn(
      { pendingJobs: pending, capPercent, adminEmail },
      "order-queue: backlog alert email sent"
    );
  } catch (mailErr) {
    logger.error({ mailErr }, "order-queue: failed to send backlog alert email");
  }
}

// ---------------------------------------------------------------------------
// Processor loop
// ---------------------------------------------------------------------------

let _processorTimer: ReturnType<typeof setInterval> | null = null;
let _isProcessing = false;

async function processTick(): Promise<void> {
  if (_isProcessing) return;
  _isProcessing = true;

  try {
    // ── Backlog alert — admin ko notify karo ─────────────────────────────────
    void checkAndAlertBacklog();

    // ── Circuit breaker / health check ──────────────────────────────────────
    const reachable = await isErpNextReachable();
    if (!reachable) return;

    const now = new Date();
    const due = _queue.filter(
      (j) =>
        j.status === "pending" && new Date(j.nextAttemptAt) <= now
    );

    for (const job of due) {
      job.status = "processing";
      saveQueue(_queue);

      logger.info(
        { jobId: job.id, attempt: job.retryCount + 1 },
        "order-queue: processing job"
      );

      try {
        const orderName = await createErpOrder(job.payload);
        recordErpSuccess();
        job.orderName = orderName;
        void sendMail({
          to: job.payload.email,
          subject: `Order Confirmed — OXIGEN (${orderName})`,
          html: buildOrderConfirmationEmail(job.payload, orderName),
          erp: { referenceDoctype: "Sales Order", referenceName: orderName },
        }).catch((err) => logger.error({ err }, "Failed to send order confirmation email"));
        appendCompleted(job, orderName);
        _queue = _queue.filter((j) => j.id !== job.id);
        saveQueue(_queue);
        logger.info(
          { jobId: job.id, orderName },
          "order-queue: job completed successfully"
        );
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        job.retryCount += 1;
        job.lastError = message;

        const isConnectivityError =
          message.includes("fetch failed") ||
          message.includes("ECONNREFUSED") ||
          message.includes("ETIMEDOUT") ||
          message.includes("AbortError") ||
          message.includes("ERPNext responded with 5");

        if (isConnectivityError) recordErpFailure();

        if (job.retryCount >= MAX_RETRIES) {
          job.status = "dead";
          appendDlq(job);
          _queue = _queue.filter((j) => j.id !== job.id);
          saveQueue(_queue);
          logger.error(
            { jobId: job.id, error: message },
            "order-queue: job moved to dead-letter after max retries"
          );
        } else {
          const delayMs = RETRY_DELAYS_MS[job.retryCount - 1] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
          job.nextAttemptAt = new Date(Date.now() + delayMs).toISOString();
          job.status = "pending";
          saveQueue(_queue);
          logger.warn(
            { jobId: job.id, retryCount: job.retryCount, nextAttemptAt: job.nextAttemptAt, error: message },
            "order-queue: job scheduled for retry"
          );
        }
      }
    }
  } finally {
    _isProcessing = false;
  }
}

/** Clears all PENDING jobs from the active queue (processing jobs are kept) */
export function clearPendingQueue(): number {
  const before = _queue.filter((j) => j.status === "pending").length;
  _queue = _queue.filter((j) => j.status !== "pending");
  saveQueue(_queue);
  logger.warn({ removedCount: before }, "order-queue: pending queue cleared by admin");
  return before;
}

/** Clears the dead-letter queue file */
export function clearDlq(): number {
  const existing = readJsonArray<OrderJob>(DLQ_FILE);
  const count = existing.length;
  ensureDataDir();
  // clearDlq
  const tmpDlq = DLQ_FILE + ".tmp";
  writeFileSync(tmpDlq, JSON.stringify([]), "utf-8");
  renameSync(tmpDlq, DLQ_FILE);
  logger.warn({ removedCount: count }, "order-queue: DLQ cleared by admin");
  return count;
}

/** Clears the completed jobs log file */
export function clearCompleted(): number {
  const existing = readJsonArray<OrderJob>(COMPLETED_FILE);
  const count = existing.length;
  ensureDataDir();
  // clearCompleted
  const tmpCmp = COMPLETED_FILE + ".tmp";
  writeFileSync(tmpCmp, JSON.stringify([]), "utf-8");
  renameSync(tmpCmp, COMPLETED_FILE);
  logger.warn({ removedCount: count }, "order-queue: completed log cleared by admin");
  return count;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startQueueProcessor(): void {
  if (_processorTimer) return;
  _processorTimer = setInterval(() => {
    void processTick();
  }, TICK_INTERVAL_MS);
  // Run immediately on startup for any pending jobs from previous run
  void processTick();
  logger.info("order-queue: processor started");
}

export function stopQueueProcessor(): Promise<void> {
  if (_processorTimer) {
    clearInterval(_processorTimer);
    _processorTimer = null;
  }
  // Wait for current tick to finish (max 5s)
  return new Promise((resolve) => {
    const waited = setInterval(() => {
      if (!_isProcessing) {
        clearInterval(waited);
        logger.info("order-queue: processor stopped");
        resolve();
      }
    }, 100);
    setTimeout(() => {
      clearInterval(waited);
      resolve();
    }, 5000);
  });
}
