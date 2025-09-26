import { useAuth } from "../contexts/AuthContext";

export function TokenControls(): JSX.Element {
  const { user, token } = useAuth();

  return (
    <div className="token-controls">
      <div className="token-summary">
        <span className="token-status" style={{ fontSize: '0.8rem', color: '#5d6b7a' }}>
          {token ? '🟢 Authenticated' : '🔴 Not authenticated'}
        </span>
      </div>
    </div>
  );
}
