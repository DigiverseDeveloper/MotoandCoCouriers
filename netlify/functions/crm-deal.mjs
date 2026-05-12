const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();

const VENDORS = {
  'Link International': { address: '6/56 Boundary Rd, Rocklea QLD 4106', phone: '+61 7 3373 1000', email: 'sales@linkint.com.au' },
  'A1 Accessories': { address: '45 Proprietary St, Tingalpa QLD 4173', phone: '+61 7 3390 3999', email: 'info@a1accessories.com.au' },
  McLeods: { address: '42 Hargraves St, Castlemaine VIC 3450', phone: '+61 3 5472 1000', email: 'sales@mcleods.com.au' },
  'Gas Imports': { address: '12 Rushdale St, Knoxfield VIC 3180', phone: '+61 3 9765 9900', email: 'info@gasimports.com.au' },
  Ficeda: { address: '7 Stanton Rd, Seven Hills NSW 2147', phone: '+61 2 8822 0222', email: 'orders@ficeda.com.au' },
  'Whites Powersports': { address: '1/22 Anzac Ave, Smeaton Grange NSW 2567', phone: '+61 2 4648 2300', email: 'sales@whitespowersports.com.au' },
};

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
  return data;
}

function clientFromOrder(order = {}) {
  return {
    id: order.clientId,
    role: 'client',
    name: order.clientName || order.name || order.businessName || order.clientEmail || 'Client',
    email: order.clientEmail || order.email,
    phone: order.clientPhone || order.phone || '',
    businessName: order.businessName || order.accountName || order.companyName || order.clientName || order.clientEmail,
    deliveryAddress: order.dropLocation || order.deliveryAddress || '',
    vendors: order.vendor ? [order.vendor] : [],
  };
}

async function upsertCrmClient({ token, client }) {
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
        Description: `Moto & Co client ${client.id || ''}. Preferred vendors: ${(client.vendors || []).join(', ') || 'none'}.`,
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

  return { accountId, contactId: zohoId(contact) };
}

function money(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? amount : 0;
}

function numberOrBlank(value) {
  const amount = Number(value || 0);
  return Number.isFinite(amount) && amount > 0 ? amount : '';
}

function vendorDetails(order = {}) {
  const fallback = VENDORS[order.vendor] || {};
  return {
    name: order.vendor || 'Not supplied',
    address: order.vendorAddress || order.pickupAddress || fallback.address || '',
    phone: order.vendorPhone || order.pickupPhone || fallback.phone || '',
    email: order.vendorEmail || fallback.email || '',
  };
}

function partQtys(order = {}) {
  return order.partQtys || order.partsQtys || order.packageQtys || order.parts || {};
}

function partsSummary(order = {}) {
  const parts = partQtys(order);
  const lines = [
    parts.p1 ? `Up to 5kg x ${parts.p1}` : '',
    parts.p2 ? `5-10kg x ${parts.p2}` : '',
    parts.p3 ? `10kg+ x ${parts.p3}` : '',
  ].filter(Boolean);
  return lines.join(', ');
}

function itemSummary(order = {}) {
  const items = [];
  const tyreQty = numberOrBlank(order.tyreQty || order.tyres || order.tyreCount);
  const returnsQty = numberOrBlank(order.returnsQty || order.returnQty || order.returns);
  if (tyreQty) items.push(`${tyreQty} tyre${tyreQty === 1 ? '' : 's'}`);
  if (partsSummary(order)) items.push(partsSummary(order));
  if (returnsQty) items.push(`${returnsQty} return${returnsQty === 1 ? '' : 's'}`);
  if (order.itemsDesc) items.push(order.itemsDesc);
  return items.join('; ') || 'Not supplied';
}

function preferredWindow(order = {}) {
  return [order.preferredDate, order.preferredTime].filter(Boolean).join(' ') || order.submittedAt || 'Not supplied';
}

function dealName(order = {}) {
  return [
    order.conNote || order.id || 'Pickup request',
    order.businessName || order.clientName || order.clientEmail || 'Client',
  ].filter(Boolean).join(' - ');
}

function dealDescription(order = {}) {
  const vendor = vendorDetails(order);
  const client = clientFromOrder(order);
  const amount = money(order.totalPrice || order.price);

  return [
    'Moto & Co courier pickup request',
    '',
    `Portal order id: ${order.id || 'Not supplied'}`,
    `Con note: ${order.conNote || 'Not supplied'}`,
    `CRM pipeline: ${dealPipeline()}`,
    `Requested stage: ${dealStage('ORDER_PLACED')}`,
    '',
    'Account and contact',
    `Business account: ${client.businessName || 'Not supplied'}`,
    `Requester: ${client.name || 'Not supplied'}`,
    `Requester email: ${client.email || 'Not supplied'}`,
    `Requester phone: ${client.phone || 'Not supplied'}`,
    '',
    'Pickup',
    `Supplier: ${vendor.name}`,
    `Pickup address: ${vendor.address || 'Not supplied'}`,
    `Supplier phone: ${vendor.phone || 'Not supplied'}`,
    `Supplier email: ${vendor.email || 'Not supplied'}`,
    '',
    'Drop off',
    `Drop address: ${order.dropLocation || client.deliveryAddress || 'Not supplied'}`,
    '',
    'Items and pricing',
    `Item summary: ${itemSummary(order)}`,
    `Tyre quantity: ${numberOrBlank(order.tyreQty || order.tyres || order.tyreCount) || '0'}`,
    `Parts: ${partsSummary(order) || 'None'}`,
    `Returns: ${numberOrBlank(order.returnsQty || order.returnQty || order.returns) || '0'}`,
    `Quoted total: ${amount ? `$${amount.toFixed(2)} GST inclusive` : 'Not supplied'}`,
    '',
    'Run details',
    `Urgency: ${order.urgency || 'next-run'}`,
    `Preferred window: ${preferredWindow(order)}`,
    `Submitted at: ${order.submittedAt || new Date().toISOString()}`,
    order.notes ? `Driver notes: ${order.notes}` : 'Driver notes: None',
  ].join('\n');
}

function customField(fieldKey, value) {
  const apiName = process.env[`ZOHO_DEAL_FIELD_${fieldKey}`];
  return apiName ? { [apiName]: value } : {};
}

function optionalCustomFields(order = {}) {
  const vendor = vendorDetails(order);
  return {
    ...customField('CON_NOTE', order.conNote),
    ...customField('PORTAL_ORDER_ID', order.id),
    ...customField('SUPPLIER', vendor.name),
    ...customField('PICKUP_ADDRESS', vendor.address),
    ...customField('DROP_ADDRESS', order.dropLocation || order.deliveryAddress),
    ...customField('ITEM_SUMMARY', itemSummary(order)),
    ...customField('TYRE_QTY', numberOrBlank(order.tyreQty || order.tyres || order.tyreCount) || undefined),
    ...customField('URGENCY', order.urgency),
    ...customField('PREFERRED_WINDOW', preferredWindow(order)),
  };
}

async function createDeal(order = {}) {
  const token = await accessTokenForCrm();
  if (!token) {
    return {
      success: true,
      mode: 'placeholder',
      message: 'Pickup request queued. Add Zoho CRM credentials to create Deals live.',
    };
  }

  const client = clientFromOrder(order);
  const clientSync = client.email ? await upsertCrmClient({ token, client }) : {};
  const closingDate = new Date(order.preferredDate || order.submittedAt || Date.now()).toISOString().slice(0, 10);
  const amount = money(order.totalPrice || order.price);

  const dealPayload = compact({
    Deal_Name: dealName(order),
    Stage: dealStage('ORDER_PLACED'),
    Pipeline: dealPipeline(),
    Closing_Date: closingDate,
    Amount: amount || undefined,
    Account_Name: clientSync.accountId ? { id: clientSync.accountId } : undefined,
    Contact_Name: clientSync.contactId ? { id: clientSync.contactId } : undefined,
    Description: dealDescription(order),
    ...optionalCustomFields(order),
  });

  const deal = await zohoRequest({
    token,
    method: 'POST',
    path: `/crm/${zohoCrmVersion}/Deals`,
    body: { data: [dealPayload] },
  });

  return {
    success: true,
    mode: 'live',
    dealId: zohoId(deal),
    stage: dealStage('ORDER_PLACED'),
    pipeline: dealPipeline(),
    amount,
    summary: {
      conNote: order.conNote,
      businessName: client.businessName,
      vendor: vendorDetails(order).name,
      itemSummary: itemSummary(order),
      dropLocation: order.dropLocation || client.deliveryAddress,
    },
    message: 'Pickup request created as a structured Zoho CRM Deal.',
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { message: 'Method not allowed.' });

  try {
    const { order } = parseBody(event);
    return response(200, await createDeal(order || {}));
  } catch (error) {
    return response(500, { success: false, message: error instanceof Error ? error.message : 'Could not create Zoho CRM Deal.' });
  }
}
