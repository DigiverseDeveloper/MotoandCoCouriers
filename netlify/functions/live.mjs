const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();

const fallbackStore = {
  users: [
    { id: 'admin', name: 'Super Admin', email: 'admin@motoandco.com.au', role: 'admin' },
    { id: 'drv1', name: 'Jake Morrow', email: 'jake@motoandco.com.au', role: 'driver' },
  ],
  clients: [],
  orders: [],
  deliveries: [],
};

let memoryStore = JSON.parse(JSON.stringify(fallbackStore));

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.MOTOCO_ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
}

function publicUser(user) {
  if (!user) return null;
  const { password, ...safeUser } = user;
  return safeUser;
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function splitName(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] || 'Client' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

function zohoId(result) {
  return result?.data?.[0]?.details?.id;
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
      message: 'Client queued for Zoho CRM. Add Zoho OAuth credentials in Netlify environment variables to push live.',
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
    message: 'Client pushed to Zoho CRM Accounts and Contacts.',
  };
}

async function zohoCRMContacts() {
  const token = await accessTokenFor('CRM');
  if (!token) {
    return memoryStore.clients.map(client => ({
      id: client.id,
      name: client.name,
      email: client.email,
      business: client.businessName,
      phone: client.phone,
    }));
  }

  const result = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts?fields=Full_Name,Email,Phone,Account_Name`,
  });

  return (result.data || []).map(contact => ({
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

  const result = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts/search?email=${encodeURIComponent(email)}`,
  });
  const contact = (result.data || [])[0];
  return contact ? crmContactToClient(contact) : null;
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
    message: 'Invoice created in Zoho Books.',
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});

  try {
    const path = normalisePath(event.path);

    if (event.httpMethod === 'GET' && path === '/health') {
      return response(200, { ok: true, runtime: 'netlify' });
    }

    if (event.httpMethod === 'GET' && path === '/workspace') {
      return response(200, { store: memoryStore });
    }

    if (event.httpMethod === 'PUT' && path === '/snapshot') {
      const { store } = parseBody(event);
      memoryStore = {
        users: store?.users || fallbackStore.users,
        clients: (store?.clients || []).map(({ password, ...client }) => client),
        orders: store?.orders || [],
        deliveries: store?.deliveries || [],
      };
      return response(200, { store: memoryStore });
    }

    if (event.httpMethod === 'POST' && path === '/auth/login') {
      const { role, email } = parseBody(event);
      const pool = role === 'client' ? memoryStore.clients : memoryStore.users;
      let user = pool.find(item => item.role === role && item.email?.toLowerCase() === String(email).toLowerCase());
      if (!user && role === 'client') {
        user = await zohoCRMClientByEmail(email);
        if (user) {
          memoryStore.clients = [
            ...memoryStore.clients.filter(client => client.email?.toLowerCase() !== user.email?.toLowerCase()),
            user,
          ];
        }
      }
      if (!user) return response(401, { message: 'No matching account found.' });
      return response(200, { user: publicUser(user) });
    }

    if (event.httpMethod === 'POST' && path === '/zoho/crm/client') {
      const { client } = parseBody(event);
      return response(200, await zohoCRMClient(client));
    }

    if (event.httpMethod === 'GET' && path === '/zoho/crm/contacts') {
      return response(200, { contacts: await zohoCRMContacts() });
    }

    if (event.httpMethod === 'GET' && path === '/zoho/crm/test') {
      const token = await accessTokenFor('CRM');
      if (!token) return response(500, { ok: false, message: 'No CRM token available. Check ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, and ZOHO_CRM_REFRESH_TOKEN.' });
      const contacts = await zohoCRMContacts();
      return response(200, { ok: true, mode: 'live', contactCount: contacts.length });
    }

    if (event.httpMethod === 'POST' && path === '/zoho/books/invoice') {
      return response(200, await zohoBooksInvoice(parseBody(event)));
    }

    return response(404, { message: 'Not found.' });
  } catch (error) {
    return response(500, { message: error instanceof Error ? error.message : 'Live API failed.' });
  }
}

function normalisePath(rawPath = '') {
  if (rawPath.includes('/.netlify/functions/live/')) {
    return `/${rawPath.split('/.netlify/functions/live/')[1] || ''}`;
  }
  if (rawPath.includes('/api/live/')) {
    return `/${rawPath.split('/api/live/')[1] || ''}`;
  }
  if (rawPath.endsWith('/.netlify/functions/live') || rawPath.endsWith('/api/live')) {
    return '/';
  }
  return rawPath || '/';
}
