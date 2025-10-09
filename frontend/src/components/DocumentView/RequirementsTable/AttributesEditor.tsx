import { useState, useEffect } from 'react';

/**
 * Props for the AttributesEditor component
 */
export interface AttributesEditorProps {
  /** Current attributes object */
  attributes: Record<string, unknown>;
  /** Handler for saving attributes */
  onSave: (attributes: Record<string, unknown>) => void;
  /** Handler for closing the editor */
  onClose: () => void;
}

/**
 * Dialog component for editing custom attributes on requirements
 */
export function AttributesEditor({
  attributes,
  onSave,
  onClose
}: AttributesEditorProps): JSX.Element {
  const [editedAttributes, setEditedAttributes] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.entries(attributes).map(([key, value]) => [
        key,
        typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)
      ])
    )
  );
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  const handleSave = () => {
    // Convert string values back to their appropriate types
    const converted: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(editedAttributes)) {
      if (value === 'true') {
        converted[key] = true;
      } else if (value === 'false') {
        converted[key] = false;
      } else if (!isNaN(Number(value)) && value.trim() !== '') {
        converted[key] = Number(value);
      } else {
        converted[key] = value;
      }
    }
    onSave(converted);
  };

  const handleDelete = (key: string) => {
    const updated = { ...editedAttributes };
    delete updated[key];
    setEditedAttributes(updated);
  };

  const handleAdd = () => {
    if (newKey.trim() && !editedAttributes[newKey]) {
      setEditedAttributes({
        ...editedAttributes,
        [newKey.trim()]: newValue
      });
      setNewKey('');
      setNewValue('');
    }
  };

  const handleUpdate = (key: string, value: string) => {
    setEditedAttributes({
      ...editedAttributes,
      [key]: value
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '24px',
        minWidth: '500px',
        maxWidth: '600px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: '600' }}>
          Edit Custom Attributes
        </h3>

        {/* Existing attributes */}
        <div style={{ marginBottom: '20px' }}>
          {Object.keys(editedAttributes).length === 0 ? (
            <p style={{ color: '#94a3b8', fontSize: '14px', margin: '12px 0' }}>
              No custom attributes. Add one below.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {Object.entries(editedAttributes).map(([key, value]) => (
                <div key={key} style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'center',
                  padding: '8px',
                  backgroundColor: '#f8fafc',
                  borderRadius: '4px'
                }}>
                  <input
                    type="text"
                    value={key}
                    disabled
                    style={{
                      flex: '0 0 140px',
                      padding: '6px 8px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      fontSize: '13px',
                      backgroundColor: '#f1f5f9',
                      color: '#64748b'
                    }}
                  />
                  <input
                    type="text"
                    value={value}
                    onChange={(e) => handleUpdate(key, e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px 8px',
                      border: '1px solid #e2e8f0',
                      borderRadius: '4px',
                      fontSize: '13px'
                    }}
                  />
                  <button
                    onClick={() => handleDelete(key)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: '#fef2f2',
                      color: '#dc2626',
                      border: '1px solid #fecaca',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add new attribute */}
        <div style={{
          padding: '16px',
          backgroundColor: '#f0f9ff',
          borderRadius: '4px',
          marginBottom: '20px'
        }}>
          <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: '600' }}>
            Add New Attribute
          </h4>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key"
              style={{
                flex: '0 0 140px',
                padding: '6px 8px',
                border: '1px solid #bae6fd',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
            <input
              type="text"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleAdd();
                }
              }}
              style={{
                flex: 1,
                padding: '6px 8px',
                border: '1px solid #bae6fd',
                borderRadius: '4px',
                fontSize: '13px'
              }}
            />
            <button
              onClick={handleAdd}
              disabled={!newKey.trim() || editedAttributes[newKey]}
              style={{
                padding: '6px 12px',
                backgroundColor: newKey.trim() && !editedAttributes[newKey] ? '#3b82f6' : '#e2e8f0',
                color: newKey.trim() && !editedAttributes[newKey] ? 'white' : '#94a3b8',
                border: 'none',
                borderRadius: '4px',
                cursor: newKey.trim() && !editedAttributes[newKey] ? 'pointer' : 'not-allowed',
                fontSize: '12px'
              }}
            >
              Add
            </button>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          justifyContent: 'flex-end'
        }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              backgroundColor: 'transparent',
              color: '#64748b',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Save
          </button>
        </div>

        {/* Type hint */}
        <div style={{
          marginTop: '16px',
          padding: '8px 12px',
          backgroundColor: '#fef3c7',
          borderRadius: '4px',
          fontSize: '11px',
          color: '#92400e'
        }}>
          <strong>Tip:</strong> Values are auto-detected as numbers or booleans (true/false).
          Everything else is stored as text.
        </div>
      </div>
    </div>
  );
}
