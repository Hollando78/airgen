interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  itemName: string;
  onConfirm: () => void;
  onCancel: () => void;
  isDeleting?: boolean;
}

export function ConfirmDeleteModal({
  isOpen,
  title,
  message,
  itemName,
  onConfirm,
  onCancel,
  isDeleting = false
}: ConfirmDeleteModalProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" onClick={onCancel} className="ghost-button">×</button>
        </div>
        
        <div className="modal-body">
          <div style={{ marginBottom: '16px' }}>
            <p>{message}</p>
            <div style={{ 
              padding: '12px',
              backgroundColor: '#f8f9fa',
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              marginTop: '12px',
              fontWeight: 'bold'
            }}>
              {itemName}
            </div>
          </div>
          
          <div style={{ 
            padding: '12px',
            backgroundColor: '#fff3cd',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#856404'
          }}>
            ⚠️ This item will be soft deleted and can be recovered by an administrator.
          </div>
          
          <div className="form-actions" style={{ marginTop: '20px' }}>
            <button type="button" onClick={onCancel} className="ghost-button">
              Cancel
            </button>
            <button 
              type="button"
              onClick={onConfirm}
              disabled={isDeleting}
              className="danger-button"
              style={{
                backgroundColor: '#dc3545',
                color: 'white',
                border: '1px solid #dc3545',
                padding: '8px 16px',
                borderRadius: '4px',
                cursor: isDeleting ? 'not-allowed' : 'pointer',
                opacity: isDeleting ? 0.6 : 1
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}