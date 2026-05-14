import { useEffect, useMemo, useState } from "react";

const API_BASE = (import.meta.env.VITE_MOTOCO_API_BASE_URL || "/api/live").replace(/\/$/, "");
const BRISBANE_TZ = "Australia/Brisbane";

function textOf(element) {
  return String(element?.textContent || "").trim();
}

function isDriverScreen() {
  return document.querySelector(".dw-shell") && document.querySelector(".rpill")?.textContent?.trim()?.toLowerCase() === "driver";
}

function brisbaneDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: BRISBANE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function orderDateKey(order = {}) {
  const value = order.requestedPickupDate || order.milkRunDate || order.preferredDate || order.submittedAt;
  if (!value) return brisbaneDateKey();
  const text = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? brisbaneDateKey() : date.toISOString().slice(0, 10);
}

function displayDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
}

function normaliseStatus(status) {
  return status === "Pending" ? "Order Placed" : String(status || "Order Placed");
}

function findOrderFromCard(card, orders) {
  const conNote = textOf(card?.querySelector?.(".dw-order-top strong"));
  if (!conNote) return null;
  return orders.find(order => String(order.conNote || "").trim() === conNote) || null;
}

async function apiJSON(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "Server request failed.");
  return body;
}

async function pullZohoOrders() {
  const response = await fetch("/.netlify/functions/deals-workspace");
  if (!response.ok) return [];
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body.orders) ? body.orders : [];
}

async function updatePickupOutcome(order, { outcome, stageKey, requestedPickupDate, notes }) {
  if (!order?.zohoDealId) throw new Error("This pickup does not have a Zoho Deal ID yet.");
  const actualPickupAt = new Date().toISOString();
  return fetch("/.netlify/functions/pickup-outcome", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      dealId: order.zohoDealId,
      stageKey,
      outcome,
      actualPickupAt,
      requestedPickupDate,
      pickupNotes: notes,
    }),
  }).then(async response => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "Could not update Zoho pickup outcome.");
    return body;
  });
}

async function patchLocalOrder(order, changes) {
  const data = await apiJSON("/workspace?role=driver");
  const store = data.store || { users: [], clients: [], orders: [], deliveries: [] };
  const idSet = new Set([order.id, order.zohoDealId ? `zoho_${order.zohoDealId}` : "", order.conNote].filter(Boolean));
  let found = false;
  const orders = (store.orders || []).map(item => {
    const itemKeys = [item.id, item.zohoDealId ? `zoho_${item.zohoDealId}` : "", item.conNote].filter(Boolean);
    if (itemKeys.some(key => idSet.has(key))) {
      found = true;
      return { ...item, ...changes };
    }
    return item;
  });
  if (!found) orders.push({ ...order, ...changes });
  await apiJSON("/snapshot", { method: "PUT", body: JSON.stringify({ store: { ...store, orders } }) });
}

function groupByVendor(orders) {
  return orders.reduce((groups, order) => {
    const key = order.vendor || "Unknown supplier";
    groups[key] = groups[key] || [];
    groups[key].push(order);
    return groups;
  }, {});
}

export default function DriverPickupOutcomeBridge() {
  const [active, setActive] = useState(false);
  const [orders, setOrders] = useState([]);
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");
  const todayKey = brisbaneDateKey();

  async function refreshOrders() {
    if (!isDriverScreen()) return;
    const pulled = await pullZohoOrders().catch(() => []);
    setOrders(pulled);
  }

  useEffect(() => {
    const tick = () => {
      const nextActive = Boolean(isDriverScreen());
      setActive(nextActive);
      if (nextActive) refreshOrders();
    };
    tick();
    const observer = new MutationObserver(tick);
    observer.observe(document.body, { childList: true, subtree: true });
    const interval = window.setInterval(tick, 30000);
    return () => {
      observer.disconnect();
      window.clearInterval(interval);
    };
  }, []);

  const futureOrders = useMemo(() => orders
    .filter(order => normaliseStatus(order.status) === "Order Placed")
    .filter(order => orderDateKey(order) > todayKey), [orders, todayKey]);
  const futureConNotes = useMemo(() => new Set(futureOrders.map(order => String(order.conNote || "").trim()).filter(Boolean)), [futureOrders]);
  const futureGroups = useMemo(() => groupByVendor(futureOrders), [futureOrders]);

  useEffect(() => {
    if (!active) return;

    function syncDom() {
      document.querySelectorAll(".dw-order.legacy-order").forEach(card => {
        const order = findOrderFromCard(card, orders);
        if (!order) return;
        const isFuture = futureConNotes.has(String(order.conNote || "").trim());
        card.style.display = isFuture ? "none" : "";

        const actions = card.querySelector(".dw-order-actions");
        if (actions && !actions.querySelector(".dw-abandon")) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "dw-no dw-abandon";
          button.textContent = "Abandoned";
          actions.appendChild(button);
        }
      });
    }

    syncDom();
    const observer = new MutationObserver(syncDom);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [active, orders, futureConNotes]);

  useEffect(() => {
    if (!active) return;

    function handleClick(event) {
      const button = event.target?.closest?.("button");
      if (!button) return;
      const text = textOf(button).toLowerCase();
      const card = button.closest?.(".dw-order.legacy-order");
      const order = findOrderFromCard(card, orders);
      if (!order) return;

      if (text === "confirm this pickup") {
        setTimeout(() => {
          updatePickupOutcome(order, { outcome: "Picked Up", stageKey: "PICKED_UP", notes: "Driver confirmed pickup in app." })
            .then(() => setMessage(`${order.conNote} pickup date and outcome saved to Zoho.`))
            .catch(error => setMessage(error.message));
        }, 250);
      }

      if (text === "no pickup") {
        setTimeout(() => {
          updatePickupOutcome(order, { outcome: "No Pickup", notes: "Driver marked no pickup in app." })
            .then(() => setMessage(`${order.conNote} marked No Pickup in Zoho.`))
            .catch(error => setMessage(error.message));
        }, 250);
      }

      if (text === "abandoned") {
        event.preventDefault();
        event.stopPropagation();
        const notes = window.prompt("Why is this pickup abandoned?", "Pickup no longer required.") || "Pickup abandoned by driver.";
        setBusyId(order.id);
        Promise.all([
          updatePickupOutcome(order, { outcome: "Abandoned", notes }),
          patchLocalOrder(order, { status: "Abandoned", pickupOutcome: "Abandoned", pickupNotes: notes, actualPickupAt: new Date().toISOString() }),
        ]).then(() => {
          setMessage(`${order.conNote} marked Abandoned.`);
          return refreshOrders();
        }).catch(error => setMessage(error.message)).finally(() => setBusyId(""));
      }
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [active, orders]);

  async function bringForward(order) {
    const notes = `Supplier had this future pickup ready early. Driver brought it into the ${displayDate(todayKey)} run.`;
    setBusyId(order.id);
    try {
      await updatePickupOutcome(order, {
        outcome: "Brought Forward",
        requestedPickupDate: `${todayKey}T09:00:00+10:00`,
        notes,
      });
      await patchLocalOrder(order, {
        preferredDate: todayKey,
        requestedPickupDate: `${todayKey}T09:00:00+10:00`,
        pickupOutcome: "Brought Forward",
        pickupNotes: notes,
        broughtForwardAt: new Date().toISOString(),
      });
      setMessage(`${order.conNote} brought into today's run.`);
      await refreshOrders();
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setMessage(error.message || "Could not bring pickup forward.");
    } finally {
      setBusyId("");
    }
  }

  if (!active) return null;

  return (
    <div className="dw-outcome-bridge">
      <style>{styles}</style>
      {message && <div className="dw-outcome-message" onClick={() => setMessage("")}>{message}</div>}
      {futureOrders.length > 0 && (
        <aside className="dw-future-panel">
          <div className="dw-future-title">Future pickups at supplier</div>
          <p>Use only when the supplier has tomorrow's/future goods ready and the driver is taking them now.</p>
          {Object.entries(futureGroups).map(([vendor, group]) => (
            <section key={vendor}>
              <h3>{vendor}</h3>
              {group.map(order => (
                <div className="dw-future-row" key={order.id}>
                  <div>
                    <strong>{order.conNote || "No con note"}</strong>
                    <span>{order.businessName || order.clientName || "Customer"}</span>
                    <em>Scheduled {displayDate(orderDateKey(order))}</em>
                  </div>
                  <button disabled={busyId === order.id} onClick={() => bringForward(order)}>
                    {busyId === order.id ? "Moving..." : "Bring into today"}
                  </button>
                </div>
              ))}
            </section>
          ))}
        </aside>
      )}
    </div>
  );
}

const styles = `
.dw-outcome-message{position:fixed;right:18px;bottom:18px;z-index:10020;max-width:360px;background:#e9e2d5;border:1px solid #cfc6b7;border-left:4px solid #d70b3c;color:#15110d;padding:12px 14px;box-shadow:0 4px 18px rgba(0,0,0,.18);font-family:Barlow,Arial,sans-serif;font-size:14px;cursor:pointer}.dw-future-panel{position:fixed;right:18px;top:82px;z-index:10010;width:min(380px,calc(100vw - 36px));max-height:calc(100vh - 110px);overflow:auto;background:#fff;border:1px solid #cfc6b7;border-top:4px solid #8b6914;box-shadow:0 8px 26px rgba(0,0,0,.16);padding:14px}.dw-future-title{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-weight:900;letter-spacing:1.4px;font-size:16px;color:#15110d}.dw-future-panel p{margin:4px 0 12px;color:#6d6257;font-size:13px}.dw-future-panel h3{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:15px;letter-spacing:1px;margin:12px 0 6px;color:#8b6914}.dw-future-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border-top:1px solid #e4ddd0;padding:10px 0}.dw-future-row strong{display:block;font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:18px;line-height:1}.dw-future-row span{display:block;font-size:13px;color:#15110d}.dw-future-row em{display:block;font-style:normal;font-size:12px;color:#6d6257}.dw-future-row button{border:0;background:#8b6914;color:#f3f3e8;padding:8px 10px;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.4px;cursor:pointer}.dw-future-row button:disabled{opacity:.55;cursor:wait}.dw-abandon{border-color:#d7b5b5!important;color:#8a293b!important}@media(max-width:760px){.dw-future-panel{position:static;width:auto;margin:12px 14px}.dw-outcome-message{left:14px;right:14px;bottom:14px;max-width:none}}
`;
