const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();
const staffEmails = new Set(['admin@motoandco.com.au', 'jake@motoandco.com.au']);

const fallbackUsers = [
  { id: 'admin', name: 'Super Admin', email: 'admin@motoandco.com.au', role: 'admin' },
  { id: 'drv1', name: 'Jake Morrow', email: 'jake@motoandco.com.au', role: 'driver' },
];

function response(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': process.env.MOTOCO_ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,OPTIONS',
    },
    body: JSON.stringify(body),
  };
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

function appStatusFromDealStage(stage) {
  if (stage === dealStage('PICKED_UP')) return 'Picked Up';
  if (stage === dealStage('IN_TRANSIT')) return 'In Transit';
  if (stage === dealStage('DELIVERED')) return 'Delivered';
  if (stage === dealStage('INVOICED')) return 'Invoiced';
  if (stage === dealStage('PAID')) return 'Paid - future use';
  return 'Order Placed';
}

function descriptionField(description = '', label) {
  const match = String(description).match(new RegExp(`^${label}:\\s*(.+)$`, 'im'));
  const value = match?.[1]?.trim();
  return value && value !== 'Not supplied' ? value : '';
}

async function accessTokenForCRM() {
  const directToken = process.env.ZOHO_CRM_ACCESS_TOKEN;
  const refreshToken = process.env.ZOHO_CRM_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN;
  const clientId = process.env.ZOHO_CLIENT_ID;
  const clientSecret = process.env.ZOHO_CLIENT_SECRET;

  if (!refreshToken) return directToken;
  if (!clientId || !clientSecret) return directToken;

  const cached = tokenCache.get(refreshToken);
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

  tokenCache.set(refreshToken, {
    token: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function zohoRequest({ path, token }) {
  const res = await fetch(`${zohoApiDomain}${path}`, {
    headers: compact({ Authorization: `Zoho-oauthtoken ${token}` }),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = data?.message || data?.data?.[0]?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Zoho request failed: ${detail}`);
  }
  return data;
}

async function contactByEmail(token, email) {
  if (!email) return null;
  const result = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts/search?email=${encodeURIComponent(normaliseEmail(email))}`,
  });
  return (result.data || [])[0] || null;
}

async function fetchContacts(token) {
  const contacts = [];
  for (let page = 1; page <= 5; page += 1) {
    const result = await zohoRequest({
      token,
      path: `/crm/${zohoCrmVersion}/Contacts?fields=${encodeURIComponent('Full_Name,First_Name,Last_Name,Email,Phone,Account_Name,Mailing_Street')}&per_page=200&page=${page}`,
    });
    contacts.push(...(result.data || []));
    if (!result.info?.more_records) break;
  }
  return contacts;
}

async function fetchDeals(token) {
  const fieldSets = [
    'Deal_Name,Stage,Pipeline,Closing_Date,Amount,Account_Name,Contact_Name,Description,Created_Time,Modified_Time',
    'Deal_Name,Stage,Closing_Date,Amount,Account_Name,Contact_Name,Description,Created_Time,Modified_Time',
  ];

  let lastError;
  for (const fields of fieldSets) {
    try {
      const deals = [];
      for (let page = 1; page <= 5; page += 1) {
        const result = await zohoRequest({
          token,
          path: `/crm/${zohoCrmVersion}/Deals?fields=${encodeURIComponent(fields)}&per_page=200&page=${page}`,
        });
        deals.push(...(result.data || []));
        if (!result.info?.more_records) break;
      }
      return deals;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function clientFromContact(contact) {
  const { firstName, lastName } = splitName(contact.Full_Name || contact.Email || 'Client');
  return {
    id: `crm_${contact.id}`,
    role: 'client',
    name: contact.Full_Name || [firstName, lastName].filter(Boolean).join(' ') || contact.Email,
    email: contact.Email || '',
    phone: contact.Phone || '',
    businessName: contact.Account_Name?.name || contact.Full_Name || contact.Email || 'Client',
    deliveryAddress: contact.Mailing_Street || '',
    vendors: [],
    zohoContactId: contact.id,
    zohoAccountId: contact.Account_Name?.id,
  };
}

function dealBelongsToContact(deal, contact) {
  return (
    deal.Contact_Name?.id === contact?.id ||
    deal.Account_Name?.id === contact?.Account_Name?.id ||
    deal.Contact_Name?.name === contact?.Full_Name ||
    deal.Account_Name?.name === contact?.Account_Name?.name
  );
}

function dealToOrder(deal, clientEmail = '') {
  const description = deal.Description || '';
  const accountName = deal.Account_Name?.name || '';
  const contactName = deal.Contact_Name?.name || '';
  const conNote = descriptionField(description, 'Con note') || deal.Deal_Name?.split(' - ').at(-1) || deal.id;

  return {
    id: `zoho_${deal.id}`,
    zohoDealId: deal.id,
    zohoDealStage: deal.Stage,
    zohoDealPipeline: deal.Pipeline,
    conNote,
    vendor: descriptionField(description, 'Supplier') || 'Supplier',
    notes: descriptionField(description, 'Notes'),
    urgency: descriptionField(description, 'Priority') === 'asap' ? 'asap' : 'next-run',
    preferredDate: deal.Closing_Date || String(deal.Created_Time || new Date().toISOString()).slice(0, 10),
    preferredTime: '09:00',
    dropLocation: descriptionField(description, 'Delivery address') || '',
    clientId: deal.Contact_Name?.id ? `crm_${deal.Contact_Name.id}` : deal.Account_Name?.id ? `crm_account_${deal.Account_Name.id}` : '',
    clientName: contactName || accountName || 'Client',
    businessName: accountName || contactName || 'Client',
    clientEmail,
    clientPhone: '',
    status: appStatusFromDealStage(deal.Stage),
    price: Number(deal.Amount || 0),
    submittedAt: deal.Created_Time || new Date().toISOString(),
  };
}

function parseViewer(event) {
  const query = event.queryStringParameters || {};
  return {
    role: String(query.role || '').trim(),
    email: normaliseEmail(query.email),
  };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'GET') return response(405, { message: 'Method not allowed.' });

  try {
    const viewer = parseViewer(event);
    const role = ['client', 'admin', 'driver'].includes(viewer.role) ? viewer.role : '';
    const email = viewer.email;

    if (!role || !email) {
      return response(200, { store: { users: fallbackUsers, clients: [], orders: [], deliveries: [] }, mode: 'unauthenticated' });
    }

    if (role !== 'client' && !staffEmails.has(email)) {
      return response(200, { store: { users: fallbackUsers, clients: [], orders: [], deliveries: [] }, mode: 'unauthorised' });
    }

    const token = await accessTokenForCRM();
    if (!token) {
      return response(200, { store: { users: fallbackUsers, clients: [], orders: [], deliveries: [] }, mode: 'placeholder' });
    }

    const pipeline = dealPipeline();
    const stages = new Set([
      dealStage('ORDER_PLACED'),
      dealStage('PICKED_UP'),
      dealStage('IN_TRANSIT'),
      dealStage('DELIVERED'),
      dealStage('INVOICED'),
      dealStage('PAID'),
    ]);

    const contact = role === 'client' ? await contactByEmail(token, email) : null;
    if (role === 'client' && !contact) {
      return response(200, { store: { users: fallbackUsers, clients: [], orders: [], deliveries: [] }, mode: 'live' });
    }

    const allDeals = await fetchDeals(token);
    const pipelineDeals = allDeals.filter(deal => !deal.Pipeline || deal.Pipeline === pipeline || deal.Pipeline?.display_value === pipeline || stages.has(deal.Stage));
    const visibleDeals = role === 'client' ? pipelineDeals.filter(deal => dealBelongsToContact(deal, contact)) : pipelineDeals;
    const clients = role === 'client'
      ? [clientFromContact(contact)]
      : (await fetchContacts(token)).map(clientFromContact);

    const orders = visibleDeals.map(deal => dealToOrder(deal, role === 'client' ? email : ''));
    return response(200, { store: { users: fallbackUsers, clients, orders, deliveries: [] }, mode: 'live' });
  } catch (error) {
    return response(500, { message: error instanceof Error ? error.message : 'Could not load live workspace.' });
  }
}
