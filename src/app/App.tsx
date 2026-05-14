import MotoCoLogistics from './MotoCoLogistics.jsx';
import SecureLoginBridge from './SecureLoginBridge.jsx';
import ZohoDealBridge from './ZohoDealBridge.jsx';
import DriverWorkflowBridge from './DriverWorkflowBridge.jsx';

export default function App() {
  return (
    <SecureLoginBridge>
      <ZohoDealBridge>
        <MotoCoLogistics />
        <DriverWorkflowBridge />
      </ZohoDealBridge>
    </SecureLoginBridge>
  );
}
