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

function normalise(value) {
  return String(value || '').trim();
}

function safeName(value) {
  return normalise(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'delivery';
}

function deliveryProofId(delivery = {}) {
  return normalise(delivery.id || `${delivery.zohoDealId}-${delivery.completedAt || delivery.conNote || 'delivery'}`);
}

function signatureDataUrl(delivery = {}) {
  return normalise(
    delivery.signatureData ||
    delivery.signatureDataUrl ||
    delivery.signatureImage ||
    delivery.signaturePreview ||
    delivery.signature ||
    ''
  );
}

function hasSignatureAttachmentCandidate(delivery = {}) {
  return Boolean(delivery.zohoDealId && signatureDataUrl(delivery).startsWith('data:image/'));
}

function parseSignatureImage(delivery = {}) {
  const dataUrl = signatureDataUrl(delivery);
  const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) return null;

  const mimeType = match[1].toLowerCase();
  const extension = mimeType.includes('jpeg') ? 'jpg' : mimeType.split('/')[1]?.replace(/[^a-z0-9]/gi, '') || 'png';
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length) return null;

  const fileName = [
    'moto-co-signature',
    safeName(delivery.conNote),
    safeName(delivery.receiverName),
    safeName(deliveryProofId(delivery)),
  ].filter(Boolean).join('-') + `.${extension}`;

  return { buffer, mimeType, fileName };
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

async function zohoCrmJson({ path, token, method = 'GET', body }) {
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
    throw new Error(`Zoho CRM request failed: ${detail}`);
  }
  return data;
}

async function uploadDealAttachment({ token, dealId, image }) {
  const form = new FormData();
  form.append('file', new Blob([image.buffer], { type: image.mimeType }), image.fileName);

  const res = await fetch(`${zohoApiDomain}/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(dealId)}/Attachments`, {
    method: 'POST',
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
    body: form,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const detail = data?.message || data?.data?.[0]?.message || text || `${res.status} ${res.statusText}`;
    throw new Error(`Zoho CRM attachment upload failed: ${detail}`);
  }
  return data?.data?.[0]?.details?.id || data?.data?.[0]?.details?.attachment_id || '';
}

async function syncSignatureAttachment({ token, delivery }) {
  if (!hasSignatureAttachmentCandidate(delivery)) return { skipped: true, reason: 'no-signature-image' };

  const image = parseSignatureImage(delivery);
  if (!image) return { skipped: true, reason: 'invalid-signature-image' };

  const proofId = deliveryProofId(delivery);
  const marker = `Signature attachment proof id: ${proofId}`;
  const deal = await zohoCrmJson({
    token,
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(delivery.zohoDealId)}?fields=${encodeURIComponent('Description')}`,
  });
  const existing = deal?.data?.[0] || {};
  const currentDescription = existing.Description || '';
  if (currentDescription.includes(marker)) return { skipped: true, reason: 'already-attached', proofId };

  const attachmentId = await uploadDealAttachment({ token, dealId: delivery.zohoDealId, image });
  const nextDescription = [
    currentDescription,
    [
      '--- Moto & Co signature attachment ---',
      marker,
      `Signature file: ${image.fileName}`,
      `Signature attachment id: ${attachmentId || 'Created in CRM'}`,
      `Attached at: ${new Date().toISOString()}`,
    ].join('\n'),
  ].filter(Boolean).join('\n\n');

  await zohoCrmJson({
    token,
    method: 'PUT',
    path: `/crm/${zohoCrmVersion}/Deals/${encodeURIComponent(delivery.zohoDealId)}`,
    body: { data: [{ Description: nextDescription }] },
  });

  return { attached: true, proofId, attachmentId, fileName: image.fileName };
}

async function syncSignatures(payload = {}) {
  const token = await accessTokenForCrm();
  if (!token) {
    return { success: false, mode: 'setup-required', message: 'No Zoho CRM token available for signature attachment upload.' };
  }

  const deliveries = Array.isArray(payload.deliveries)
    ? payload.deliveries
    : Array.isArray(payload.store?.deliveries)
      ? payload.store.deliveries
      : [];

  const candidates = deliveries.filter(hasSignatureAttachmentCandidate);
  const results = [];
  for (const delivery of candidates) {
    try {
      results.push(await syncSignatureAttachment({ token, delivery }));
    } catch (error) {
      results.push({
        attached: false,
        proofId: deliveryProofId(delivery),
        dealId: delivery.zohoDealId,
        message: error instanceof Error ? error.message : 'Could not attach signature to CRM Deal.',
      });
    }
  }

  return { success: true, mode: 'live', checked: deliveries.length, candidates: candidates.length, results };
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') return response(204, {});
  if (event.httpMethod !== 'POST') return response(405, { message: 'Method not allowed.' });

  try {
    return response(200, await syncSignatures(parseBody(event)));
  } catch (error) {
    return response(500, { success: false, message: error instanceof Error ? error.message : 'Could not sync delivery signatures.' });
  }
}
