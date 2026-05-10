import { createBrowserRouter } from "react-router";
import { RootLayout } from "./layouts/RootLayout";
import { CustomerLayout } from "./layouts/CustomerLayout";
import { DriverLayout } from "./layouts/DriverLayout";
import { AdminLayout } from "./layouts/AdminLayout";

// Auth screens
import { Login } from "./pages/auth/Login";
import { SignUp } from "./pages/auth/SignUp";
import { RoleSelect } from "./pages/auth/RoleSelect";

// Customer screens
import { CustomerDashboard } from "./pages/customer/Dashboard";
import { CreateJob } from "./pages/customer/CreateJob";
import { JobTracking } from "./pages/customer/JobTracking";
import { JobHistory } from "./pages/customer/JobHistory";

// Driver screens
import { DriverDashboard } from "./pages/driver/Dashboard";
import { DriverJobDetails } from "./pages/driver/JobDetails";

// Admin screens
import { AdminDashboard } from "./pages/admin/Dashboard";
import { ManageJobs } from "./pages/admin/ManageJobs";
import { ManageCustomers } from "./pages/admin/ManageCustomers";
import { ManageDrivers } from "./pages/admin/ManageDrivers";
import { Reports } from "./pages/admin/Reports";

// Other
import { NotFound } from "./pages/NotFound";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: RoleSelect },
      { path: "login", Component: Login },
      { path: "signup", Component: SignUp },

      {
        path: "customer",
        Component: CustomerLayout,
        children: [
          { index: true, Component: CustomerDashboard },
          { path: "create-job", Component: CreateJob },
          { path: "track/:jobId", Component: JobTracking },
          { path: "history", Component: JobHistory },
        ],
      },

      {
        path: "driver",
        Component: DriverLayout,
        children: [
          { index: true, Component: DriverDashboard },
          { path: "job/:jobId", Component: DriverJobDetails },
        ],
      },

      {
        path: "admin",
        Component: AdminLayout,
        children: [
          { index: true, Component: AdminDashboard },
          { path: "jobs", Component: ManageJobs },
          { path: "customers", Component: ManageCustomers },
          { path: "drivers", Component: ManageDrivers },
          { path: "reports", Component: Reports },
        ],
      },

      { path: "*", Component: NotFound },
    ],
  },
]);
