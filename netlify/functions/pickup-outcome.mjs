const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
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

async function updatePickupOutcome({ dealId, stageKey, outcome, actualPickupAt, pickupNotes, requestedPickupDate }) {
  const token = await accessTokenForCrm();
  if (!token) throw new Error('Zoho CRM credentials are missing.');
  if (!dealId) throw new Error('Zoho Deal ID is missing.');

  const payload = compact({
    Stage: stageKey ? dealStage(stageKey) : undefined,
    Pipeline: stageKey ? dealPipeline() : undefined,
    ...pickupFields({ outcome, actualPickupAt, pickupNotes, requestedPickupDate }),
  });

  await zohoRequest({
    token,
    method: 'PUT',
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(dealId)}`,
    body: { data: [payload] },
  });

  return { success: true, mode: 'live', dealId, outcome, requestedPickupDate, message: 'Pickup outcome updated in Zoho CRM.' };
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
