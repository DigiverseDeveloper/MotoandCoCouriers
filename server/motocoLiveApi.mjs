import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');
const dataPath = resolve(root, 'server', 'data', 'motoco-store.json');

function loadEnvFile() {
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

loadEnvFile();

const port = Number(process.env.MOTOCO_API_PORT || 8790);
const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();
const loginCodes = new Map();

const initialStore = {
  users: [
    { id: 'admin', name: 'Super Admin', email: 'admin@motoandco.com.au', role: 'admin' },
    { id: 'drv1', name: 'Jake Morrow', email: 'jake@motoandco.com.au', role: 'driver' },
  ],
  clients: [],
  orders: [],
  deliveries: [],
};

function ensureDataFile() {
  mkdirSync(dirname(dataPath), { recursive: true });
  if (!existsSync(dataPath)) {
    writeFileSync(dataPath, JSON.stringify(initialStore, null, 2));
  }
}

function readStore() {
  ensureDataFile();
  return JSON.parse(readFileSync(dataPath, 'utf8'));
}

function writeStore(store) {
  ensureDataFile();
  const safeStore = {
    users: store.users || initialStore.users,
    clients: (store.clients || []).map(({ password, ...client }) => client),
    orders: store.orders || [],
    deliveries: store.deliveries || [],
  };
  writeFileSync(dataPath, JSON.stringify(safeStore, null, 2));
  return safeStore;
}

function send(res, status, body) {
  res.writeHead(status, {
    'Access-Control-Allow-Origin': process.env.MOTOCO_ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    'Content-Type': 'application/json',
  });
  res.end(JSON.stringify(body));
}

async function readJSON(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] || 'Client' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

function zohoId(response) {
  return response?.data?.[0]?.details?.id || response?.data?.[0]?.details?.['id'];
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
  return data;
}

async function accessTokenFor(service) {
  const directToken = process.env[`ZOHO_${service}_ACCESS_TOKEN`];
  const refreshToken = process.env[`ZOHO_${service}_REFRESH_TOKEN`] || process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken) return directToken;
  if (!clientId || !clientSecret) return directToken;

  const cacheKey = `${service}:${refreshToken}`;
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
    throw new Error(data.error_description || data.error || 'Could not refresh Zoho access token.');
  }

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function zohoCRMClient(client) {
  const token = await accessTokenFor('CRM');
  if (!token) {
    return {
      success: true,
      mode: 'placeholder',
      contactId: client.id,
      message: 'Client queued for Zoho CRM. Add Zoho OAuth credentials on the server to push live.',
    };
  }

  const { firstName, lastName } = splitName(client.name);
  const account = await zohoRequest({
    token,
    method: 'POST',
    path: `/crm/${zohoCrmVersion}/Accounts/upsert`,
    body: {
      data: [compact({
        Account_Name: client.businessName || client.name,
        Phone: client.phone,
        Billing_Street: client.deliveryAddress,
        Description: `Moto & Co client ${client.id}. Preferred vendors: ${(client.vendors || []).join(', ') || 'none'}.`,
      })],
      duplicate_check_fields: ['Account_Name'],
    },
  });
  const accountId = zohoId(account);

  const contact = await zohoRequest({
    token,
    method: 'POST',
    path: `/crm/${zohoCrmVersion}/Contacts/upsert`,
    body: {
      data: [compact({
        First_Name: firstName,
        Last_Name: lastName,
        Email: client.email,
        Phone: client.phone,
        Mailing_Street: client.deliveryAddress,
        Account_Name: accountId ? { id: accountId } : undefined,
        Description: `Moto & Co portal contact for ${client.businessName || client.name}.`,
      })],
      duplicate_check_fields: ['Email'],
    },
  });

  return {
    success: true,
    mode: 'live',
    accountId,
    contactId: zohoId(contact),
    account,
    contact,
    message: 'Client pushed to Zoho CRM Accounts and Contacts.',
  };
}

async function zohoBooksInvoice({ client, deliveries = [], monthLabel, total }) {
  const token = await accessTokenFor('BOOKS');
  const customerId = client.zohoBooksCustomerId || process.env.ZOHO_BOOKS_FALLBACK_CUSTOMER_ID;
  const organisationId = process.env.ZOHO_BOOKS_ORGANIZATION_ID;
  const itemId = process.env.ZOHO_BOOKS_SERVICE_ITEM_ID;
  const missing = [
    !token && 'ZOHO_BOOKS_REFRESH_TOKEN or ZOHO_BOOKS_ACCESS_TOKEN',
    !organisationId && 'ZOHO_BOOKS_ORGANIZATION_ID',
    !customerId && 'Zoho Books customer_id on client or ZOHO_BOOKS_FALLBACK_CUSTOMER_ID',
    !itemId && 'ZOHO_BOOKS_SERVICE_ITEM_ID',
  ].filter(Boolean);

  if (missing.length) {
    return {
      success: true,
      mode: 'placeholder',
      invoiceNumber: `DRAFT-${Date.now().toString().slice(-6)}`,
      missing,
      message: `Invoice queued for ${client.businessName || client.name} (${monthLabel}). Add the missing Zoho Books settings to create live invoices.`,
    };
  }

  const lineItems = deliveries.map(delivery => compact({
    item_id: itemId,
    description: `${delivery.conNote || 'Delivery'} - ${delivery.vendor || 'Vendor'} - ${delivery.itemsDesc || 'Moto & Co delivery service'}`,
    quantity: 1,
    rate: Number(delivery.totalPrice || 0),
    tax_id: process.env.ZOHO_BOOKS_GST_TAX_ID,
  }));

  if (!lineItems.length) {
    lineItems.push(compact({
      item_id: itemId,
      description: `Moto & Co logistics services - ${monthLabel}`,
      quantity: 1,
      rate: Number(total || 0),
      tax_id: process.env.ZOHO_BOOKS_GST_TAX_ID,
    }));
  }

  const invoice = await zohoRequest({
    token,
    method: 'POST',
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
    invoice,
    message: 'Invoice created in Zoho Books.',
  };
}

async function zohoCRMContacts() {
  const token = await accessTokenFor('CRM');
  if (!token) {
    const store = readStore();
    return store.clients.map(client => ({
      id: client.id,
      name: client.name,
      email: client.email,
      business: client.businessName,
      phone: client.phone,
    }));
  }

  const response = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts?fields=Full_Name,Email,Phone,Account_Name`,
  });

  return (response.data || []).map(contact => ({
    id: contact.id,
    name: contact.Full_Name,
    email: contact.Email,
    business: contact.Account_Name?.name,
    phone: contact.Phone,
  }));
}

function crmContactToClient(contact) {
  return {
    id: `crm_${contact.id}`,
    role: 'client',
    name: contact.Full_Name || [contact.First_Name, contact.Last_Name].filter(Boolean).join(' ') || contact.Email,
    email: contact.Email,
    phone: contact.Phone || '',
    businessName: contact.Account_Name?.name || contact.Full_Name || contact.Email,
    deliveryAddress: contact.Mailing_Street || '',
    vendors: [],
    zohoContactId: contact.id,
    zohoAccountId: contact.Account_Name?.id,
  };
}

async function zohoCRMClientByEmail(email) {
  const token = await accessTokenFor('CRM');
  if (!token || !email) return null;

  const response = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts/search?email=${encodeURIComponent(email)}`,
  });
  const contact = (response.data || [])[0];
  return contact ? crmContactToClient(contact) : null;
}

function makeLoginCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendLoginCodeEmail(email, code) {
  const from = process.env.LOGIN_EMAIL_FROM || process.env.ZEPTO_FROM_EMAIL;
  const token = process.env.ZEPTO_MAIL_TOKEN || process.env.ZEPTOMAIL_TOKEN;

  if (!from || !token) {
    console.log(`Moto & Co login code for ${email}: ${code}`);
    return { sent: false, mode: 'console', message: 'Login code created. Add ZEPTO_MAIL_TOKEN and LOGIN_EMAIL_FROM to send email.' };
  }

  const res = await fetch('https://api.zeptomail.com.au/v1.1/email', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-enczapikey ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: { address: from, name: 'Moto & Co Couriers' },
      to: [{ email_address: { address: email } }],
      subject: 'Your Moto & Co login code',
      htmlbody: `<p>Your Moto & Co login code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      textbody: `Your Moto & Co login code is ${code}. This code expires in 10 minutes.`,
    }),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Could not send login email: ${text}`);
  return { sent: true, mode: 'email' };
}

async function requestLoginCode({ role, email }) {
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail) return { success: false, message: 'Enter your email address.' };

  const store = readStore();
  let user = role === 'client'
    ? store.clients.find(client => normaliseEmail(client.email) === cleanEmail)
    : store.users.find(item => item.role === role && normaliseEmail(item.email) === cleanEmail);

  if (!user && role === 'client') {
    user = await zohoCRMClientByEmail(cleanEmail);
  }

  if (!user) return { success: false, message: 'No matching account found.' };

  const code = makeLoginCode();
  loginCodes.set(`${role}:${cleanEmail}`, {
    code,
    user,
    expiresAt: Date.now() + 10 * 60 * 1000,
    used: false,
  });

  const delivery = await sendLoginCodeEmail(cleanEmail, code);
  return { success: true, email: cleanEmail, ...delivery };
}

async function verifyLoginCode({ role, email, code }) {
  const cleanEmail = normaliseEmail(email);
  const key = `${role}:${cleanEmail}`;
  const record = loginCodes.get(key);

  if (!record || record.used || record.expiresAt < Date.now()) {
    loginCodes.delete(key);
    return { success: false, message: 'That login code has expired. Request a new code.' };
  }

  if (String(code || '').trim() !== record.code) {
    return { success: false, message: 'That login code is not correct.' };
  }

  record.used = true;
  loginCodes.delete(key);

  if (role === 'client') {
    const store = readStore();
    writeStore({
      ...store,
      clients: [
        ...store.clients.filter(client => normaliseEmail(client.email) !== cleanEmail),
        record.user,
      ],
    });
  }

  return { success: true, user: publicUser(record.user) };
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, {});

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/^\/api\/live/, '') || '/';

    if (req.method === 'GET' && path === '/health') {
      return send(res, 200, { ok: true, dataPath });
    }

    if (req.method === 'GET' && path === '/workspace') {
      return send(res, 200, { store: readStore() });
    }

    if (req.method === 'PUT' && path === '/snapshot') {
      const { store } = await readJSON(req);
      return send(res, 200, { store: writeStore(store) });
    }

    if (req.method === 'POST' && path === '/auth/login') {
      const { role, email } = await readJSON(req);
      const store = readStore();
      const pool = role === 'client' ? store.clients : store.users;
      let user = pool.find(item => item.role === role && item.email?.toLowerCase() === String(email).toLowerCase());
      if (!user && role === 'client') {
        user = await zohoCRMClientByEmail(email);
        if (user) {
          writeStore({
            ...store,
            clients: [
              ...store.clients.filter(client => client.email?.toLowerCase() !== user.email?.toLowerCase()),
              user,
            ],
          });
        }
      }
      if (!user) return send(res, 401, { message: 'No matching account found.' });
      return send(res, 200, { user: publicUser(user) });
    }

    if (req.method === 'POST' && path === '/auth/request-code') {
      const result = await requestLoginCode(await readJSON(req));
      return send(res, result.success ? 200 : 401, result);
    }

    if (req.method === 'POST' && path === '/auth/verify-code') {
      const result = await verifyLoginCode(await readJSON(req));
      return send(res, result.success ? 200 : 401, result);
    }

    if (req.method === 'POST' && path === '/zoho/crm/client') {
      const { client } = await readJSON(req);
      return send(res, 200, await zohoCRMClient(client));
    }

    if (req.method === 'GET' && path === '/zoho/crm/contacts') {
      return send(res, 200, { contacts: await zohoCRMContacts() });
    }

    if (req.method === 'GET' && path === '/zoho/crm/test') {
      const token = await accessTokenFor('CRM');
      if (!token) return send(res, 500, { ok: false, message: 'No CRM token available. Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_CRM_REFRESH_TOKEN.' });
      const contacts = await zohoCRMContacts();
      return send(res, 200, { ok: true, mode: 'live', contactCount: contacts.length });
    }

    if (req.method === 'POST' && path === '/zoho/books/invoice') {
      return send(res, 200, await zohoBooksInvoice(await readJSON(req)));
    }

    return send(res, 404, { message: 'Not found.' });
  } catch (error) {
    return send(res, 500, { message: error instanceof Error ? error.message : 'Live API failed.' });
  }
});

server.listen(port, () => {
  console.log(`Moto & Co live API listening on http://localhost:${port}/api/live`);
});
