import { createHmac, timingSafeEqual } from 'node:crypto';

const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const tokenCache = new Map();
const staffEmails = new Set(['admin@motoandco.com.au', 'jake@motoandco.com.au']);
const sessionCookieName = 'motoco_session';

function response(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function sessionSecret() {
  return process.env.SESSION_SECRET || process.env.ZOHO_CLIENT_SECRET || '';
}

function signSessionPayload(payload) {
  const secret = sessionSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseCookies(header = '') {
  return Object.fromEntries(String(header || '').split(';').map(part => {
    const [name, ...value] = part.trim().split('=');
    return [name, value.join('=')];
  }).filter(([name]) => name));
}

function sessionFromEvent(event) {
  const cookies = parseCookies(event.headers?.cookie || event.headers?.Cookie || '');
  const token = cookies[sessionCookieName];
  if (!token) return null;

  const [payload, signature] = token.split('.');
  if (!payload || !signature || !safeEqual(signature, signSessionPayload(payload))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!session.exp || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function normaliseEmail(email) {
  return String(email || '').trim().toLowerCase();
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

function dealBelongsToClient(deal, contact) {
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

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});

  try {
    const session = sessionFromEvent(event);
    if (!session) {
      return response(200, { orders: [], mode: 'unauthenticated' });
    }

    const { role, email } = session;
    const cleanEmail = normaliseEmail(email);
    if (!cleanEmail || !['client', 'admin', 'driver'].includes(role || '')) {
      return response(200, { orders: [], mode: 'unauthenticated' });
    }
    if (role !== 'client' && !staffEmails.has(cleanEmail)) {
      return response(200, { orders: [], mode: 'unauthorised' });
    }

    const token = await accessTokenForCRM();
    if (!token) return response(200, { orders: [], mode: 'placeholder' });

    const contact = role === 'client' ? await contactByEmail(token, cleanEmail) : null;
    if (role === 'client' && !contact) return response(200, { orders: [], mode: 'live' });

    const pipeline = dealPipeline();
    const stages = new Set([
      dealStage('ORDER_PLACED'),
      dealStage('PICKED_UP'),
      dealStage('IN_TRANSIT'),
      dealStage('DELIVERED'),
      dealStage('INVOICED'),
      dealStage('PAID'),
    ]);

    const orders = (await fetchDeals(token))
      .filter(deal => !deal.Pipeline || deal.Pipeline === pipeline || deal.Pipeline?.display_value === pipeline || stages.has(deal.Stage))
      .filter(deal => role !== 'client' || dealBelongsToClient(deal, contact))
      .map(deal => dealToOrder(deal, role === 'client' ? cleanEmail : ''));

    return response(200, { orders, mode: 'live' });
  } catch (error) {
    return response(500, { message: error instanceof Error ? error.message : 'Could not pull Zoho Deals.' });
  }
}
