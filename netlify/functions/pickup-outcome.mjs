const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();
const productCache = new Map();

const TYRE_ITEM_RULES = [
  { minQty: 1, maxQty: 1, sku: 'MCO-COU-01', envName: 'ZOHO_CRM_PRODUCT_TYRE_1_BUNDLE_ID', label: 'COURIERS - Tyre 1 Bundle', defaultRate: 16.8, lineQty: tyreQty => tyreQty },
  { minQty: 2, maxQty: 2, sku: 'MCO-COU-02', envName: 'ZOHO_CRM_PRODUCT_TYRE_2_BUNDLE_ID', label: 'COURIERS - Tyre 2 Bundle', defaultRate: 21.6, lineQty: () => 1 },
  { minQty: 3, maxQty: Infinity, sku: 'MCO-COU-03', envName: 'ZOHO_CRM_PRODUCT_TYRE_3_PLUS_BUNDLE_ID', label: 'COURIERS - Tyre 3+ Bundle', defaultRate: 11.2, lineQty: tyreQty => tyreQty },
];

const PART_ITEM_RULES = [
  { key: 'upTo5kg', sku: 'MCO-COU-04', envName: 'ZOHO_CRM_PRODUCT_UP_TO_5KG_ID', label: 'COURIERS - Up to 5kg', defaultRate: 15.6 },
  { key: 'fiveTo10kg', sku: 'MCO-COU-05', envName: 'ZOHO_CRM_PRODUCT_5_TO_10KG_ID', label: 'COURIERS - 5-10kg', defaultRate: 19.2 },
  { key: 'returns', sku: process.env.ZOHO_CRM_PRODUCT_RETURNS_SKU || '', envName: 'ZOHO_CRM_PRODUCT_RETURNS_ID', label: 'COURIERS - Returns to supplier', defaultRate: 6 },
];

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.MOTOCO_ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function parseBody(event) {
  if (!event.body) return {};
  return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
}

function normalise(value) {
  return String(value || '').trim();
}

function normaliseKey(value) {
  return normalise(value).toLowerCase();
}

function quantity(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function dealStage(key) {
  const defaults = {
    ORDER_PLACED: 'Order Placed',
    PICKED_UP: 'Picked Up',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
    INVOICED: 'Invoiced',
    PAID: 'Paid - future use',
  };
  return process.env[`ZOHO_DEAL_STAGE_${key}`] || defaults[key] || defaults.ORDER_PLACED;
}

function dealPipeline() {
  return process.env.ZOHO_DEAL_PIPELINE || 'Courier Pipeline';
}

function zohoDateTime(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return zohoDateTime(new Date());
  const parts = new Intl.DateTimeFormat('en-AU', {
    timeZone: 'Australia/Brisbane',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const item = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${item.year}-${item.month}-${item.day}T${item.hour}:${item.minute}:${item.second}+10:00`;
}

function pickupFields({ outcome, actualPickupAt, pickupNotes, requestedPickupDate }) {
  const actualField = process.env.ZOHO_DEAL_FIELD_ACTUAL_PICKUP_AT || 'Actual_Pickup_Date_Time';
  const outcomeField = process.env.ZOHO_DEAL_FIELD_PICKUP_OUTCOME || 'Pickup_Outcome';
  const notesField = process.env.ZOHO_DEAL_FIELD_PICKUP_NOTES || 'Pickup_Notes';
  const runDateField = process.env.ZOHO_DEAL_FIELD_REQUESTED_PICKUP_DATE || 'Milk_Run_Date';

  return compact({
    [actualField]: actualPickupAt ? zohoDateTime(actualPickupAt) : undefined,
    [outcomeField]: outcome,
    [notesField]: pickupNotes,
    [runDateField]: requestedPickupDate || undefined,
  });
}

function subformFieldNames() {
  return {
    subform: process.env.ZOHO_DEAL_SUBFORM_PICKUP_ITEMS || 'Job_Builder',
    product: process.env.ZOHO_DEAL_SUBFORM_PRODUCT || 'Product',
    rate: process.env.ZOHO_DEAL_SUBFORM_RATE || 'RR_Price',
    qty: process.env.ZOHO_DEAL_SUBFORM_QTY || 'Qty',
  };
}

async function accessTokenForCrm() {
  const directToken = process.env.ZOHO_CRM_ACCESS_TOKEN;
  const refreshToken = process.env.ZOHO_CRM_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken) return directToken;
  if (!clientId || !clientSecret) return directToken;

  const cacheKey = `CRM:${refreshToken}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60000) return cached.token;

  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  });

  const res = await fetch(`${zohoAccountsUrl}/oauth/v2/token?${params.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Could not refresh Zoho CRM access token.');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function zohoRequest({ path, token, method = 'GET', body }) {
  const res = await fetch(`${zohoApiDomain}${path}`, {
    method,
    headers: compact({
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': body ? 'application/json' : undefined,
    }),
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = data?.message || data?.data?.[0]?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Zoho request failed: ${detail}`);
  }
  const failed = Array.isArray(data?.data) ? data.data.find(item => item.status === 'error' || (item.code && item.code !== 'SUCCESS')) : null;
  if (failed) throw new Error(`Zoho request failed: ${failed.message || failed.code || 'Unknown Zoho error'}`);
  return data;
}

function productIdFromEnv(rule) {
  return normalise(process.env[rule.envName]);
}

function productRate(product, fallbackRate) {
  return money(product?.Unit_Price || product?.unit_price || product?.Price || fallbackRate || 0);
}

async function searchProductByCriteria({ token, field, value }) {
  if (!value) return null;
  try {
    const data = await zohoRequest({
      token,
      path: `/crm/${zohoCrmVersion}/Products/search?criteria=${encodeURIComponent(`(${field}:equals:${value})`)}`,
    });
    return (data.data || [])[0] || null;
  } catch {
    return null;
  }
}

async function resolveCrmProduct({ token, rule }) {
  const envId = productIdFromEnv(rule);
  if (envId) return { id: envId, name: rule.label, rate: rule.defaultRate, source: 'env' };

  const cacheKey = `${rule.sku || ''}:${rule.label}`;
  if (productCache.has(cacheKey)) return productCache.get(cacheKey);

  const product = await searchProductByCriteria({ token, field: 'Product_Code', value: rule.sku })
    || await searchProductByCriteria({ token, field: 'Product_Name', value: rule.label });

  if (!product?.id) {
    throw new Error(`Could not find CRM Product for ${rule.sku || rule.label}. Add it to Zoho CRM Products or set ${rule.envName} in Netlify.`);
  }

  const resolved = { id: product.id, name: product.Product_Name || rule.label, rate: productRate(product, rule.defaultRate), source: 'crm' };
  productCache.set(cacheKey, resolved);
  return resolved;
}

function selectedTyreRule(tyreQty) {
  return TYRE_ITEM_RULES.find(rule => tyreQty >= rule.minQty && tyreQty <= rule.maxQty) || null;
}

function pickupItemsFromPayload(pickupItems = {}) {
  return {
    tyres: quantity(pickupItems.tyres || pickupItems.tyreQty || pickupItems.tyreCount),
    upTo5kg: quantity(pickupItems.upTo5kg || pickupItems.p1),
    fiveTo10kg: quantity(pickupItems.fiveTo10kg || pickupItems.p2),
    returns: quantity(pickupItems.returns || pickupItems.returnsQty),
  };
}

async function addSubformRow({ token, rows, rule, qty }) {
  if (!qty) return 0;
  const fields = subformFieldNames();
  const product = await resolveCrmProduct({ token, rule });
  const rate = money(product.rate || rule.defaultRate);
  rows.push(compact({
    [fields.product]: { id: product.id },
    [fields.rate]: rate,
    [fields.qty]: qty,
  }));
  return rate * qty;
}

async function pickupItemSubform({ token, pickupItems }) {
  const items = pickupItemsFromPayload(pickupItems);
  const rows = [];
  let total = 0;

  const tyreQty = items.tyres;
  if (tyreQty) {
    const rule = selectedTyreRule(tyreQty);
    if (rule) total += await addSubformRow({ token, rows, rule, qty: rule.lineQty(tyreQty) });
  }

  for (const rule of PART_ITEM_RULES) {
    total += await addSubformRow({ token, rows, rule, qty: items[rule.key] });
  }

  return { rows, total };
}

async function updatePickupOutcome({ dealId, stageKey, outcome, actualPickupAt, pickupNotes, requestedPickupDate, pickupItems }) {
  const token = await accessTokenForCrm();
  if (!token) throw new Error('Zoho CRM credentials are missing.');
  if (!dealId) throw new Error('Zoho Deal ID is missing.');

  const itemData = pickupItems ? await pickupItemSubform({ token, pickupItems }) : { rows: [], total: 0 };
  const fields = subformFieldNames();
  const hasItemRows = itemData.rows.length > 0;

  const payload = compact({
    Stage: stageKey ? dealStage(stageKey) : undefined,
    Pipeline: stageKey ? dealPipeline() : undefined,
    Amount: hasItemRows ? itemData.total : undefined,
    [fields.subform]: hasItemRows ? itemData.rows : undefined,
    ...pickupFields({ outcome, actualPickupAt, pickupNotes, requestedPickupDate }),
  });

  await zohoRequest({
    token,
    method: 'PUT',
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(dealId)}`,
    body: { data: [payload] },
  });

  return {
    success: true,
    mode: 'live',
    dealId,
    outcome,
    requestedPickupDate,
    itemRows: itemData.rows.length,
    total: itemData.total,
    message: hasItemRows ? 'Pickup outcome and item rows updated in Zoho CRM.' : 'Pickup outcome updated in Zoho CRM.',
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { message: 'Method not allowed.' });

  try {
    return response(200, await updatePickupOutcome(parseBody(event)));
  } catch (error) {
    return response(500, { success: false, message: error instanceof Error ? error.message : 'Could not update pickup outcome.' });
  }
}
