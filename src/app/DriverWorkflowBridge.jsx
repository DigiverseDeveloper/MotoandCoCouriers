import { useEffect, useMemo, useRef, useState } from "react";

const API_BASE = (import.meta.env.VITE_MOTOCO_API_BASE_URL || "/api/live").replace(/\/$/, "");

const VENDOR_DETAILS = {
  "Link International": { address: "6/56 Boundary Rd, Rocklea QLD 4106", phone: "+61 7 3373 1000" },
  "A1 Accessories": { address: "45 Proprietary St, Tingalpa QLD 4173", phone: "+61 7 3390 3999" },
  McLeods: { address: "42 Hargraves St, Castlemaine VIC 3450", phone: "+61 3 5472 1000" },
  "Gas Imports": { address: "12 Rushdale St, Knoxfield VIC 3180", phone: "+61 3 9765 9900" },
  Ficeda: { address: "7 Stanton Rd, Seven Hills NSW 2147", phone: "+61 2 8822 0222" },
  "Whites Powersports": { address: "1/22 Anzac Ave, Smeaton Grange NSW 2567", phone: "+61 2 4648 2300" },
};

const ITEM_TYPES = [
  { key: "tyres", label: "Tyres" },
  { key: "upTo5kg", label: "Up to 5kg packages" },
  { key: "fiveTo10kg", label: "5-10kg packages" },
  { key: "returns", label: "Returns to supplier" },
];

function pathOf(url) {
  try { return new URL(String(url || ""), window.location.origin).pathname; } catch { return String(url || ""); }
}

function normaliseStatus(status) {
  return status === "Pending" ? "Order Placed" : String(status || "Order Placed");
}

function groupBy(items, getKey) {
  return items.reduce((groups, item) => {
    const key = getKey(item) || "Unassigned";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
    return groups;
  }, {});
}

function todayLabel() {
  return new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
}

function orderStopKey(order) {
  return `${order.businessName || "Unknown account"}||${order.dropLocation || "No drop-off address"}`;
}

async function apiJSON(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.message || "Server request failed.");
  return body;
}

async function pullZohoOrders() {
  const response = await fetch("/.netlify/functions/deals-workspace");
  if (!response.ok) return [];
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body.orders) ? body.orders : [];
}

function orderMergeKey(order) {
  return String(order?.id || order?.zohoDealId || order?.conNote || "");
}

function mergeOrders(baseOrders = [], zohoOrders = []) {
  const byKey = new Map();
  for (const order of baseOrders) byKey.set(orderMergeKey(order), order);
  for (const order of zohoOrders) {
    const key = orderMergeKey(order);
    byKey.set(key, { ...(byKey.get(key) || {}), ...order });
  }
  return [...byKey.values()].filter(order => orderMergeKey(order));
}

function defaultItems(order) {
  return {
    tyres: Number(order?.pickupItems?.tyres || order?.tyreQty || 0),
    upTo5kg: Number(order?.pickupItems?.upTo5kg || order?.partQtys?.p1 || 0),
    fiveTo10kg: Number(order?.pickupItems?.fiveTo10kg || order?.partQtys?.p2 || 0),
    returns: Number(order?.pickupItems?.returns || order?.returnsQty || 0),
  };
}

function itemSummary(items) {
  const parts = [];
  if (items.tyres) parts.push(`${items.tyres} tyre${items.tyres === 1 ? "" : "s"}`);
  if (items.upTo5kg) parts.push(`${items.upTo5kg} up to 5kg`);
  if (items.fiveTo10kg) parts.push(`${items.fiveTo10kg} 5-10kg`);
  if (items.returns) parts.push(`${items.returns} return${items.returns === 1 ? "" : "s"}`);
  return parts.join("; ") || "No items recorded";
}

function hasAnyItems(items) {
  return Object.values(items || {}).some(value => Number(value || 0) > 0);
}

function detectDriverFromDom() {
  const role = document.querySelector(".rpill")?.textContent?.trim()?.toLowerCase();
  if (role !== "driver") return null;
  const name = document.querySelector(".nav-nm strong")?.textContent?.trim() || "Driver";
  return { role: "driver", name };
}

function stageKeyFor(status) {
  return {
    "Picked Up": "PICKED_UP",
    "In Transit": "IN_TRANSIT",
    Delivered: "DELIVERED",
  }[status];
}

async function pushStage(order, status) {
  const dealId = order?.zohoDealId;
  const stageKey = stageKeyFor(status);
  if (!dealId || !stageKey) return;
  await apiJSON("/zoho/crm/deal/stage", {
    method: "PUT",
    body: JSON.stringify({ dealId, stageKey, amount: order.price || 0 }),
  }).catch(console.error);
}

function NumberStepper({ value, onChange }) {
  const current = Number(value || 0);
  return (
    <div className="dw-stepper">
      <button type="button" onClick={() => onChange(Math.max(0, current - 1))} disabled={current === 0}>-</button>
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
}\n
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
    context.strokeStyle = "#e11d48";
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
  const signature = useSignature(tab);

  useEffect(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = typeof input === "string" ? input : input?.url;
      const method = String(init?.method || "GET").toUpperCase();
      const response = await originalFetch(input, init);
      if (method === "POST" && pathOf(url).includes("/verify-code") && response.ok) {
        const clone = response.clone();
        const body = await clone.json().catch(() => ({}));
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
      pullZohoOrders().catch(error => {
        console.error(error);
        return [];
      }),
    ]);
    const baseStore = data.store || { orders: [], deliveries: [] };
    const mergedStore = {
      ...baseStore,
      orders: mergeOrders(baseStore.orders || [], zohoOrders),
    };
    setStore(mergedStore);
    const nextItems = {};
    for (const order of mergedStore.orders || []) nextItems[order.id] = defaultItems(order);
    setItemsByOrder(previous => ({ ...nextItems, ...previous }));
  }

  useEffect(() => { refresh().catch(console.error); }, [driver]);

  const orders = store?.orders || [];
  const pickupOrders = orders.filter(order => normaliseStatus(order.status) === "Order Placed");
  const deliveryOrders = orders.filter(order => ["Picked Up", "In Transit"].includes(normaliseStatus(order.status)));
  const pickupGroups = useMemo(() => groupBy(pickupOrders, order => order.vendor || "Unknown vendor"), [pickupOrders]);
  const deliveryGroups = useMemo(() => groupBy(deliveryOrders, orderStopKey), [deliveryOrders]);

  async function saveStore(nextStore) {
    setStore(nextStore);
    await apiJSON("/snapshot", { method: "PUT", body: JSON.stringify({ store: nextStore }) });
  }

  async function confirmPickup(vendor, groupOrders) {
    const missing = groupOrders.filter(order => !hasAnyItems(itemsByOrder[order.id] || {}));
    if (missing.length) {
      setMessage("Add at least one item quantity for each pickup before checking off the stop.");
      return;
    }
    setSaving(true);
    const now = new Date().toISOString();
    const nextStore = {
      ...store,
      orders: orders.map(order => {
        if (!groupOrders.some(item => item.id === order.id)) return order;
        return {
          ...order,
          status: "Picked Up",
          pickupItems: itemsByOrder[order.id] || {},
          pickupSummary: itemSummary(itemsByOrder[order.id] || {}),
          pickedUpAt: now,
          driverName: driver?.name || "Driver",
        };
      }),
    };
    await saveStore(nextStore);
    await Promise.all(groupOrders.map(order => pushStage(order, "Picked Up")));
    setSaving(false);
    setMessage(`${vendor} checked off. Items are now ready for delivery.`);
    await refresh();
  }

  async function markInTransit(stopOrders) {
    setSaving(true);
    const nextStore = {
      ...store,
      orders: orders.map(order => stopOrders.some(item => item.id === order.id) ? { ...order, status: "In Transit" } : order),
    };
    await saveStore(nextStore);
    await Promise.all(stopOrders.map(order => pushStage(order, "In Transit")));
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
      clientName: order.clientName,
      businessName: order.businessName,
      clientEmail: order.clientEmail,
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

    const nextStore = {
      ...store,
      deliveries: [...(store.deliveries || []), ...deliveries],
      orders: orders.map(order => stopOrders.some(item => item.id === order.id) ? { ...order, status: "Delivered" } : order),
    };
    await saveStore(nextStore);
    await Promise.all(stopOrders.map(order => pushStage(order, "Delivered")));
    signature.clear();
    setSaving(false);
    setMessage("Delivery stop completed with one signature.");
    await refresh();
  }

  if (!driver) return null;

  return (
    <div className="dw-shell">
      <style>{styles}</style>
      <header className="dw-header">
        <div>
          <div className="dw-kicker">Moto & Co Couriers</div>
          <h1>{tab === "milk-run" ? "Milk Run" : "Delivery Stops"}</h1>
          <p>{todayLabel()} - {driver.name || "Driver"}</p>
        </div>
        <button className="dw-logout" onClick={() => { sessionStorage.removeItem("motoco_driver_user"); window.location.reload(); }}>Log out</button>
      </header>

      <nav className="dw-tabs">
        <button className={tab === "milk-run" ? "active" : ""} onClick={() => setTab("milk-run")}>Milk Run</button>
        <button className={tab === "delivery" ? "active" : ""} onClick={() => setTab("delivery")}>Delivery</button>
        <button onClick={refresh}>Refresh</button>
      </nav>

      {message && <div className="dw-message" onClick={() => setMessage("")}>{message}</div>}

      {!store && <div className="dw-empty">Loading driver run...</div>}

      {store && tab === "milk-run" && (
        <main className="dw-main">
          {Object.keys(pickupGroups).length === 0 && <div className="dw-empty">No pickup stops waiting right now.</div>}
          {Object.entries(pickupGroups).map(([vendor, groupOrders]) => {
            const vendorDetails = VENDOR_DETAILS[vendor] || {};
            return (
              <section className="dw-stop" key={vendor}>
                <div className="dw-stop-head">
                  <div>
                    <h2>{vendor}</h2>
                    <p>{vendorDetails.address || "Pickup address not set"}</p>
                    {vendorDetails.phone && <p>{vendorDetails.phone}</p>}
                  </div>
                  <span>{groupOrders.length} pickup{groupOrders.length === 1 ? "" : "s"}</span>
                </div>

                {groupOrders.map(order => (
                  <div className="dw-order" key={order.id}>
                    <div className="dw-order-top">
                      <strong>{order.conNote}</strong>
                      <span>{order.businessName}</span>
                    </div>
                    <p>{order.dropLocation || "No drop-off address"}</p>
                    {order.notes && <p className="dw-note">{order.notes}</p>}
                    <PickupItems
                      value={itemsByOrder[order.id] || defaultItems(order)}
                      onChange={next => setItemsByOrder(previous => ({ ...previous, [order.id]: next }))}
                    />
                  </div>
                ))}

                <button className="dw-primary" disabled={saving} onClick={() => confirmPickup(vendor, groupOrders)}>
                  Check off this pickup stop
                </button>
              </section>
            );
          })}
        </main>
      )}

      {store && tab === "delivery" && (
        <main className="dw-main">
          {Object.keys(deliveryGroups).length === 0 && <div className="dw-empty">No delivery stops ready yet.</div>}
          {Object.entries(deliveryGroups).map(([stopKey, stopOrders]) => {
            const [businessName, address] = stopKey.split("||");
            const allInTransit = stopOrders.every(order => normaliseStatus(order.status) === "In Transit");
            const receiver = receiverByStop[stopKey] || {};
            return (
              <section className="dw-stop" key={stopKey}>
                <div className="dw-stop-head">
                  <div>
                    <h2>{businessName}</h2>
                    <p>{address}</p>
                  </div>
                  <span>{stopOrders.length} package{stopOrders.length === 1 ? "" : "s"}</span>
                </div>

                {stopOrders.map(order => (
                  <div className="dw-delivery-line" key={order.id}>
                    <strong>{order.conNote}</strong>
                    <span>{order.vendor}</span>
                    <em>{order.pickupSummary || itemSummary(order.pickupItems || itemsByOrder[order.id] || {})}</em>
                  </div>
                ))}

                {!allInTransit ? (
                  <button className="dw-primary" disabled={saving} onClick={() => markInTransit(stopOrders)}>Start delivery to this stop</button>
                ) : (
                  <div className="dw-signoff">
                    <label>Receiver name</label>
                    <input value={receiver.name || ""} onChange={event => setReceiverByStop(previous => ({ ...previous, [stopKey]: { ...receiver, name: event.target.value } }))} />
                    <label>Receiver phone</label>
                    <input value={receiver.phone || ""} onChange={event => setReceiverByStop(previous => ({ ...previous, [stopKey]: { ...receiver, phone: event.target.value } }))} />
                    <label>Signature for this delivery stop</label>
                    <div className="dw-signature" onMouseDown={signature.start} onMouseMove={signature.move} onMouseUp={signature.end} onMouseLeave={signature.end} onTouchStart={signature.start} onTouchMove={signature.move} onTouchEnd={signature.end}>
                      <canvas ref={signature.canvasRef} />
                      <span>Sign here once for this delivery</span>
                    </div>
                    <div className="dw-actions">
                      <button className="dw-secondary" type="button" onClick={signature.clear}>Clear signature</button>
                      <button className="dw-primary" disabled={saving} onClick={() => completeDelivery(stopKey, stopOrders)}>Complete delivery stop</button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}
        </main>
      )}
    </div>
  );
}

const styles = `
.dw-shell{position:fixed;inset:0;z-index:9999;background:#f3f3e8;color:#1A1510;font-family:Barlow,Arial,sans-serif;overflow:auto}
.dw-header{background:#e11d48;color:#f3f3e8;display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;padding:1rem 1.25rem;box-shadow:0 3px 16px rgba(0,0,0,.2)}
.dw-kicker{font-family:'Barlow Condensed',Arial,sans-serif;font-size:.75rem;font-weight:700;letter-spacing:2px;text-transform:uppercase;opacity:.75}
.dw-header h1{font-family:'Barlow Condensed',Arial,sans-serif;font-size:2.2rem;line-height:1;margin:0;text-transform:uppercase;letter-spacing:1px}
.dw-header p{font-size:.8rem;margin:.2rem 0 0;opacity:.8}
.dw-logout{border:1px solid rgba(243,243,232,.5);background:transparent;color:#f3f3e8;border-radius:2px;padding:.45rem .8rem;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:700;text-transform:uppercase;letter-spacing:1px;cursor:pointer}
.dw-tabs{position:sticky;top:0;z-index:2;background:#fff;border-bottom:1px solid #d5cfc3;display:flex;gap:.35rem;padding:.55rem 1.25rem}
.dw-tabs button{border:1px solid #d5cfc3;background:#ececdf;color:#1A1510;border-radius:2px;padding:.5rem .85rem;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:800;text-transform:uppercase;letter-spacing:1px;cursor:pointer}
.dw-tabs button.active{background:#e11d48;border-color:#e11d48;color:#f3f3e8}
.dw-main{max-width:980px;margin:0 auto;padding:1rem}
.dw-message{max-width:980px;margin:.8rem auto 0;background:#fff;border:1px solid rgba(225,29,72,.25);border-left:4px solid #e11d48;border-radius:2px;padding:.75rem 1rem;font-size:.85rem;cursor:pointer}
.dw-empty{background:#fff;border:1px solid #d5cfc3;border-radius:2px;margin:1rem auto;padding:2rem;max-width:980px;text-align:center;color:#7A6E60;font-style:italic}
.dw-stop{background:#fff;border:1px solid #d5cfc3;border-left:4px solid #e11d48;border-radius:2px;margin-bottom:1rem;padding:1rem;box-shadow:0 1px 4px rgba(0,0,0,.05)}
.dw-stop-head{display:flex;justify-content:space-between;gap:1rem;border-bottom:1px solid #ececdf;padding-bottom:.8rem;margin-bottom:.8rem}
.dw-stop-head h2{font-family:'Barlow Condensed',Arial,sans-serif;font-size:1.45rem;line-height:1;text-transform:uppercase;margin:0;color:#e11d48;letter-spacing:.5px}
.dw-stop-head p{font-size:.8rem;color:#7A6E60;margin:.25rem 0 0}
.dw-stop-head span{align-self:flex-start;background:#ececdf;border:1px solid #d5cfc3;border-radius:2px;padding:.25rem .55rem;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:800;text-transform:uppercase;font-size:.75rem;white-space:nowrap}
.dw-order{border:1px solid #ececdf;border-radius:2px;padding:.85rem;margin-bottom:.7rem;background:#fbfbf7}
.dw-order-top{display:flex;justify-content:space-between;gap:.75rem;flex-wrap:wrap;margin-bottom:.2rem}
.dw-order-top strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:1.05rem;text-transform:uppercase;color:#1A1510}
.dw-order-top span{font-size:.8rem;color:#7A6E60}
.dw-order p{font-size:.8rem;color:#7A6E60;margin:.2rem 0}.dw-note{color:#1A1510!important}
.dw-items{display:grid;grid-template-columns:1fr 1fr;gap:.5rem;margin-top:.7rem}
.dw-item{display:flex;align-items:center;justify-content:space-between;gap:.75rem;background:#fff;border:1px solid #d5cfc3;border-radius:2px;padding:.55rem .65rem;font-size:.82rem}
.dw-stepper{display:flex;align-items:center;gap:.45rem}.dw-stepper button{width:30px;height:30px;border:1px solid #d5cfc3;background:#f3f3e8;color:#e11d48;border-radius:2px;font-weight:900;cursor:pointer}.dw-stepper span{min-width:22px;text-align:center;font-family:'Barlow Condensed',Arial,sans-serif;font-size:1.1rem;font-weight:900}
.dw-primary,.dw-secondary{border:0;border-radius:2px;padding:.75rem 1rem;font-family:'Barlow Condensed',Arial,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:1px;cursor:pointer}.dw-primary{background:#e11d48;color:#f3f3e8;width:100%}.dw-secondary{background:#ececdf;color:#1A1510;border:1px solid #d5cfc3}.dw-primary:disabled{opacity:.45;cursor:not-allowed}
.dw-delivery-line{display:grid;grid-template-columns:140px 1fr 1.4fr;gap:.6rem;border-bottom:1px solid #ececdf;padding:.55rem 0;font-size:.82rem;align-items:center}.dw-delivery-line strong{font-family:'Barlow Condensed',Arial,sans-serif;font-size:1rem;text-transform:uppercase}.dw-delivery-line span{color:#7A6E60}.dw-delivery-line em{font-style:normal;color:#1A1510}
.dw-signoff{border-top:1px solid #ececdf;margin-top:.8rem;padding-top:.8rem}.dw-signoff label{display:block;font-family:'Barlow Condensed',Arial,sans-serif;font-size:.75rem;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#7A6E60;margin:.6rem 0 .25rem}.dw-signoff input{width:100%;border:1px solid #d5cfc3;border-radius:2px;padding:.65rem;background:#fff;font-size:.9rem}
.dw-signature{height:140px;border:2px dashed #c5bfb3;background:#fff;position:relative;border-radius:2px;overflow:hidden;touch-action:none}.dw-signature canvas{position:absolute;inset:0;width:100%;height:100%}.dw-signature span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#9A8E80;font-size:.82rem;pointer-events:none;font-style:italic}
.dw-actions{display:flex;gap:.5rem;margin-top:.75rem}.dw-actions .dw-primary{width:auto;flex:1}.dw-actions .dw-secondary{flex:0 0 auto}
@media(max-width:700px){.dw-header{align-items:flex-start}.dw-header h1{font-size:1.8rem}.dw-items{grid-template-columns:1fr}.dw-delivery-line{grid-template-columns:1fr}.dw-actions{flex-direction:column}.dw-actions .dw-primary{width:100%}}
`;
