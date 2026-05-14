import MotoCoLogistics from './MotoCoLogistics.jsx';
import SecureLoginBridge from './SecureLoginBridge.jsx';
import ZohoDealBridge from './ZohoDealBridge.jsx';
import DriverWorkflowBridge from './DriverWorkflowBridge.jsx';
import ClientOrderDateBridge from './ClientOrderDateBridge.jsx';

export default function App() {
  return (
    <SecureLoginBridge>
      <ZohoDealBridge>
        <MotoCoLogistics />
        <DriverWorkflowBridge />
        <ClientOrderDateBridge />
      </ZohoDealBridge>
    </SecureLoginBridge>
  );
}
