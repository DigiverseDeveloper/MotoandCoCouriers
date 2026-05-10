import { demoCustomers, demoDrivers, demoJobs } from '../../data/demoData';
import type {
  CurrentUser,
  Customer,
  DataGateway,
  Driver,
  Job,
  JobStatus,
  LoginInput,
  NewJobInput,
  RegistrationInput,
  Role,
  WorkspaceData,
} from '../../domain/types';

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const redactOfferContacts = (job: Job): Job => ({
  ...job,
  pickupContactName: '',
  pickupContactPhone: '',
  deliveryContactName: '',
  deliveryContactPhone: '',
  specialInstructions: undefined,
});

const proxyBaseUrl = (import.meta.env.VITE_ZOHO_PROXY_BASE_URL as string | undefined)?.replace(/\/$/, '');

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!proxyBaseUrl) {
    throw new Error('Zoho proxy URL is not configured.');
  }

  const response = await fetch(`${proxyBaseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.message ?? 'Zoho request failed.');
  }

  return payload as T;
}

class ZohoProxyGateway implements DataGateway {
  mode = 'zoho' as const;

  login(input: LoginInput) {
    return apiFetch<CurrentUser>('/session/login', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  }

  registerUser(role: Exclude<Role, 'admin'>, input: RegistrationInput) {
    return apiFetch<CurrentUser>('/session/register', {
      method: 'POST',
      body: JSON.stringify({ role, ...input }),
    });
  }

  fetchWorkspace(user: CurrentUser) {
    const params = new URLSearchParams({ role: user.role, userId: user.id });
    return apiFetch<WorkspaceData>(`/workspace?${params.toString()}`);
  }

  addJob(job: NewJobInput) {
    return apiFetch<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(job),
    });
  }

  updateJobStatus(jobId: string, status: JobStatus, note?: string) {
    return apiFetch<Job>(`/jobs/${encodeURIComponent(jobId)}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note }),
    });
  }

  assignDriver(jobId: string, driverId: string) {
    return apiFetch<Job>(`/jobs/${encodeURIComponent(jobId)}/assignment`, {
      method: 'PATCH',
      body: JSON.stringify({ driverId }),
    });
  }
}

class DemoGateway implements DataGateway {
  mode = 'demo' as const;
  private customers: Customer[] = clone(demoCustomers);
  private drivers: Driver[] = clone(demoDrivers);
  private jobs: Job[] = clone(demoJobs);

  async login({ role, email }: LoginInput) {
    if (role === 'admin') {
      return { id: 'admin-demo', role, name: 'Demo Admin' };
    }

    if (role === 'customer') {
      const customer = this.customers.find((item) => item.email === email) ?? this.customers[0];
      return { id: customer.id, role, name: customer.name };
    }

    const driver = this.drivers.find((item) => item.email === email) ?? this.drivers[0];
    return { id: driver.id, role, name: driver.name };
  }

  async registerUser(role: Exclude<Role, 'admin'>, input: RegistrationInput) {
    const createdAt = new Date().toISOString();

    if (role === 'customer') {
      const customer: Customer = {
        id: `c-${Date.now()}`,
        name: input.name,
        email: input.email,
        phone: input.phone,
        company: input.company,
        createdAt,
      };
      this.customers = [customer, ...this.customers];
      return { id: customer.id, role, name: customer.name };
    }

    const driver: Driver = {
      id: `d-${Date.now()}`,
      name: input.name,
      email: input.email,
      phone: input.phone,
      vehicleType: 'Motorcycle',
      status: 'Offline',
      rating: 0,
      completedJobs: 0,
    };
    this.drivers = [driver, ...this.drivers];
    return { id: driver.id, role, name: driver.name };
  }

  async fetchWorkspace(user: CurrentUser) {
    if (user.role === 'admin') {
      return {
        customers: clone(this.customers),
        drivers: clone(this.drivers),
        jobs: clone(this.jobs),
      };
    }

    if (user.role === 'customer') {
      const jobs = this.jobs.filter((job) => job.customerId === user.id);
      const driverIds = new Set(jobs.map((job) => job.driverId).filter(Boolean));
      return {
        customers: clone(this.customers.filter((customer) => customer.id === user.id)),
        drivers: clone(this.drivers.filter((driver) => driverIds.has(driver.id))),
        jobs: clone(jobs),
      };
    }

    const jobs = this.jobs
      .filter((job) => job.driverId === user.id || job.status === 'Pending')
      .map((job) => (job.driverId === user.id ? job : redactOfferContacts(job)));
    return {
      customers: [],
      drivers: clone(this.drivers.filter((driver) => driver.id === user.id)),
      jobs: clone(jobs),
    };
  }

  async addJob(job: NewJobInput) {
    const now = new Date().toISOString();
    const newJob: Job = {
      ...job,
      id: `j-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
      statusHistory: [{ status: 'Pending', timestamp: now }],
    };

    this.jobs = [newJob, ...this.jobs];
    return clone(newJob);
  }

  async updateJobStatus(jobId: string, status: JobStatus, note?: string) {
    const now = new Date().toISOString();
    let updatedJob: Job | undefined;

    this.jobs = this.jobs.map((job) => {
      if (job.id !== jobId) return job;

      const nextJob: Job = {
        ...job,
        status,
        updatedAt: now,
        actualPrice: status === 'Delivered' ? job.actualPrice ?? job.estimatedPrice : job.actualPrice,
        statusHistory: [...job.statusHistory, { status, timestamp: now, note }],
      };

      updatedJob = nextJob;
      return nextJob;
    });

    if (updatedJob?.driverId && status === 'Delivered') {
      this.drivers = this.drivers.map((driver) =>
        driver.id === updatedJob?.driverId
          ? { ...driver, status: 'Available', completedJobs: driver.completedJobs + 1 }
          : driver,
      );
    }

    if (!updatedJob) throw new Error('Job not found.');
    return clone(updatedJob);
  }

  async assignDriver(jobId: string, driverId: string) {
    const now = new Date().toISOString();
    let updatedJob: Job | undefined;

    this.jobs = this.jobs.map((job) => {
      if (job.id !== jobId) return job;

      const nextJob: Job = {
        ...job,
        driverId,
        status: 'Assigned',
        updatedAt: now,
        statusHistory: [...job.statusHistory, { status: 'Assigned', timestamp: now }],
      };

      updatedJob = nextJob;
      return nextJob;
    });

    this.drivers = this.drivers.map((driver) =>
      driver.id === driverId ? { ...driver, status: 'Busy' } : driver,
    );

    if (!updatedJob) throw new Error('Job not found.');
    return clone(updatedJob);
  }
}

export const dataGateway: DataGateway = proxyBaseUrl ? new ZohoProxyGateway() : new DemoGateway();
