import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_MOTOCO_API_BASE_URL || "/api/live").replace(/\/$/, "");

const ITEM_TYPES = [
  { key: "tyres", label: "Tyres" },
  { key: "upTo5kg", label: "Up to 5kg packages" },
  { key: "fiveTo10kg", label: "5-10kg packages" },
  { key: "returns", label: "Returns to supplier" },
];

const VENDOR_DETAILS = {
  "Link International": "6/56 Boundary Rd, Rocklea QLD 4106",
  "A1 Accessories": "45 Proprietary St, Tingalpa QLD 4173",
  McLeods: "42 Hargraves St, Castlemaine VIC 3450",
  "Gas Imports": "12 Rushdale St, Knoxfield VIC 3180",
  Ficeda: "7 Stanton Rd, Seven Hills NSW 2147",
  "Whites Powersports": "1/22 Anzac Ave, Smeaton Grange NSW 2567",
};

function pathOf(url) {
  try {
    return new URL(String(url || ""), window.location.origin).pathname;
  } catch {
    return String(url || "");
  }
}

function normaliseStatus(status) {
  return status === "Pending" ? "Order Placed" : String(status || "Order Placed");
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item) || "Unassigned";
    groups[key] = groups[key] || [];
    groups[key].push(item);
    return groups;
  }, {});
}

function mergeOrders(localOrders = [], zohoOrders = []) {
  const byKey = new Map();
  [...localOrders, ...zohoOrders].forEach(order => {
    const key = String(order?.id || order?.zohoDealId || order?.conNote || "");
    if (!key) return;
    byKey.set(key, { ...(byKey.get(key) || {}), ...order });
  });
  return [...byKey.values()];
}

function orderStopKey(order) {
  return `${order.businessName || "Unknown account"}||${order.dropLocation || "No drop-off address"}`;
}

function defaultItems(order) {
  return {
    tyres: Number(order?.pickupItems?.tyres || order?.tyreQty || 0),
    upTo5kg: Number(order?.pickupItems?.upTo5kg || order?.partQtys?.p1 || 0),
    fiveTo10kg: Number(order?.pickupItems?.fiveTo10kg || order?.partQtys?.p2 || 0),
    returns: Number(order?.pickupItems?.returns || order?.returnsQty || 0),
  };
}

function hasAnyItems(items) {
  return Object.values(items || {}).some(value => Number(value || 0) > 0);
}

function itemSummary(items) {
  const parts = [];
  if (items.tyres) parts.push(`${items.tyres} tyre${items.tyres === 1 ? "" : "s"}`);
  if (items.upTo5kg) parts.push(`${items.upTo5kg} up to 5kg`);
  if (items.fiveTo10kg) parts.push(`${items.fiveTo10kg} 5-10kg`);
  if (items.returns) parts.push(`${items.returns} return${items.returns === 1 ? "" : "s"}`);
  return parts.join("; ") || "No items recorded";
}

function includesSearch(order, search) {
  const value = search.trim().toLowerCase();
  if (!value) return true;
  return [order.conNote, order.vendor, order.businessName, order.clientName, order.dropLocation]
    .filter(Boolean)
    .some(item => String(item).toLowerCase().includes(value));
}

function submittedLabel(order) {
  const value = order.submittedAt || order.preferredDate;
  if (!value) return "Submitted today";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Submitted today";
  return `Submitted ${date.toLocaleDateString("en-AU", { day: "2-digit", month: "short" })}, ${date.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit" })}`;
}

function pickupAddressFor(vendor, order) {
  return order.pickupAddress || VENDOR_DETAILS[vendor] || "Pickup address not set";
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

async function pushStage(order, stageKey) {
  if (!order?.zohoDealId) return;
  await apiJSON("/zoho/crm/deal/stage", {
    method: "PUT",
    body: JSON.stringify({ dealId: order.zohoDealId, stageKey, amount: order.price || 0 }),
  }).catch(console.error);
}

function detectDriverFromDom() {
  const role = document.querySelector(".rpill")?.textContent?.trim()?.toLowerCase();
  if (role !== "driver") return null;
  return {
    role: "driver",
    name: document.querySelector(".nav-nm strong")?.textContent?.trim() || "Driver",
  };
}

function NumberStepper({ value, onChange }) {
  const current = Number(value || 0);
  return (
    <div className="dw-stepper">
      <button type="button" disabled={current === 0} onClick={() => onChange(Math.max(0, current - 1))}>-</button>
      <span>{current}</span>
      <button type="button" onClick={() => onChange(current + 1)}>+</button>
    </div>
  );
}

function PickupItems({ value, onChange }) {
  return (
    <div className="dw-items">
      {ITEM_TYPES.map(item => (
        <div className="dw-item" key={item.key}>
          <div>{item.label}</div>
          <NumberStepper value={value[item.key] || 0} onChange={next => onChange({ ...value, [item.key]: next })} />
        </div>
      ))}
    </div>
  );
}

function useSignature(activeKey) {
  const canvasRef = useRef(null);
  const drawing = useRef(false);
  const hasSignature = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature.current = false;
  }, [activeKey]);

  const point = event => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const source = event.touches ? event.touches[0] : event;
    return [source.clientX - rect.left, source.clientY - rect.top];
  };

  const start = event => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawing.current = true;
    const [x, y] = point(event);
    const context = canvas.getContext("2d");
    context.beginPath();
    context.moveTo(x, y);
  };

  const move = event => {
    if (!drawing.current) return;
    event.preventDefault();
    const canvas = canvasRef.current;
    const [x, y] = point(event);
    const context = canvas.getContext("2d");
    context.lineTo(x, y);
    context.strokeStyle = "#d70b3c";
    context.lineWidth = 2.5;
    context.lineCap = "round";
    context.stroke();
    hasSignature.current = true;
  };

  const end = () => { drawing.current = false; };
  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    hasSignature.current = false;
  };

  return { canvasRef, hasSignature, start, move, end, clear };
}

export default function DriverWorkflowBridge() {
  const [driver, setDriver] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("motoco_driver_user") || "null"); } catch { return null; }
  });
  const [store, setStore] = useState(null);
  const [tab, setTab] = useState("milk-run");
  const [itemsByOrder, setItemsByOrder] = useState({});
  const [receiverByStop, setReceiverByStop] = useState({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const signature = useSignature(tab);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = String(init?.method || "GET").toUpperCase();
      const response = await originalFetch(input, init);
      if (method === "POST" && pathOf(url).includes("/verify-code") && response.ok) {
        const body = await response.clone().json().catch(() => ({}));
        if (body.user?.role === "driver") {
          sessionStorage.setItem("motoco_driver_user", JSON.stringify(body.user));
          setDriver(body.user);
        }
      }
      return response;
    };

    const observer = new MutationObserver(() => {
      const detected = detectDriverFromDom();
      if (detected) setDriver(previous => previous || detected);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const detected = detectDriverFromDom();
    if (detected) setDriver(previous => previous || detected);

    return () => {
      window.fetch = originalFetch;
      observer.disconnect();
    };
  }, []);

  async function refresh() {
    if (!driver) return;
    const email = driver.email ? `&email=${encodeURIComponent(driver.email)}` : "";
    const [data, zohoOrders] = await Promise.all([
      apiJSON(`/workspace?role=driver${email}`),
      pullZohoOrders().catch(() => []),
    ]);
    const baseStore = data.store || { orders: [], deliveries: [] };
    const mergedStore = { ...baseStore, orders: mergeOrders(baseStore.orders || [], zohoOrders) };
    setStore(mergedStore);
    const nextItems = {};
    for (const order of mergedStore.orders || []) nextItems[order.id] = defaultItems(order);
    setItemsByOrder(previous => ({ ...nextItems, ...previous }));
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [driver]);

  const orders = store?.orders || [];
  const pickupOrders = orders.filter(order => normaliseStatus(order.status) === "Order Placed");
  const deliveryOrders = orders.filter(order => ["Picked Up", "In Transit"].includes(normaliseStatus(order.status)));
  const vendors = useMemo(() => [...new Set(pickupOrders.map(order => order.vendor || "Unknown vendor"))].sort(), [pickupOrders]);
  const visiblePickupOrders = pickupOrders.filter(order => includesSearch(order, search) && (!vendorFilter || order.vendor === vendorFilter));
  const pickupGroups = useMemo(() => groupBy(visiblePickupOrders, order => order.vendor || "Unknown vendor"), [visiblePickupOrders]);
  const deliveryGroups = useMemo(() => groupBy(deliveryOrders, orderStopKey), [deliveryOrders]);
  const today = new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

  async function saveStore(nextStore) {
    setStore(nextStore);
    await apiJSON("/snapshot", { method: "PUT", body: JSON.stringify({ store: nextStore }) });
  }

  async function confirmPickup(vendor, groupOrders) {
    if (groupOrders.some(order => !hasAnyItems(itemsByOrder[order.id] || {}))) {
      setMessage("Add at least one item quantity for each pickup before checking off the stop.");
      return;
    }
    setSaving(true);
    const nextOrders = orders.map(order => {
      if (!groupOrders.some(item => item.id === order.id)) return order;
      const pickupItems = itemsByOrder[order.id] || {};
      return { ...order, status: "Picked Up", pickupItems, pickupSummary: itemSummary(pickupItems), driverName: driver?.name || "Driver" };
    });
    await saveStore({ ...store, orders: nextOrders });
    await Promise.all(groupOrders.map(order => pushStage(order, "PICKED_UP")));
    setSaving(false);
    setMessage(`${vendor} checked off. Items are now ready for delivery.`);
    await refresh();
  }

  async function markInTransit(stopOrders) {
    setSaving(true);
    const nextOrders = orders.map(order => stopOrders.some(item => item.id === order.id) ? { ...order, status: "In Transit" } : order);
    await saveStore({ ...store, orders: nextOrders });
    await Promise.all(stopOrders.map(order => pushStage(order, "IN_TRANSIT")));
    setSaving(false);
    await refresh();
  }

  async function completeDelivery(stopKey, stopOrders) {
    const receiver = receiverByStop[stopKey] || {};
    if (!receiver.name?.trim()) {
      setMessage("Add the receiver name before completing the delivery stop.");
      return;
    }
    if (!signature.hasSignature.current) {
      setMessage("Capture one signature for the delivery stop.");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const signatureData = signature.canvasRef.current?.toDataURL() || "";
    const deliveries = stopOrders.map(order => ({
      id: `d_${order.id}_${Date.now()}`,
      orderId: order.id,
      conNote: order.conNote,
      businessName: order.businessName,
      vendor: order.vendor,
      dropLocation: order.dropLocation,
      receiverName: receiver.name,
      receiverPhone: receiver.phone || "",
      driverName: driver?.name || "Driver",
      signatureData,
      itemsDesc: order.pickupSummary || itemSummary(order.pickupItems || itemsByOrder[order.id] || {}),
      pickupItems: order.pickupItems || itemsByOrder[order.id] || {},
      totalPrice: order.price || 0,
      zohoDealId: order.zohoDealId,
      completedAt: now,
    }));
    const nextOrders = orders.map(order => stopOrders.some(item => item.id === order.id) ? { ...order, status: "Delivered" } : order);
    await saveStore({ ...store, deliveries: [...(store.deliveries || []), ...deliveries], orders: nextOrders });
    await Promise.all(stopOrders.map(order => pushStage(order, "DELIVERED")));
    signature.clear();
    setSaving(false);
    setMessage("Delivery stop completed with one signature.");
    await refresh();
  }

  if (!driver) return null;

  return (
    <div className="dw-shell">
      <style>{styles}</style>
      <header className="dw-topbar">
        <div className="dw-brand">
          <span>Moto & Co</span>
          <strong>Couriers</strong>
          <em>Not just couriers. Parts people.</em>
        </div>
        <nav className="dw-nav">
          <button className={tab === "milk-run" ? "active" : ""} onClick={() => setTab("milk-run")}>Today's Run</button>
          <button className={tab === "delivery" ? "active" : ""} onClick={() => setTab("delivery")}>Sign-Off</button>
          <button onClick={refresh}>Refresh</button>
        </nav>
        <div className="dw-user">
          <strong>{driver.name || "Driver"}</strong>
          <span>Driver</span>
          <button onClick={() => { sessionStorage.removeItem("motoco_driver_user"); window.location.reload(); }}>Logout</button>
        </div>
      </header>

      <main className="dw-page">
        <section className="dw-titlebar">
          <div>
            <h1>{tab === "milk-run" ? <><span>Today's</span> Run</> : <><span>Delivery</span> Sign-Off</>}</h1>
            <p>{today} - {driver.name || "Driver"} - Brisbane to Gold Coast</p>
          </div>
          <div className="dw-stats">
            <div><strong>{pickupOrders.length}</strong><span>Pickup</span></div>
            <div><strong>{deliveryOrders.length}</strong><span>En Route</span></div>
          </div>
        </section>

        {message && <div className="dw-alert" onClick={() => setMessage("")}>{message}</div>}
        {!store && <div className="dw-empty">Loading driver run...</div>}

        {store && tab === "milk-run" && (
          <>
            {pickupOrders.length > 0 && <div className="dw-alert soft">{pickupOrders.length} pickup order{pickupOrders.length === 1 ? "" : "s"} ready for today's run.</div>}
            <div className="dw-filters">
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search client, con note or workshop..." />
              <select value={vendorFilter} onChange={event => setVendorFilter(event.target.value)}>
                <option value="">All Vendors</option>
                {vendors.map(vendor => <option key={vendor} value={vendor}>{vendor}</option>)}
              </select>
              {(search || vendorFilter) && <button onClick={() => { setSearch(""); setVendorFilter(""); }}>Clear</button>}
            </div>

            {Object.keys(pickupGroups).length === 0 && <div className="dw-empty">No pickup stops waiting right now.</div>}
            {Object.entries(pickupGroups).map(([vendor, groupOrders]) => {
              const firstOrder = groupOrders[0] || {};
              return (
                <section className="dw-vendor" key={vendor}>
                  <h2>{vendor} Pickups ({groupOrders.length})</h2>
                  <div className="dw-stop legacy pending">
                    <div className="dw-stop-head legacy-head">
                      <div>
                        <h3>{vendor}</h3>
                        <p><strong>Pickup:</strong> {pickupAddressFor(vendor, firstOrder)}</p>
                      </div>
                      <span>Pending</span>
                    </div>

                    {groupOrders.map(order => (
                      <article className="dw-order legacy-order" key={order.id}>
                        <div className="dw-order-top"><strong>{order.conNote}</strong><span>{submittedLabel(order)}</span></div>
                        <small>{vendor}</small>
                        <div className="dw-deliver-box">
                          <b>Deliver to - Gold Coast</b>
                          <strong>{order.businessName}</strong>
                          <span>{order.dropLocation || "No address - update customer profile"}</span>
                          {order.clientPhone && <span>{order.clientPhone}</span>}
                        </div>
                        {order.notes && <p className="dw-note">{order.notes}</p>}
                        <PickupItems value={itemsByOrder[order.id] || defaultItems(order)} onChange={next => setItemsByOrder(previous => ({ ...previous, [order.id]: next }))} />
                      </article>
                    ))}

                    <button className="dw-primary" disabled={saving} onClick={() => confirmPickup(vendor, groupOrders)}>Confirm pickup</button>
                  </div>
                </section>
              );
            })}
          </>
        )}

        {store && tab === "delivery" && (
          <>
            {Object.keys(deliveryGroups).length === 0 && <div className="dw-empty">No delivery stops ready yet.</div>}
            {Object.entries(deliveryGroups).map(([stopKey, stopOrders], index) => {
              const [businessName, address] = stopKey.split("||");
              const allInTransit = stopOrders.every(order => normaliseStatus(order.status) === "In Transit");
              const receiver = receiverByStop[stopKey] || {};
              const totalItems = stopOrders.map(order => order.pickupSummary || itemSummary(order.pickupItems || itemsByOrder[order.id] || {})).join("; ");
              return (
                <section className="dw-sign-card" key={stopKey}>
                  <h2>Step {index + 1} - Delivery Stop</h2>
                  <div className="dw-stop legacy enroute">
                    <div className="dw-stop-head legacy-head">
                      <div><h3>{businessName}</h3><p>{address}</p></div>
                      <span>{allInTransit ? "En Route" : "Picked Up"}</span>
                    </div>
                    {stopOrders.map(order => (
                      <div className="dw-delivery-line" key={order.id}>
                        <strong>{order.conNote}</strong><span>{order.vendor}</span><em>{order.pickupSummary || itemSummary(order.pickupItems || itemsByOrder[order.id] || {})}</em>
                      </div>
                    ))}
                    {!allInTransit ? (
                      <button className="dw-green" disabled={saving} onClick={() => markInTransit(stopOrders)}>Start delivery to this stop</button>
                    ) : (
                      <div className="dw-signoff">
                        <div className="dw-summary">
                          <div><label>Client</label><strong>{businessName}</strong></div>
                          <div><label>Deliver to</label><strong>{address}</strong></div>
                          <div><label>Packages</label><strong>{totalItems}</strong></div>
                        </div>
                        <div className="dw-form-row">
                          <div><label>Receiver name *</label><input value={receiver.name || ""} placeholder="Full name" onChange={event => setReceiverByStop(previous => ({ ...previous, [stopKey]: { ...receiver, name: event.target.value } }))} /></div>
                          <div><label>Receiver phone</label><input value={receiver.phone || ""} placeholder="+61 4xx xxx xxx" onChange={event => setReceiverByStop(previous => ({ ...previous, [stopKey]: { ...receiver, phone: event.target.value } }))} /></div>
                        </div>
                        <label>Receiver signature *</label>
                        <div className="dw-signature" onMouseDown={signature.start} onMouseMove={signature.move} onMouseUp={signature.end} onMouseLeave={signature.end} onTouchStart={signature.start} onTouchMove={signature.move} onTouchEnd={signature.end}>
                          <canvas ref={signature.canvasRef} />
                          <span>Sign here with mouse or finger</span>
                        </div>
                        <div className="dw-actions">
                          <button className="dw-secondary" type="button" onClick={signature.clear}>Clear</button>
                          <button className="dw-green" disabled={saving} onClick={() => completeDelivery(stopKey, stopOrders)}>Complete delivery and sign off</button>
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              );
            })}
          </>
        )}
      </main>
    </div>
  );
}

const styles = `
.dw-shell{position:fixed;inset:0;z-index:9999;background:#f3f3e8;color:#15110d;font-family:Barlow,Arial,sans-serif;overflow:auto}.dw-shell *{box-sizing:border-box}.dw-topbar{height:58px;background:#d70b3c;color:#f3f3e8;display:grid;grid-template-columns:220px 1fr 260px;align-items:center;gap:1rem;padding:0 22px;box-shadow:0 4px 18px rgba(0,0,0,.22);position:sticky;top:0;z-index:5}.dw-brand span,.dw-brand em,.dw-user span,.dw-titlebar p,.dw-stop-head p,.dw-order span,.dw-order small,.dw-summary label,.dw-signoff label{font-family:'Barlow Condensed',Arial,sans-serif}.dw-brand span{display:block;text-transform:uppercase;font-size:10px;letter-spacing:3px;line-height:1}.dw-brand strong{display:block;font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:25px;line-height:.85;letter-spacing:1px}.dw-brand em{display:block;text-transform:uppercase;font-style:normal;font-size:10px;letter-spacing:2px;opacity:.65}.dw-nav{display:flex;justify-content:center;height:100%;align-items:center;gap:4px}.dw-nav button{height:38px;border:0;background:transparent;color:#f3f3e8;padding:0 15px;font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:14px;font-weight:900;letter-spacing:.6px;cursor:pointer}.dw-nav button.active{background:rgba(255,255,255,.16);box-shadow:inset 0 -3px 0 #f3f3e8}.dw-user{justify-self:end;display:flex;align-items:center;gap:12px;text-transform:uppercase}.dw-user strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:13px;line-height:1}.dw-user span{font-size:11px;opacity:.75}.dw-user button{border:1px solid rgba(243,243,232,.45);background:transparent;color:#f3f3e8;height:32px;padding:0 12px;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;text-transform:uppercase;cursor:pointer}.dw-page{max-width:1180px;margin:0 auto;padding:32px 22px 60px}.dw-titlebar{display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #cfc6b7;padding:0 0 18px;margin-bottom:18px}.dw-titlebar h1{font-family:'Barlow Condensed',Arial,sans-serif;font-size:39px;line-height:1;text-transform:uppercase;margin:0;letter-spacing:.5px}.dw-titlebar h1 span{color:#15110d}.dw-titlebar h1:not(:has(span)){color:#15110d}.dw-titlebar h1 span+text,.dw-titlebar h1{color:#d70b3c}.dw-titlebar p{margin:3px 0 0;color:#6e6459;font-size:15px}.dw-stats{display:flex;gap:10px}.dw-stats div{width:72px;height:62px;background:#fff;border:1px solid #cfc6b7;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.06)}.dw-stats strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:24px;color:#d70b3c;line-height:1}.dw-stats span{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:12px;font-weight:900;color:#7a6f61}.dw-alert{background:#f7e1e4;border:1px solid #e8a4b2;color:#d70b3c;padding:12px 16px;margin:14px 0;font-size:14px}.dw-alert.soft{background:#f5dddd}.dw-empty{background:#fff;border:1px solid #cfc6b7;margin:18px 0;padding:36px;text-align:center;color:#7a6f61;font-style:italic}.dw-filters{display:grid;grid-template-columns:1fr 180px 74px;gap:12px;margin:14px 0 20px}.dw-filters input,.dw-filters select{height:38px;border:1px solid #cfc6b7;background:#fff;padding:0 13px;font-size:15px}.dw-filters input:focus,.dw-filters select:focus,.dw-signoff input:focus{outline:1px solid #d70b3c;border-color:#d70b3c}.dw-filters button{border:1px solid #cfc6b7;background:#e9e2d5;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;text-transform:uppercase;cursor:pointer}.dw-vendor h2,.dw-sign-card h2{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;letter-spacing:3px;font-size:14px;color:#d70b3c;margin:18px 0 10px}.dw-stop.legacy{background:#fff;border:1px solid #cfc6b7;border-left:5px solid #d70b3c;padding:20px 22px;margin-bottom:12px;box-shadow:0 2px 6px rgba(0,0,0,.05)}.dw-stop.legacy.enroute{border-left-color:#19733a}.legacy-head{display:flex;justify-content:space-between;gap:1rem;margin-bottom:12px}.legacy-head h3{font-family:'Barlow Condensed',Arial,sans-serif;font-size:26px;text-transform:uppercase;margin:0;line-height:1;letter-spacing:.6px}.legacy-head p{margin:6px 0 0;color:#6d6257;font-size:15px}.legacy-head span{height:24px;border:1px solid #f0a0ae;background:#fff4f6;color:#d70b3c;padding:4px 9px;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;font-size:12px;text-transform:uppercase;letter-spacing:.8px}.enroute .legacy-head span{border-color:#9fc7aa;background:#f2fbf3;color:#19733a}.legacy-order{border-top:1px solid #e4ddd0;padding-top:14px;margin-top:14px}.dw-order-top{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}.dw-order-top strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:22px;text-transform:uppercase;line-height:1}.dw-order-top span{font-size:14px;color:#7a6f61}.legacy-order small{display:block;text-transform:uppercase;letter-spacing:1px;color:#7a6f61;font-size:12px;margin:2px 0 8px}.dw-deliver-box{background:#e9e2d5;border:1px solid #cfc6b7;border-left:4px solid #d70b3c;padding:11px 14px;margin:10px 0 12px;display:flex;flex-direction:column;gap:2px}.dw-deliver-box b{font-family:'Barlow Condensed',Arial,sans-serif;color:#d70b3c;text-transform:uppercase;letter-spacing:2px;font-size:12px}.dw-deliver-box strong{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:20px}.dw-deliver-box span{font-size:14px}.dw-note{font-size:14px;margin:0 0 10px;color:#6d6257}.dw-items{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0}.dw-item{background:#f3f0e8;border:1px solid #cfc6b7;padding:10px;display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:13px}.dw-stepper{display:flex;align-items:center;gap:8px}.dw-stepper button{width:28px;height:28px;border:1px solid #cfc6b7;background:#fff;color:#d70b3c;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;font-size:17px;cursor:pointer}.dw-stepper button:disabled{opacity:.35}.dw-stepper span{min-width:20px;text-align:center;font-family:'Barlow Condensed',Arial,sans-serif;font-size:20px;font-weight:900}.dw-primary,.dw-green,.dw-secondary{border:0;padding:10px 18px;font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:15px;font-weight:900;letter-spacing:.5px;cursor:pointer}.dw-primary{background:#d70b3c;color:#f3f3e8}.dw-green{background:#19733a;color:#f3f3e8}.dw-secondary{background:#e9e2d5;color:#5b5146;border:1px solid #cfc6b7}.dw-primary:disabled,.dw-green:disabled{opacity:.5;cursor:not-allowed}.dw-sign-card{background:#fff;border:1px solid #cfc6b7;margin-bottom:18px;padding:20px}.dw-delivery-line{display:grid;grid-template-columns:160px 1fr 1.5fr;gap:14px;border-top:1px solid #e4ddd0;padding:12px 0;font-size:14px;align-items:center}.dw-delivery-line strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:18px;text-transform:uppercase}.dw-delivery-line span{color:#7a6f61}.dw-delivery-line em{font-style:normal}.dw-signoff{background:#e9e2d5;border:1px solid #cfc6b7;margin-top:14px;padding:16px}.dw-summary{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;border-bottom:1px solid #cfc6b7;padding-bottom:12px;margin-bottom:12px}.dw-summary label,.dw-signoff label{display:block;text-transform:uppercase;letter-spacing:1px;font-size:12px;color:#7a6f61;font-weight:900;margin-bottom:4px}.dw-summary strong{font-family:'Barlow Condensed',Arial,sans-serif;text-transform:uppercase;font-size:18px}.dw-form-row{display:grid;grid-template-columns:1fr 1fr;gap:14px}.dw-signoff input{width:100%;height:44px;border:1px solid #cfc6b7;background:#fff;padding:0 14px;font-size:15px}.dw-signature{height:132px;border:2px dashed #c5bfb3;background:#fff;position:relative;overflow:hidden;touch-action:none;margin-top:6px}.dw-signature canvas{position:absolute;inset:0;width:100%;height:100%}.dw-signature span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9a8e80;font-size:14px;pointer-events:none;font-style:italic}.dw-actions{display:flex;gap:10px;margin-top:12px}.dw-actions .dw-green{flex:1}@media(max-width:760px){.dw-topbar{height:auto;grid-template-columns:1fr;padding:12px 16px}.dw-nav{justify-content:flex-start;overflow:auto}.dw-user{justify-self:start}.dw-page{padding:22px 14px 44px}.dw-titlebar{align-items:flex-start;gap:14px}.dw-titlebar h1{font-size:32px}.dw-stats div{width:58px;height:54px}.dw-filters{grid-template-columns:1fr}.dw-items{grid-template-columns:1fr}.dw-delivery-line,.dw-summary,.dw-form-row{grid-template-columns:1fr}.dw-stop.legacy{padding:16px}.legacy-head{flex-direction:column}.dw-actions{flex-direction:column}}
`;
