export type Role = 'customer' | 'driver' | 'admin';

export type JobStatus =
  | 'Pending'
  | 'Assigned'
  | 'Accepted'
  | 'Picked Up'
  | 'In Transit'
  | 'Delivered'
  | 'Cancelled';

export type VehicleType = 'Motorcycle' | 'Van' | 'Truck';

export type PackageSize = 'Small' | 'Medium' | 'Large' | 'Extra Large';

export interface CurrentUser {
  id: string;
  role: Role;
  name: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  company?: string;
  createdAt: string;
}

export interface Driver {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicleType: VehicleType;
  status: 'Available' | 'Busy' | 'Offline';
  rating: number;
  completedJobs: number;
}

export interface Job {
  id: string;
  customerId: string;
  driverId?: string;
  status: JobStatus;

  pickupAddress: string;
  pickupContactName: string;
  pickupContactPhone: string;
  pickupTime: string;

  deliveryAddress: string;
  deliveryContactName: string;
  deliveryContactPhone: string;

  packageSize: PackageSize;
  packageDescription: string;
  specialInstructions?: string;

  vehicleType: VehicleType;
  urgency: 'Standard' | 'Express' | 'Same Day';

  estimatedPrice: number;
  actualPrice?: number;

  createdAt: string;
  updatedAt: string;

  statusHistory: {
    status: JobStatus;
    timestamp: string;
    note?: string;
  }[];
}

export type NewJobInput = Omit<Job, 'id' | 'createdAt' | 'updatedAt' | 'statusHistory'>;

export interface RegistrationInput {
  name: string;
  email: string;
  phone: string;
  company?: string;
}

export interface WorkspaceData {
  customers: Customer[];
  drivers: Driver[];
  jobs: Job[];
}

export interface LoginInput {
  role: Role;
  email: string;
  password?: string;
}

export interface DataGateway {
  mode: 'zoho' | 'demo';
  login(input: LoginInput): Promise<CurrentUser>;
  registerUser(role: Exclude<Role, 'admin'>, input: RegistrationInput): Promise<CurrentUser>;
  fetchWorkspace(user: CurrentUser): Promise<WorkspaceData>;
  addJob(job: NewJobInput): Promise<Job>;
  updateJobStatus(jobId: string, status: JobStatus, note?: string): Promise<Job>;
  assignDriver(jobId: string, driverId: string): Promise<Job>;
}
