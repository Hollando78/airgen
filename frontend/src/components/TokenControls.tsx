import { useState } from "react";
import { useAuth } from "../auth/AuthContext";

export function TokenControls(): JSX.Element {
  const { token, user, setToken, clearToken } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draftToken, setDraftToken] = useState(token ?? "");

  const handleSave = () => {
    const trimmed = draftToken.trim();
    setToken(trimmed ? trimmed : null);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftToken(token ?? "");
    setEditing(false);
  };

  return (
    <div className="token-controls">
      <div className="token-summary">
        <span className="token-status">
          {user ? `${user.email ?? user.sub}` : "Anonymous"}
        </span>
        {user?.roles && (
          <span className="token-roles">{user.roles.join(", ")}</span>
        )}
      </div>
      {editing ? (
        <div className="token-editor">
          <textarea
            value={draftToken}
            onChange={event => setDraftToken(event.target.value)}
            placeholder="Paste bearer token"
            rows={3}
          />
          <div className="token-actions">
            <button type="button" onClick={handleSave}>
              Save
            </button>
            <button type="button" className="ghost-button" onClick={handleCancel}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="token-buttons">
          <button type="button" onClick={() => setEditing(true)}>
            {token ? "Update Token" : "Add Token"}
          </button>
          {token && (
            <button type="button" className="ghost-button" onClick={clearToken}>
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
