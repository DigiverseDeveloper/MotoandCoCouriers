const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const tokenCache = new Map();

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

async function accessTokenForBooks() {
  const directToken = process.env.ZOHO_BOOKS_ACCESS_TOKEN;
  const refreshToken = process.env.ZOHO_BOOKS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken) return directToken;
  if (!clientId || !clientSecret) return directToken;

  const cacheKey = `BOOKS:${refreshToken}`;
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
    throw new Error(data.error_description || data.error || 'Could not refresh Zoho Books access token.');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function zohoBooksRequest({ path, token, body }) {
  const res = await fetch(`${zohoApiDomain}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = data?.message || data?.data?.[0]?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Zoho Books request failed: ${detail}`);
  }
  return data;
}

function missingSettings({ token, organisationId, customerId, itemId }) {
  return [
    !token && 'ZOHO_BOOKS_REFRESH_TOKEN or ZOHO_BOOKS_ACCESS_TOKEN',
    !organisationId && 'ZOHO_BOOKS_ORGANIZATION_ID',
    !customerId && 'Zoho Books customer id on the client, or temporary ZOHO_BOOKS_FALLBACK_CUSTOMER_ID',
    !itemId && 'ZOHO_BOOKS_SERVICE_ITEM_ID',
  ].filter(Boolean);
}

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function deliveryDescription(delivery = {}) {
  return [
    delivery.conNote || 'Delivery',
    delivery.vendor || 'Vendor',
    delivery.itemsDesc || 'Moto & Co delivery service',
  ].filter(Boolean).join(' - ');
}

function buildLineItems({ deliveries = [], itemId }) {
  return deliveries
    .filter(delivery => money(delivery.totalPrice) > 0)
    .map(delivery => compact({
      item_id: itemId,
      description: deliveryDescription(delivery),
      quantity: 1,
      rate: money(delivery.totalPrice),
      tax_id: process.env.ZOHO_BOOKS_GST_TAX_ID,
    }));
}

async function createInvoice(payload = {}) {
  const token = await accessTokenForBooks();
  const client = payload.client || {};
  const deliveries = Array.isArray(payload.deliveries) ? payload.deliveries : [];
  const monthLabel = payload.monthLabel || new Date().toLocaleString('en-AU', { month: 'long', year: 'numeric' });
  const organisationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
  const customerId = client.zohoBooksCustomerId || process.env.ZOHO_BOOKS_FALLBACK_CUSTOMER_ID;
  const itemId = process.env.ZOHO_BOOKS_SERVICE_ITEM_ID;
  const missing = missingSettings({ token, organisationId, customerId, itemId });

  if (missing.length) {
    return {
      success: false,
      mode: 'setup-required',
      missing,
      message: `Zoho Books invoice not created. Add the missing Books settings first: ${missing.join(', ')}.`,
    };
  }

  const lineItems = buildLineItems({ deliveries, itemId });
  if (!lineItems.length) {
    return {
      success: false,
      mode: 'no-billable-deliveries',
      message: 'No billable deliveries were supplied for this invoice.',
    };
  }

  const invoice = await zohoBooksRequest({
    token,
    path: `/books/v3/invoices?organization_id=${encodeURIComponent(organisationId)}`,
    body: {
      customer_id: customerId,
      date: new Date().toISOString().slice(0, 10),
      line_items: lineItems,
      notes: `Moto & Co monthly logistics invoice for ${monthLabel}. Prices are ex GST unless the configured Zoho tax code applies GST.`,
    },
  });

  return {
    success: true,
    mode: 'live',
    invoiceNumber: invoice?.invoice?.invoice_number,
    invoiceId: invoice?.invoice?.invoice_id,
    message: 'Invoice created in Zoho Books.',
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { message: 'Method not allowed.' });

  try {
    return response(200, await createInvoice(parseBody(event)));
  } catch (error) {
    return response(500, { success: false, message: error instanceof Error ? error.message : 'Could not create Zoho Books invoice.' });
  }
}
