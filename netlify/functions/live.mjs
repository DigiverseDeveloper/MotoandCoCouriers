const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();
const loginCodes = new Map();

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

function normalise(value) {
  return String(value || '').trim();
}

function normaliseEmail(email) {
  return normalise(email).toLowerCase();
}

function splitName(name = '') {
  const parts = normalise(name).split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: '', lastName: parts[0] || 'Client' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts.at(-1) };
}

function zohoId(result) {
  return result?.data?.[0]?.details?.id;
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
  return process.env.ZOHO_DEAL_PIPELINE || 'Couriers';
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

function clientFromOrder(order = {}) {
  const existing = memoryStore.clients.find(client =>
    (order.clientId && client.id === order.clientId) ||
    (order.clientEmail && normaliseEmail(client.email) === normaliseEmail(order.clientEmail))
  );

  if (existing) return existing;

  return {
    id: order.clientId,
    role: 'client',
    name: order.clientName || order.businessName || order.clientEmail || 'Client',
    email: order.clientEmail,
    phone: order.clientPhone || '',
    businessName: order.businessName || order.clientName || order.clientEmail,
    deliveryAddress: order.dropLocation || '',
    vendors: order.vendor ? [order.vendor] : [],
  };
}

function dealName(order = {}) {
  return [
    order.businessName || order.clientName || 'Pickup request',
    order.conNote || order.id,
  ].filter(Boolean).join(' - ');
}

function dealDescription(order = {}) {
  return [
    `Con note: ${order.conNote || 'Not supplied'}`,
    `Supplier: ${order.vendor || 'Not supplied'}`,
    `Priority: ${order.urgency || 'next-run'}`,
    `Delivery address: ${order.dropLocation || 'Not supplied'}`,
    order.notes ? `Notes: ${order.notes}` : '',
  ].filter(Boolean).join('\n');
}

async function zohoCRMDealForOrder(order) {
  const token = await accessTokenFor('CRM');
  if (!token) {
    return {
      success: true,
      mode: 'placeholder',
      message: 'Pickup request queued. Add Zoho CRM credentials to create Deals live.',
    };
  }

  const client = clientFromOrder(order);
  const clientSync = client.email ? await zohoCRMClient(client) : {};
  const closingDate = new Date(order.preferredDate || order.submittedAt || Date.now()).toISOString().slice(0, 10);

  const deal = await zohoRequest({
    token,
    method: 'POST',
    path: `/crm/${zohoCrmVersion}/Deals`,
    body: {
      data: [compact({
        Deal_Name: dealName(order),
        Stage: dealStage('ORDER_PLACED'),
        Pipeline: dealPipeline(),
        Closing_Date: closingDate,
        Amount: Number(order.price || 0) || undefined,
        Account_Name: clientSync.accountId ? { id: clientSync.accountId } : undefined,
        Contact_Name: clientSync.contactId ? { id: clientSync.contactId } : undefined,
        Description: dealDescription(order),
      })],
    },
  });

  return {
    success: true,
    mode: 'live',
    dealId: zohoId(deal),
    stage: dealStage('ORDER_PLACED'),
    pipeline: dealPipeline(),
    message: 'Pickup request created as a Zoho CRM Deal.',
  };
}

function hasDeliveryProof(delivery = {}) {
  return Boolean(delivery.zohoDealId && (delivery.completedAt || delivery.receiverName || delivery.signature || delivery.signatureDataUrl));
}

function signatureCaptured(delivery = {}) {
  return Boolean(delivery.signature || delivery.signatureDataUrl || delivery.signatureImage || delivery.signaturePreview);
}

function deliveryProofId(delivery = {}) {
  return normalise(delivery.id || `${delivery.zohoDealId}-${delivery.completedAt || delivery.conNote || 'delivery'}`);
}

function deliveryProofText(delivery = {}) {
  const proofId = deliveryProofId(delivery);
  return [
    '--- Moto & Co delivery proof ---',
    `Delivery proof id: ${proofId}`,
    `Con note: ${delivery.conNote || 'Not supplied'}`,
    `Business account: ${delivery.businessName || 'Not supplied'}`,
    `Supplier: ${delivery.vendor || 'Not supplied'}`,
    `Delivered at: ${delivery.completedAt || new Date().toISOString()}`,
    `Receiver name: ${delivery.receiverName || 'Not supplied'}`,
    `Receiver phone: ${delivery.receiverPhone || 'Not supplied'}`,
    `Signed by: ${delivery.receiverName || 'Not supplied'}`,
    `Signature captured: ${signatureCaptured(delivery) ? 'Yes' : 'No'}`,
    `Item summary: ${delivery.itemsDesc || 'Not supplied'}`,
    `Tyre quantity: ${delivery.tyreQty || 0}`,
    `Parts total: ${delivery.partsTotal ? `$${Number(delivery.partsTotal).toFixed(2)}` : '$0.00'}`,
    `Returns quantity: ${delivery.returnsQty || 0}`,
    `Delivery total: ${delivery.totalPrice ? `$${Number(delivery.totalPrice).toFixed(2)} GST inclusive` : 'Not supplied'}`,
  ].join('\n');
}

function customField(fieldKey, value) {
  const apiName = process.env[`ZOHO_DEAL_FIELD_${fieldKey}`];
  return apiName ? { [apiName]: value } : {};
}

function deliveryProofCustomFields(delivery = {}) {
  return {
    ...customField('DELIVERED_AT', delivery.completedAt || new Date().toISOString()),
    ...customField('RECEIVER_NAME', delivery.receiverName),
    ...customField('RECEIVER_PHONE', delivery.receiverPhone),
    ...customField('SIGNATURE_CAPTURED', signatureCaptured(delivery) ? 'Yes' : 'No'),
    ...customField('DELIVERY_PROOF_ID', deliveryProofId(delivery)),
  };
}

async function syncDeliveryProofToCrm({ token, delivery }) {
  if (!hasDeliveryProof(delivery)) return { skipped: true };

  const proofId = deliveryProofId(delivery);
  const deal = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(delivery.zohoDealId)}?fields=${encodeURIComponent('Description,Stage,Pipeline,Amount')}`,
  });
  const existing = deal?.data?.[0] || {};
  const currentDescription = existing.Description || '';
  if (currentDescription.includes(`Delivery proof id: ${proofId}`)) return { skipped: true, reason: 'already-synced' };

  const nextDescription = [currentDescription, deliveryProofText(delivery)].filter(Boolean).join('\n\n');
  await zohoRequest({
    token,
    method: 'PUT',
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(delivery.zohoDealId)}`,
    body: {
      data: [compact({
        Stage: dealStage('DELIVERED'),
        Pipeline: dealPipeline(),
        Amount: Number(delivery.totalPrice || existing.Amount || 0) || undefined,
        Description: nextDescription,
        ...deliveryProofCustomFields(delivery),
      })],
    },
  });

  return { synced: true, proofId };
}

async function syncDeliveryProofs(deliveries = []) {
  const token = await accessTokenFor('CRM');
  if (!token) return [];

  const candidates = deliveries.filter(hasDeliveryProof);
  const results = [];
  for (const delivery of candidates) {
    try {
      results.push(await syncDeliveryProofToCrm({ token, delivery }));
    } catch (error) {
      console.error('Could not sync delivery proof to Zoho CRM:', error);
      results.push({ synced: false, proofId: deliveryProofId(delivery), message: error instanceof Error ? error.message : 'Could not sync delivery proof.' });
    }
  }
  return results;
}

async function zohoCRMDealStage({ dealId, stageKey, stage, amount, deliveryProof }) {
  const token = await accessTokenFor('CRM');
  const nextStage = stage || dealStage(stageKey || 'ORDER_PLACED');

  if (!token || !dealId) {
    return {
      success: true,
      mode: 'placeholder',
      stage: nextStage,
      message: 'Deal stage queued. Add Zoho CRM credentials and a Deal ID to update live.',
    };
  }

  await zohoRequest({
    token,
    method: 'PUT',
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(dealId)}`,
    body: {
      data: [compact({
        Stage: nextStage,
        Pipeline: dealPipeline(),
        Amount: Number(amount || 0) || undefined,
      })],
    },
  });

  if (deliveryProof) {
    await syncDeliveryProofToCrm({ token, delivery: { ...deliveryProof, zohoDealId: dealId, totalPrice: amount ?? deliveryProof.totalPrice } });
  }

  return {
    success: true,
    mode: 'live',
    dealId,
    stage: nextStage,
    pipeline: dealPipeline(),
    message: deliveryProof ? 'Zoho CRM Deal stage and delivery proof updated.' : 'Zoho CRM Deal stage updated.',
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

function makeLoginCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function sendLoginCodeEmail(email, code) {
  const from = process.env.LOGIN_EMAIL_FROM || process.env.ZEPTO_FROM_EMAIL;
  const token = process.env.ZEPTO_MAIL_TOKEN || process.env.ZEPTOMAIL_TOKEN;

  if (!from || !token) {
    console.log(`Moto & Co login code for ${email}: ${code}`);
    return { sent: false, mode: 'console', message: 'Login code created. Add ZEPTO_MAIL_TOKEN and LOGIN_EMAIL_FROM in Netlify to send email.' };
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

  let user = role === 'client'
    ? memoryStore.clients.find(client => normaliseEmail(client.email) === cleanEmail)
    : memoryStore.users.find(item => item.role === role && normaliseEmail(item.email) === cleanEmail);

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
    memoryStore.clients = [
      ...memoryStore.clients.filter(client => normaliseEmail(client.email) !== cleanEmail),
      record.user,
    ];
  }

  return { success: true, user: publicUser(record.user) };
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
      const proofSync = await syncDeliveryProofs(memoryStore.deliveries).catch(error => {
        console.error('Could not sync delivery proofs:', error);
        return [];
      });
      return response(200, { store: memoryStore, proofSync });
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

    if (event.httpMethod === 'POST' && path === '/auth/request-code') {
      const result = await requestLoginCode(parseBody(event));
      return response(result.success ? 200 : 401, result);
    }

    if (event.httpMethod === 'POST' && path === '/auth/verify-code') {
      const result = await verifyLoginCode(parseBody(event));
      return response(result.success ? 200 : 401, result);
    }

    if (event.httpMethod === 'POST' && path === '/zoho/crm/client') {
      const { client } = parseBody(event);
      return response(200, await zohoCRMClient(client));
    }

    if (event.httpMethod === 'POST' && path === '/zoho/crm/deal') {
      const { order } = parseBody(event);
      return response(200, await zohoCRMDealForOrder(order));
    }

    if (event.httpMethod === 'PUT' && path === '/zoho/crm/deal/stage') {
      return response(200, await zohoCRMDealStage(parseBody(event)));
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
