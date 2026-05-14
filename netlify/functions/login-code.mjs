import { createHmac } from 'node:crypto';

const zohoAccountsUrl = (process.env.ZOHO_ACCOUNTS_URL || 'https://accounts.zoho.com.au').replace(/\/$/, '');
const zohoApiDomain = (process.env.ZOHO_API_DOMAIN || 'https://www.zohoapis.com.au').replace(/\/$/, '');
const zohoCrmVersion = process.env.ZOHO_CRM_VERSION || 'v8';
const zeptoMailApiUrl = process.env.ZEPTO_MAIL_API_URL || 'https://api.zeptomail.com/v1.1/email';
const tokenCache = new Map();
const sessionCookieName = 'motoco_session';
const sessionMaxAgeSeconds = Number(process.env.SESSION_MAX_AGE_DAYS || 60) * 24 * 60 * 60;
const codeWindowMs = 10 * 60 * 1000;

const staffUsers = [
  { id: 'admin', name: 'Super Admin', email: 'admin@motoandco.com.au', role: 'admin' },
  { id: 'driver_stephen', name: 'Stephen', email: 'stephen@motoandco.com.au', role: 'driver' },
  { id: 'driver_gmail_test', name: 'Driver Test', email: 'gcmtm12@gmail.com', role: 'driver' },
];

function response(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      ...extraHeaders,
    },
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

function sessionCookieFor(user) {
  const secret = sessionSecret();
  if (!secret || !user) return {};

  const payload = Buffer.from(JSON.stringify({
    id: user.id,
    role: user.role,
    email: normaliseEmail(user.email),
    name: user.name,
    businessName: user.businessName,
    zohoContactId: user.zohoContactId,
    zohoAccountId: user.zohoAccountId,
    zohoUserId: user.zohoUserId,
    exp: Date.now() + sessionMaxAgeSeconds * 1000,
  })).toString('base64url');
  const signature = signSessionPayload(payload);

  return {
    'Set-Cookie': `${sessionCookieName}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${sessionMaxAgeSeconds}`,
  };
}

function normaliseEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  return clean.replace(/@gmailcom$/, '@gmail.com');
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== ''));
}

function zeptoAuthorization(token) {
  const clean = String(token || '').trim();
  return clean.toLowerCase().startsWith('zoho-enczapikey ') ? clean : `Zoho-enczapikey ${clean}`;
}

function zeptoErrorMessage(res, text) {
  if (text) return text;
  return `${res.status} ${res.statusText}`.trim() || 'ZeptoMail rejected the request without a message.';
}

async function readBody(event) {
  if (!event.body) return {};
  return JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body);
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
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = data?.message || data?.data?.[0]?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Zoho request failed: ${detail}`);
  }
  return data;
}

function contactToClient(contact) {
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

function zohoUserToStaff(user, role) {
  const email = user.email || user.Email;
  return {
    id: `crm_user_${user.id}`,
    role,
    name: user.full_name || user.Full_Name || user.name || user.Name || email,
    email,
    zohoUserId: user.id,
  };
}

function findLocalStaffUser(email, role) {
  const cleanEmail = normaliseEmail(email);
  return staffUsers.find(user => normaliseEmail(user.email) === cleanEmail && (!role || role === 'client' || user.role === role)) || null;
}

async function findZohoStaffUser(role, email) {
  const token = await accessTokenForCRM();
  if (!token) return null;

  const userType = role === 'admin' ? 'AdminUsers' : 'ActiveUsers';
  const result = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/users?type=${encodeURIComponent(userType)}`,
  });

  const cleanEmail = normaliseEmail(email);
  const users = result.users || result.data || [];
  const match = users.find(user => normaliseEmail(user.email || user.Email) === cleanEmail);
  return match ? zohoUserToStaff(match, role) : null;
}

async function findUser(role, email) {
  const cleanEmail = normaliseEmail(email);
  if (!cleanEmail) return null;

  const localUser = findLocalStaffUser(cleanEmail, role);
  if (localUser) return localUser;

  if (role !== 'client') {
    try {
      return await findZohoStaffUser(role, cleanEmail);
    } catch (error) {
      throw new Error(`Could not check Zoho CRM users for ${role} login. The CRM refresh token may need the ZohoCRM.users.READ permission. ${error instanceof Error ? error.message : ''}`.trim());
    }
  }

  const token = await accessTokenForCRM();
  if (!token) return null;

  const result = await zohoRequest({
    token,
    path: `/crm/${zohoCrmVersion}/Contacts/search?email=${encodeURIComponent(cleanEmail)}`,
  });

  const contact = (result.data || [])[0];
  return contact ? contactToClient(contact) : null;
}

function loginCodeFor({ role, email, bucket }) {
  const secret = sessionSecret();
  if (!secret) throw new Error('Login code signing secret is not configured.');

  const digest = createHmac('sha256', secret)
    .update(`${role}:${normaliseEmail(email)}:${bucket}`)
    .digest();
  const value = digest.readUInt32BE(0) % 1000000;
  return String(value).padStart(6, '0');
}

function currentCodeBucket() {
  return Math.floor(Date.now() / codeWindowMs);
}

function validLoginCode({ role, email, code }) {
  const submitted = String(code || '').trim();
  if (!/^\d{6}$/.test(submitted)) return false;

  const bucket = currentCodeBucket();
  return [bucket, bucket - 1].some(candidate => loginCodeFor({ role, email, bucket: candidate }) === submitted);
}

async function sendLoginCode(email, code) {
  const from = process.env.LOGIN_EMAIL_FROM || process.env.ZEPTO_FROM_EMAIL;
  const token = process.env.ZEPTO_MAIL_TOKEN || process.env.ZEPTOMAIL_TOKEN;

  if (!from || !token) {
    console.log(`Moto & Co login code for ${email}: ${code}`);
    return { sent: false, mode: 'console' };
  }

  const res = await fetch(zeptoMailApiUrl, {
    method: 'POST',
    headers: {
      Authorization: zeptoAuthorization(token),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(compact({
      from: { address: from, name: 'Moto & Co Couriers' },
      to: [{ email_address: { address: email } }],
      subject: 'Your Moto & Co login code',
      htmlbody: `<p>Your Moto & Co login code is <strong>${code}</strong>.</p><p>This code expires in 10 minutes.</p>`,
      textbody: `Your Moto & Co login code is ${code}. This code expires in 10 minutes.`,
    })),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`Could not send login email: ${zeptoErrorMessage(res, text)}`);
  return { sent: true, mode: 'email' };
}

async function requestCode(payload) {
  const role = payload.role || 'client';
  const email = normaliseEmail(payload.email);
  const user = await findUser(role, email);
  if (!user) return response(401, { message: 'No matching account found.' });

  const code = loginCodeFor({ role, email, bucket: currentCodeBucket() });
  const delivery = await sendLoginCode(email, code);
  return response(200, { success: true, email, ...delivery });
}

async function verifyCode(payload) {
  const role = payload.role || 'client';
  const email = normaliseEmail(payload.email);

  if (!validLoginCode({ role, email, code: payload.code })) {
    return response(401, { message: 'That login code is not correct or has expired. Request a new code.' });
  }

  const user = await findUser(role, email);
  if (!user) return response(401, { message: 'No matching account found.' });

  return response(200, { user }, sessionCookieFor(user));
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});

  try {
    const action = event.path.split('/.netlify/functions/login-code/')[1] || '';
    const payload = await readBody(event);

    if (event.httpMethod === 'POST' && action === 'request-code') {
      return await requestCode(payload);
    }

    if (event.httpMethod === 'POST' && action === 'verify-code') {
      return await verifyCode(payload);
    }

    return response(404, { message: 'Not found.' });
  } catch (error) {
    return response(500, { message: error instanceof Error ? error.message : 'Login code service failed.' });
  }
}
