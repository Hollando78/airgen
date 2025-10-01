import "./Modal/Modal.css";

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
  if (!isOpen) {return null;}

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal--small" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <div className="modal__title-group">
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <div
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "999px",
                  backgroundColor: "#fee2e2",
                  color: "#b91c1c",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontWeight: 700,
                  fontSize: "18px"
                }}
              >
                !
              </div>
              <div>
                <h2 className="modal__title">{title}</h2>
                <p className="modal__subtitle">{message}</p>
              </div>
            </div>
          </div>
          <button type="button" onClick={onCancel} className="modal__close">×</button>
        </div>

        <div className="modal__body">
          <div
            style={{
              padding: "12px 14px",
              border: "1px solid #e2e8f0",
              borderRadius: "8px",
              background: "#f8fafc",
              fontWeight: 600,
              color: "#0f172a"
            }}
          >
            {itemName}
          </div>

          <div
            style={{
              marginTop: "16px",
              padding: "12px 14px",
              borderRadius: "8px",
              backgroundColor: "#fff7ed",
              border: "1px solid #fed7aa",
              color: "#9a3412",
              fontSize: "14px",
              display: "flex",
              alignItems: "center",
              gap: "10px"
            }}
          >
            <span style={{ fontSize: "18px", lineHeight: 1 }}>⚠️</span>
            <span>This document will be soft deleted. Administrators can restore it if needed.</span>
          </div>

        </div>

        <div className="modal__footer">
          <button
            type="button"
            onClick={onCancel}
            className="btn btn--secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="btn btn--primary"
            style={{
              backgroundColor: "#dc2626",
              borderColor: "#dc2626"
            }}
          >
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
