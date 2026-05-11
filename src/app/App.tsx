import MotoCoLogistics from './MotoCoLogistics.jsx';
import SecureLoginBridge from './SecureLoginBridge.jsx';

export default function App() {
  return (
    <SecureLoginBridge>
      <MotoCoLogistics />
    </SecureLoginBridge>
  );
}
