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

function normalise(value) {
  return String(value || '').trim();
}

function normaliseEmail(email) {
  return normalise(email).toLowerCase();
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

async function zohoBooksRequest({ path, token, method = 'GET', body }) {
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
    throw new Error(`Zoho Books request failed: ${detail}`);
  }
  return data;
}

function accountNameForClient(client = {}) {
  return normalise(client.zohoAccountName || client.businessName || client.accountName || client.companyName);
}

function billingEmailForClient(client = {}) {
  return normaliseEmail(client.billingEmail || client.email || client.contactEmail);
}

async function findBooksCustomer({ token, organisationId, accountName, email }) {
  const searchText = accountName || email;
  if (!searchText) return null;

  const data = await zohoBooksRequest({
    token,
    path: `/books/v3/contacts?organization_id=${encodeURIComponent(organisationId)}&search_text=${encodeURIComponent(searchText)}`,
  });

  const contacts = data.contacts || [];
  return contacts.find(contact =>
    normalise(contact.contact_name).toLowerCase() === normalise(accountName).toLowerCase() ||
    normaliseEmail(contact.email) === email
  ) || contacts[0] || null;
}

async function createBooksCustomer({ token, organisationId, client, accountName, email }) {
  if (!accountName) return null;

  const data = await zohoBooksRequest({
    token,
    method: 'POST',
    path: `/books/v3/contacts?organization_id=${encodeURIComponent(organisationId)}`,
    body: compact({
      contact_name: accountName,
      company_name: accountName,
      contact_type: 'customer',
      billing_address: client.deliveryAddress ? { address: client.deliveryAddress } : undefined,
      contact_persons: email ? [{
        first_name: normalise(client.name || accountName).split(/\s+/)[0] || accountName,
        last_name: normalise(client.name || '').split(/\s+/).slice(1).join(' ') || accountName,
        email,
        phone: client.phone || undefined,
        is_primary_contact: true,
      }] : undefined,
    }),
  });

  return data.contact || null;
}

async function resolveBooksCustomer({ token, organisationId, client }) {
  const explicitCustomerId = client.zohoBooksCustomerId || client.booksCustomerId;
  if (explicitCustomerId) return { customerId: explicitCustomerId, source: 'client' };

  const accountName = accountNameForClient(client);
  const email = billingEmailForClient(client);
  const found = await findBooksCustomer({ token, organisationId, accountName, email });
  if (found?.contact_id) return { customerId: found.contact_id, source: 'matched-account', customerName: found.contact_name };

  if (process.env.ZOHO_BOOKS_CREATE_CUSTOMERS === 'true') {
    const created = await createBooksCustomer({ token, organisationId, client, accountName, email });
    if (created?.contact_id) return { customerId: created.contact_id, source: 'created-account', customerName: created.contact_name };
  }

  const fallbackCustomerId = process.env.ZOHO_BOOKS_FALLBACK_CUSTOMER_ID;
  if (fallbackCustomerId) return { customerId: fallbackCustomerId, source: 'fallback' };

  return { customerId: '', source: 'missing' };
}

function missingSettings({ token, organisationId, customerId, itemId }) {
  return [
    !token && 'ZOHO_BOOKS_REFRESH_TOKEN or ZOHO_BOOKS_ACCESS_TOKEN',
    !organisationId && 'ZOHO_BOOKS_ORGANIZATION_ID',
    !customerId && 'Zoho Books customer for the CRM Account, or temporary ZOHO_BOOKS_FALLBACK_CUSTOMER_ID',
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
  const itemId = process.env.ZOHO_BOOKS_SERVICE_ITEM_ID;
  const customer = token && organisationId ? await resolveBooksCustomer({ token, organisationId, client }) : { customerId: '', source: 'missing' };
  const missing = missingSettings({ token, organisationId, customerId: customer.customerId, itemId });

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
    method: 'POST',
    path: `/books/v3/invoices?organization_id=${encodeURIComponent(organisationId)}`,
    body: {
      customer_id: customer.customerId,
      date: new Date().toISOString().slice(0, 10),
      line_items: lineItems,
      notes: `Moto & Co monthly logistics invoice for ${monthLabel}. Billing account: ${accountNameForClient(client) || customer.customerName || 'Zoho Books customer'}.`,
    },
  });

  return {
    success: true,
    mode: 'live',
    customerId: customer.customerId,
    customerSource: customer.source,
    invoiceNumber: invoice?.invoice?.invoice_number,
    invoiceId: invoice?.invoice?.invoice_id,
    message: 'Invoice created in Zoho Books for the business account.',
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
