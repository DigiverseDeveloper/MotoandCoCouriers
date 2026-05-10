import type { Customer, Driver, Job, JobStatus, NewJobInput, VehicleType } from '../../domain/types';

type ZohoRecord = Record<string, unknown>;

const text = (value: unknown, fallback = ''): string => {
  if (value == null) return fallback;
  if (typeof value === 'object' && 'display_value' in value) {
    return String((value as { display_value?: unknown }).display_value ?? fallback);
  }
  return String(value);
};

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(text(value));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const lookupId = (value: unknown) => {
  if (value == null) return undefined;
  if (typeof value === 'object') {
    const record = value as ZohoRecord;
    return optionalText(record.ID ?? record.id ?? record.value ?? record.display_value);
  }
  return optionalText(value);
};

const optionalText = (value: unknown) => {
  const result = text(value).trim();
  return result.length > 0 ? result : undefined;
};

export const zohoReports = {
  customers: 'All_Customers_Report',
  drivers: 'All_Drivers_Report',
  jobs: 'All_Jobs_Management_Report',
  statusHistory: 'Status_History_Report',
};

export const zohoForms = {
  customers: 'Customers',
  drivers: 'Drivers',
  jobs: 'Delivery_Jobs',
  statusHistory: 'Status_History',
};

export const zohoFields = {
  customers: [
    'ID',
    'Name',
    'Email',
    'Phone',
    'Company',
    'Created_Date',
  ],
  drivers: [
    'ID',
    'Name',
    'Email',
    'Phone',
    'Vehicle_Type',
    'Status',
    'Rating',
    'Completed_Jobs',
  ],
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

export function fromZohoCustomer(record: ZohoRecord): Customer {
  return {
    id: text(record.ID ?? record.Customer_ID),
    name: text(record.Name),
    email: text(record.Email),
    phone: text(record.Phone),
    company: optionalText(record.Company),
    createdAt: text(record.Created_Date ?? record.Added_Time, new Date().toISOString()),
  };
}

export function fromZohoDriver(record: ZohoRecord): Driver {
  return {
    id: text(record.ID ?? record.Driver_ID),
    name: text(record.Name),
    email: text(record.Email),
    phone: text(record.Phone),
    vehicleType: text(record.Vehicle_Type, 'Motorcycle') as VehicleType,
    status: text(record.Status, 'Offline') as Driver['status'],
    rating: numberValue(record.Rating),
    completedJobs: numberValue(record.Completed_Jobs),
  };
}

export function fromZohoJob(record: ZohoRecord): Job {
  const createdAt = text(record.Created_Date ?? record.Added_Time, new Date().toISOString());
  const updatedAt = text(record.Updated_Date ?? record.Modified_Time, createdAt);
  const status = text(record.Status, 'Pending') as JobStatus;

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
    packageSize: text(record.Package_Size, 'Medium') as Job['packageSize'],
    packageDescription: text(record.Package_Description),
    specialInstructions: optionalText(record.Special_Instructions),
    vehicleType: text(record.Vehicle_Type, 'Motorcycle') as VehicleType,
    urgency: text(record.Urgency, 'Standard') as Job['urgency'],
    estimatedPrice: numberValue(record.Estimated_Price),
    actualPrice: optionalText(record.Actual_Price) ? numberValue(record.Actual_Price) : undefined,
    createdAt,
    updatedAt,
    statusHistory: [{ status, timestamp: updatedAt }],
  };
}

export function toZohoJob(job: NewJobInput): ZohoRecord {
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
