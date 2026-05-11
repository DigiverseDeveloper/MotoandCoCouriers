import MotoCoLogistics from './MotoCoLogistics.jsx';
import SecureLoginBridge from './SecureLoginBridge.jsx';
import ZohoDealBridge from './ZohoDealBridge.jsx';

export default function App() {
  return (
    <SecureLoginBridge>
      <ZohoDealBridge>
        <MotoCoLogistics />
      </ZohoDealBridge>
    </SecureLoginBridge>
  );
}
