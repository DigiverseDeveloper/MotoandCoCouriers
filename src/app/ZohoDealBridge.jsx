import { useEffect, useRef } from "react";

const API_BASE = (import.meta.env.VITE_MOTOCO_API_BASE_URL || "/api/live").replace(/\/$/, "");

const STAGE_BY_STATUS = {
  "Order Placed": "ORDER_PLACED",
  Pending: "ORDER_PLACED",
  "Picked Up": "PICKED_UP",
  "In Transit": "IN_TRANSIT",
  Delivered: "DELIVERED",
  Invoiced: "INVOICED",
  "Paid - future use": "PAID",
};

function pathOf(url) {
  try { return new URL(String(url || ""), window.location.origin).pathname; } catch { return String(url || ""); }
}

function queryUser(url) {
  try {
    const parsed = new URL(String(url || ""), window.location.origin);
    const role = parsed.searchParams.get("role") || "";
    const email = parsed.searchParams.get("email") || "";
    return email ? { role, email } : null;
  } catch {
    return null;
  }
}

function isSnapshot(url, method) {
  return method === "PUT" && pathOf(url).endsWith("/snapshot");
}

function isWorkspace(url, method) {
  return method === "GET" && pathOf(url).endsWith("/workspace");
}

function isInvoice(url, method) {
  return method === "POST" && pathOf(url).endsWith("/zoho/books/invoice");
}

function isVerifyCode(url, method) {
  return method === "POST" && pathOf(url).endsWith("/auth/verify-code");
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function normaliseEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function idMatches(value, candidates) {
  return value && candidates.filter(Boolean).includes(String(value));
}

function orderBelongsToClient(order, user) {
  if (!user || user.role !== "client") return true;
  const email = normaliseEmail(user.email);
  const ids = [
    user.id,
    user.zohoContactId,
    user.zohoAccountId,
    user.zohoContactId ? `crm_${user.zohoContactId}` : "",
    user.zohoAccountId ? `crm_account_${user.zohoAccountId}` : "",
  ].map(String);

  return (
    normaliseEmail(order.clientEmail) === email ||
    normaliseEmail(order.email) === email ||
    idMatches(order.clientId, ids) ||
    idMatches(order.zohoContactId, ids) ||
    idMatches(order.zohoAccountId, ids)
  );
}

function clientBelongsToUser(client, user) {
  if (!user || user.role !== "client") return true;
  const email = normaliseEmail(user.email);
  return normaliseEmail(client.email) === email || client.id === user.id;
}

function deliveryBelongsToClient(delivery, user, visibleOrderIds) {
  if (!user || user.role !== "client") return true;
  const email = normaliseEmail(user.email);
  return normaliseEmail(delivery.clientEmail) === email || visibleOrderIds.has(delivery.orderId);
}

function filterStoreForUser(store, user) {
  if (!user || user.role !== "client") return store;
  const orders = (store.orders || []).filter(order => orderBelongsToClient(order, user));
  const visibleOrderIds = new Set(orders.map(order => order.id));

  return {
    ...store,
    clients: (store.clients || []).filter(client => clientBelongsToUser(client, user)),
    orders,
    deliveries: (store.deliveries || []).filter(delivery => deliveryBelongsToClient(delivery, user, visibleOrderIds)),
  };
}

function mergeOrders(baseOrders = [], zohoOrders = []) {
  const byId = new Map();
  for (const order of baseOrders) byId.set(order.id, order);
  for (const order of zohoOrders) byId.set(order.id, { ...byId.get(order.id), ...order });
  return [...byId.values()];
}

export default function ZohoDealBridge({ children }) {
  const previousStoreRef = useRef(null);
  const dealIdsRef = useRef(new Map());
  const lastUserRef = useRef(null);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);

    async function pullZohoOrders() {
      const response = await originalFetch("/.netlify/functions/deals-workspace");
      if (!response.ok) return [];
      const body = await response.json().catch(() => ({}));
      return Array.isArray(body.orders) ? body.orders : [];
    }

    async function createDeal(order) {
      const response = await originalFetch(`${API_BASE}/zoho/crm/deal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body.dealId) dealIdsRef.current.set(order.id, body.dealId);
      return body.dealId;
    }

    async function updateStage(order, stageKey, amount) {
      const dealId = order?.zohoDealId || dealIdsRef.current.get(order?.id || order?.orderId);
      if (!dealId || !stageKey) return;

      await originalFetch(`${API_BASE}/zoho/crm/deal/stage`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, stageKey, amount }),
      }).catch(console.error);
    }

    async function syncSnapshot(store) {
      const nextStore = copy(store);
      const previousOrders = new Map((previousStoreRef.current?.orders || []).map(order => [order.id, order]));

      for (const order of nextStore.orders || []) {
        if (order.zohoDealId) dealIdsRef.current.set(order.id, order.zohoDealId);

        const knownDealId = dealIdsRef.current.get(order.id);
        if (knownDealId && !order.zohoDealId) order.zohoDealId = knownDealId;

        const previous = previousOrders.get(order.id);
        if (!previous && !order.zohoDealId) {
          const dealId = await createDeal(order).catch(error => {
            console.error(error);
            return null;
          });
          if (dealId) order.zohoDealId = dealId;
        }

        if (previous && previous.status !== order.status) {
          await updateStage(order, STAGE_BY_STATUS[order.status], order.price);
        }
      }

      for (const delivery of nextStore.deliveries || []) {
        const dealId = delivery.zohoDealId || dealIdsRef.current.get(delivery.orderId);
        if (dealId && !delivery.zohoDealId) delivery.zohoDealId = dealId;
      }

      previousStoreRef.current = copy(nextStore);
      return nextStore;
    }

    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = String(init?.method || "GET").toUpperCase();

      if (isVerifyCode(url, method)) {
        const response = await originalFetch(input, init);
        const clone = response.clone();
        const body = await clone.json().catch(() => ({}));
        if (response.ok && body.user) lastUserRef.current = body.user;
        return response;
      }

      if (isSnapshot(url, method)) {
        let payload = {};
        try { payload = JSON.parse(init.body || "{}"); } catch {}

        if (payload.store) {
          const enrichedStore = await syncSnapshot(payload.store);
          return originalFetch(input, {
            ...init,
            body: JSON.stringify({ store: enrichedStore }),
          });
        }
      }

      if (isInvoice(url, method)) {
        let payload = {};
        try { payload = JSON.parse(init.body || "{}"); } catch {}

        const enrichedDeliveries = (payload.deliveries || []).map(delivery => ({
          ...delivery,
          zohoDealId: delivery.zohoDealId || dealIdsRef.current.get(delivery.orderId),
        }));

        const response = await originalFetch(input, {
          ...init,
          body: JSON.stringify({ ...payload, deliveries: enrichedDeliveries }),
        });

        const clone = response.clone();
        const body = await clone.json().catch(() => ({}));
        if (response.ok && body.success) {
          await Promise.all(enrichedDeliveries.map(delivery =>
            updateStage(delivery, "INVOICED", delivery.totalPrice)
          ));
        }

        return response;
      }

      const response = await originalFetch(input, init);

      if (isWorkspace(url, method) && response.ok) {
        const clone = response.clone();
        const body = await clone.json().catch(() => ({}));
        if (body.store) {
          const viewer = queryUser(url) || lastUserRef.current;
          if (viewer?.email) lastUserRef.current = { ...lastUserRef.current, ...viewer };
          const zohoOrders = await pullZohoOrders().catch(error => {
            console.error(error);
            return [];
          });
          const mergedStore = {
            ...body.store,
            orders: mergeOrders(body.store.orders || [], zohoOrders),
          };
          const store = filterStoreForUser(mergedStore, viewer || lastUserRef.current);
          previousStoreRef.current = copy(store);
          for (const order of store.orders || []) {
            if (order.zohoDealId) dealIdsRef.current.set(order.id, order.zohoDealId);
          }
          return new Response(JSON.stringify({ ...body, store }), {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers,
          });
        }
      }

      return response;
    };

    return () => { window.fetch = originalFetch; };
  }, []);

  return children;
}
