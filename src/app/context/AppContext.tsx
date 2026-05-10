import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { dataGateway } from '../integrations/zoho/gateway';
import type {
  CurrentUser,
  Customer,
  Driver,
  Job,
  JobStatus,
  NewJobInput,
  RegistrationInput,
  Role,
  WorkspaceData,
} from '../domain/types';

export type {
  CurrentUser,
  Customer,
  Driver,
  Job,
  JobStatus,
  NewJobInput,
  PackageSize,
  RegistrationInput,
  Role,
  VehicleType,
} from '../domain/types';

interface AppContextType {
  currentUser: CurrentUser | null;
  customers: Customer[];
  drivers: Driver[];
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  syncMode: 'zoho' | 'demo';
  login: (role: Role, email: string, password?: string) => Promise<boolean>;
  logout: () => void;
  registerUser: (role: Exclude<Role, 'admin'>, input: RegistrationInput) => Promise<boolean>;
  refresh: () => Promise<boolean>;
  addJob: (job: NewJobInput) => Promise<boolean>;
  updateJobStatus: (jobId: string, status: JobStatus, note?: string) => Promise<boolean>;
  assignDriver: (jobId: string, driverId: string) => Promise<boolean>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function applyWorkspace(
  workspace: WorkspaceData,
  setCustomers: (customers: Customer[]) => void,
  setDrivers: (drivers: Driver[]) => void,
  setJobs: (jobs: Job[]) => void,
) {
  setCustomers(workspace.customers);
  setDrivers(workspace.drivers);
  setJobs(workspace.jobs);
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hydrate = async (user: CurrentUser) => {
    const workspace = await dataGateway.fetchWorkspace(user);
    applyWorkspace(workspace, setCustomers, setDrivers, setJobs);
  };

  const runMutation = async (mutation: () => Promise<void>) => {
    if (!currentUser) return false;

    setIsLoading(true);
    setError(null);

    try {
      await mutation();
      await hydrate(currentUser);
      return true;
    } catch (mutationError) {
      setError(messageFromError(mutationError));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (role: Role, email: string, password?: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const user = await dataGateway.login({ role, email, password });
      setCurrentUser(user);
      await hydrate(user);
      return true;
    } catch (loginError) {
      setCurrentUser(null);
      setCustomers([]);
      setDrivers([]);
      setJobs([]);
      setError(messageFromError(loginError));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setCustomers([]);
    setDrivers([]);
    setJobs([]);
    setError(null);
  };

  const registerUser = async (role: Exclude<Role, 'admin'>, input: RegistrationInput) => {
    setIsLoading(true);
    setError(null);

    try {
      await dataGateway.registerUser(role, input);
      return true;
    } catch (registrationError) {
      setError(messageFromError(registrationError));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const refresh = async () => {
    if (!currentUser) return false;

    setIsLoading(true);
    setError(null);

    try {
      await hydrate(currentUser);
      return true;
    } catch (refreshError) {
      setError(messageFromError(refreshError));
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const addJob = (job: NewJobInput) =>
    runMutation(async () => {
      await dataGateway.addJob(job);
    });

  const updateJobStatus = (jobId: string, status: JobStatus, note?: string) =>
    runMutation(async () => {
      await dataGateway.updateJobStatus(jobId, status, note);
    });

  const assignDriver = (jobId: string, driverId: string) =>
    runMutation(async () => {
      await dataGateway.assignDriver(jobId, driverId);
    });

  return (
    <AppContext.Provider
      value={{
        currentUser,
        customers,
        drivers,
        jobs,
        isLoading,
        error,
        syncMode: dataGateway.mode,
        login,
        logout,
        registerUser,
        refresh,
        addJob,
        updateJobStatus,
        assignDriver,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within AppProvider');
  }
  return context;
}
