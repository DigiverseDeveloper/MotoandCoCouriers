import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const envPath = resolve(root, '.env.local');

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
  }
}

const PORT = Number(process.env.ZOHO_PROXY_PORT ?? 8787);
const tokenCache = {
  accessToken: '',
  apiDomain: process.env.ZOHO_API_DOMAIN ?? 'https://www.zohoapis.com.au',
  expiresAt: 0,
};

const forms = {
  customers: process.env.ZOHO_FORM_CUSTOMERS ?? 'Customers',
  drivers: process.env.ZOHO_FORM_DRIVERS ?? 'Drivers',
  jobs: process.env.ZOHO_FORM_JOBS ?? 'Delivery_Jobs',
  statusHistory: process.env.ZOHO_FORM_STATUS_HISTORY ?? 'Status_History',
};

const reports = {
  customers: process.env.ZOHO_REPORT_CUSTOMERS ?? 'All_Customers_Report',
  drivers: process.env.ZOHO_REPORT_DRIVERS ?? 'All_Drivers_Report',
  jobs: process.env.ZOHO_REPORT_JOBS ?? 'All_Jobs_Management_Report',
};

const fields = {
  customers: ['ID', 'Name', 'Email', 'Phone', 'Company', 'Created_Date'],
  drivers: ['ID', 'Name', 'Email', 'Phone', 'Vehicle_Type', 'Status', 'Rating', 'Completed_Jobs'],
  jobs: [
    'ID',
    'Customer_ID',
    'Driver_ID',
    'Status',
    'Pickup_Address',
    'Pickup_Contact_Name',
    'Pickup_Contact_Phone',
    'Pickup_Time',
    'Delivery_Address',
    'Delivery_Contact_Name',
    'Delivery_Contact_Phone',
    'Package_Size',
    'Package_Description',
    'Special_Instructions',
    'Vehicle_Type',
    'Urgency',
    'Estimated_Price',
    'Actual_Price',
    'Created_Date',
    'Updated_Date',
  ],
};

function requireConfig() {
  const missing = [
    'ZOHO_CLIENT_ID',
    'ZOHO_CLIENT_SECRET',
    'ZOHO_REFRESH_TOKEN',
    'ZOHO_CREATOR_OWNER',
    'ZOHO_CREATOR_APP',
  ].filter((key) => !process.env[key]);

  if (missing.length > 0 && !process.env.ZOHO_ACCESS_TOKEN) {
    throw new Error(`Missing Zoho configuration: ${missing.join(', ')}`);
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Access-Control-Allow-Origin': process.env.ZOHO_ALLOWED_ORIGIN ?? '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Content-Type': 'application/json',
  });
  res.end(body);
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function escapeCriteria(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function idCriteria(field, id) {
  return /^[0-9]+$/.test(String(id))
    ? `${field} == ${id}`
    : `${field} == "${escapeCriteria(id)}"`;
}

function anyIdCriteria(field, ids) {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return undefined;
  return uniqueIds.map((id) => idCriteria(field, id)).join(' || ');
}

async function getAccess() {
  if (process.env.ZOHO_ACCESS_TOKEN) {
    tokenCache.accessToken = process.env.ZOHO_ACCESS_TOKEN;
    tokenCache.apiDomain = process.env.ZOHO_API_DOMAIN ?? tokenCache.apiDomain;
    tokenCache.expiresAt = Date.now() + 55 * 60 * 1000;
    return tokenCache;
  }

  if (tokenCache.accessToken && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache;
  }

  const accountsUrl = (process.env.ZOHO_ACCOUNTS_URL ?? 'https://accounts.zoho.com.au').replace(/\/$/, '');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
  });

  const response = await fetch(`${accountsUrl}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description ?? payload.error ?? 'Unable to refresh Zoho access token.');
  }

  tokenCache.accessToken = payload.access_token;
  tokenCache.apiDomain = payload.api_domain ?? tokenCache.apiDomain;
  tokenCache.expiresAt = Date.now() + Number(payload.expires_in ?? 3600) * 1000;
  return tokenCache;
}

function creatorUrl(kind, linkName, recordId) {
  const owner = encodeURIComponent(process.env.ZOHO_CREATOR_OWNER);
  const app = encodeURIComponent(process.env.ZOHO_CREATOR_APP);
  const path = `/creator/v2.1/data/${owner}/${app}/${kind}/${encodeURIComponent(linkName)}`;
  return `${tokenCache.apiDomain}${recordId ? `${path}/${encodeURIComponent(recordId)}` : path}`;
}

async function zohoRequest(url, init = {}) {
  requireConfig();
  const { accessToken } = await getAccess();
  const headers = {
    Authorization: `Zoho-oauthtoken ${accessToken}`,
    accept: 'application/json',
    ...(process.env.ZOHO_ENVIRONMENT ? { environment: process.env.ZOHO_ENVIRONMENT } : {}),
    ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.headers ?? {}),
  };

  const response = await fetch(url, { ...init, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? `Zoho request failed with ${response.status}.`);
  }

  return payload;
}

async function getRecords(reportName, selectedFields, criteria, maxRecords = 200) {
  await getAccess();
  const url = new URL(creatorUrl('report', reportName));
  url.searchParams.set('field_config', 'custom');
  url.searchParams.set('fields', selectedFields.join(','));
  url.searchParams.set('max_records', String(maxRecords));
  if (criteria) url.searchParams.set('criteria', criteria);

  const payload = await zohoRequest(url.toString());
  return Array.isArray(payload.data) ? payload.data : [];
}

async function addRecord(formName, data) {
  await getAccess();
  return zohoRequest(creatorUrl('form', formName), {
    method: 'POST',
    body: JSON.stringify({ data: [data] }),
  });
}

async function updateRecord(reportName, recordId, data) {
  await getAccess();
  return zohoRequest(creatorUrl('report', reportName, recordId), {
    method: 'PATCH',
    body: JSON.stringify({ data }),
  });
}

const text = (value, fallback = '') => {
  if (value == null) return fallback;
  if (typeof value === 'object' && 'display_value' in value) return String(value.display_value ?? fallback);
  return String(value);
};

const numberValue = (value, fallback = 0) => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const lookupId = (value) => {
  if (value == null) return undefined;
  if (typeof value === 'object') return text(value.ID ?? value.id ?? value.value ?? value.display_value, undefined);
  return text(value, undefined);
};

function customerFromZoho(record) {
  return {
    id: text(record.ID ?? record.Customer_ID),
    name: text(record.Name),
    email: text(record.Email),
    phone: text(record.Phone),
    company: text(record.Company) || undefined,
    createdAt: text(record.Created_Date ?? record.Added_Time, new Date().toISOString()),
  };
}

function driverFromZoho(record) {
  return {
    id: text(record.ID ?? record.Driver_ID),
    name: text(record.Name),
    email: text(record.Email),
    phone: text(record.Phone),
    vehicleType: text(record.Vehicle_Type, 'Motorcycle'),
    status: text(record.Status, 'Offline'),
    rating: numberValue(record.Rating),
    completedJobs: numberValue(record.Completed_Jobs),
  };
}

function jobFromZoho(record) {
  const createdAt = text(record.Created_Date ?? record.Added_Time, new Date().toISOString());
  const updatedAt = text(record.Updated_Date ?? record.Modified_Time, createdAt);
  const status = text(record.Status, 'Pending');

  return {
    id: text(record.ID ?? record.Job_ID),
    customerId: lookupId(record.Customer_ID) ?? '',
    driverId: lookupId(record.Driver_ID),
    status,
    pickupAddress: text(record.Pickup_Address),
    pickupContactName: text(record.Pickup_Contact_Name),
    pickupContactPhone: text(record.Pickup_Contact_Phone),
    pickupTime: text(record.Pickup_Time, createdAt),
    deliveryAddress: text(record.Delivery_Address),
    deliveryContactName: text(record.Delivery_Contact_Name),
    deliveryContactPhone: text(record.Delivery_Contact_Phone),
    packageSize: text(record.Package_Size, 'Medium'),
    packageDescription: text(record.Package_Description),
    specialInstructions: text(record.Special_Instructions) || undefined,
    vehicleType: text(record.Vehicle_Type, 'Motorcycle'),
    urgency: text(record.Urgency, 'Standard'),
    estimatedPrice: numberValue(record.Estimated_Price),
    actualPrice: text(record.Actual_Price) ? numberValue(record.Actual_Price) : undefined,
    createdAt,
    updatedAt,
    statusHistory: [{ status, timestamp: updatedAt }],
  };
}

function redactOfferContacts(job) {
  return {
    ...job,
    pickupContactName: '',
    pickupContactPhone: '',
    deliveryContactName: '',
    deliveryContactPhone: '',
    specialInstructions: undefined,
  };
}

function jobToZoho(job) {
  return {
    Customer_ID: job.customerId,
    Driver_ID: job.driverId,
    Status: job.status,
    Pickup_Address: job.pickupAddress,
    Pickup_Contact_Name: job.pickupContactName,
    Pickup_Contact_Phone: job.pickupContactPhone,
    Pickup_Time: job.pickupTime,
    Delivery_Address: job.deliveryAddress,
    Delivery_Contact_Name: job.deliveryContactName,
    Delivery_Contact_Phone: job.deliveryContactPhone,
    Package_Size: job.packageSize,
    Package_Description: job.packageDescription,
    Special_Instructions: job.specialInstructions,
    Vehicle_Type: job.vehicleType,
    Urgency: job.urgency,
    Estimated_Price: job.estimatedPrice,
  };
}

function createdRecordId(payload) {
  const result = Array.isArray(payload.result) ? payload.result[0] : payload.result;
  const data = Array.isArray(result?.data) ? result.data[0] : result?.data;
  return text(data?.ID ?? data?.id ?? data?.record_id ?? result?.ID ?? result?.id);
}

async function getJobById(id) {
  const records = await getRecords(reports.jobs, fields.jobs, idCriteria('ID', id), 1);
  if (!records[0]) throw new Error('Job not found in Zoho.');
  return jobFromZoho(records[0]);
}

async function handleLogin(body) {
  if (body.role === 'admin') {
    return { id: 'admin', role: 'admin', name: 'Admin' };
  }

  const reportName = body.role === 'driver' ? reports.drivers : reports.customers;
  const selectedFields = body.role === 'driver' ? fields.drivers : fields.customers;
  const records = await getRecords(reportName, selectedFields, `Email == "${escapeCriteria(body.email)}"`, 1);

  if (!records[0]) throw new Error('No matching Zoho user was found.');
  const person = body.role === 'driver' ? driverFromZoho(records[0]) : customerFromZoho(records[0]);
  return { id: person.id, role: body.role, name: person.name };
}

async function handleRegister(body) {
  if (body.role === 'driver') {
    const response = await addRecord(forms.drivers, {
      Name: body.name,
      Email: body.email,
      Phone: body.phone,
      Vehicle_Type: 'Motorcycle',
      Status: 'Offline',
      Rating: 0,
      Completed_Jobs: 0,
    });
    return { id: createdRecordId(response), role: 'driver', name: body.name };
  }

  const response = await addRecord(forms.customers, {
    Name: body.name,
    Email: body.email,
    Phone: body.phone,
    Company: body.company,
    Created_Date: new Date().toISOString(),
  });
  return { id: createdRecordId(response), role: 'customer', name: body.name };
}

async function handleWorkspace(url) {
  const role = url.searchParams.get('role');
  const userId = url.searchParams.get('userId');

  if (role === 'admin') {
    const [customers, drivers, jobs] = await Promise.all([
      getRecords(reports.customers, fields.customers).then((records) => records.map(customerFromZoho)),
      getRecords(reports.drivers, fields.drivers).then((records) => records.map(driverFromZoho)),
      getRecords(reports.jobs, fields.jobs).then((records) => records.map(jobFromZoho)),
    ]);
    return { customers, drivers, jobs };
  }

  if (role === 'customer') {
    const [customerRecords, jobRecords] = await Promise.all([
      getRecords(reports.customers, fields.customers, idCriteria('ID', userId), 1),
      getRecords(reports.jobs, fields.jobs, idCriteria('Customer_ID', userId)),
    ]);
    const jobs = jobRecords.map(jobFromZoho);
    const driverCriteria = anyIdCriteria('ID', jobs.map((job) => job.driverId));
    const drivers = driverCriteria
      ? await getRecords(reports.drivers, fields.drivers, driverCriteria).then((records) => records.map(driverFromZoho))
      : [];
    return { customers: customerRecords.map(customerFromZoho), drivers, jobs };
  }

  const [driverRecords, jobRecords] = await Promise.all([
    getRecords(reports.drivers, fields.drivers, idCriteria('ID', userId), 1),
    getRecords(reports.jobs, fields.jobs, `${idCriteria('Driver_ID', userId)} || Status == "Pending"`),
  ]);
  const jobs = jobRecords
    .map(jobFromZoho)
    .map((job) => (job.driverId === userId ? job : redactOfferContacts(job)));
  return { customers: [], drivers: driverRecords.map(driverFromZoho), jobs };
}

async function handleCreateJob(body) {
  const response = await addRecord(forms.jobs, jobToZoho(body));
  const id = createdRecordId(response);
  await addRecord(forms.statusHistory, {
    Job_ID: id,
    Status: 'Pending',
    Timestamp: new Date().toISOString(),
  }).catch(() => undefined);
  return id ? getJobById(id) : { ...body, id: '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), statusHistory: [] };
}

async function handleStatus(jobId, body) {
  const existingJob = await getJobById(jobId).catch(() => undefined);
  const update = {
    Status: body.status,
    Updated_Date: new Date().toISOString(),
    ...(body.status === 'Delivered' && existingJob ? { Actual_Price: existingJob.actualPrice ?? existingJob.estimatedPrice } : {}),
  };
  await updateRecord(reports.jobs, jobId, update);
  if (body.status === 'Delivered' && existingJob?.driverId) {
    await updateRecord(reports.drivers, existingJob.driverId, { Status: 'Available' }).catch(() => undefined);
  }
  await addRecord(forms.statusHistory, {
    Job_ID: jobId,
    Status: body.status,
    Timestamp: update.Updated_Date,
    Note: body.note,
  }).catch(() => undefined);
  return getJobById(jobId);
}

async function handleAssignment(jobId, body) {
  const now = new Date().toISOString();
  await updateRecord(reports.jobs, jobId, {
    Driver_ID: body.driverId,
    Status: 'Assigned',
    Updated_Date: now,
  });
  await updateRecord(reports.drivers, body.driverId, { Status: 'Busy' }).catch(() => undefined);
  await addRecord(forms.statusHistory, {
    Job_ID: jobId,
    Status: 'Assigned',
    Timestamp: now,
  }).catch(() => undefined);
  return getJobById(jobId);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.pathname.replace(/^\/api\/zoho/, '');

    if (req.method === 'GET' && path === '/health') {
      return json(res, 200, { ok: true, region: tokenCache.apiDomain });
    }

    if (req.method === 'POST' && path === '/session/login') {
      return json(res, 200, await handleLogin(await readJson(req)));
    }

    if (req.method === 'POST' && path === '/session/register') {
      return json(res, 200, await handleRegister(await readJson(req)));
    }

    if (req.method === 'GET' && path === '/workspace') {
      return json(res, 200, await handleWorkspace(url));
    }

    if (req.method === 'POST' && path === '/jobs') {
      return json(res, 200, await handleCreateJob(await readJson(req)));
    }

    const statusMatch = path.match(/^\/jobs\/([^/]+)\/status$/);
    if (req.method === 'PATCH' && statusMatch) {
      return json(res, 200, await handleStatus(decodeURIComponent(statusMatch[1]), await readJson(req)));
    }

    const assignmentMatch = path.match(/^\/jobs\/([^/]+)\/assignment$/);
    if (req.method === 'PATCH' && assignmentMatch) {
      return json(res, 200, await handleAssignment(decodeURIComponent(assignmentMatch[1]), await readJson(req)));
    }

    return json(res, 404, { message: 'Not found.' });
  } catch (error) {
    return json(res, 500, { message: error instanceof Error ? error.message : 'Zoho proxy failed.' });
  }
});

server.listen(PORT, () => {
  console.log(`Zoho proxy listening on http://localhost:${PORT}/api/zoho`);
});
