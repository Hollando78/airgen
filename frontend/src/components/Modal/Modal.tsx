import { useEffect, useRef, useState } from "react";
import "./Modal.css";

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: "small" | "medium" | "large" | "xlarge";
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  draggable?: boolean;
  noBackdrop?: boolean;
  dismissible?: boolean;
  initialPosition?: { x: number; y: number };
}

export function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  size = "medium",
  children,
  footer,
  className = "",
  draggable = false,
  noBackdrop = false,
  dismissible = true,
  initialPosition
}: ModalProps): JSX.Element | null {
  const modalRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(initialPosition || { x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (isOpen && !noBackdrop) {
      document.body.style.overflow = "hidden";
      modalRef.current?.focus();
    } else if (!noBackdrop) {
      document.body.style.overflow = "";
    }

    return () => {
      if (!noBackdrop) {
        document.body.style.overflow = "";
      }
    };
  }, [isOpen, noBackdrop]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && dismissible) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose, dismissible]);

  // Dragging handlers
  useEffect(() => {
    if (!draggable || !isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggable, isDragging, dragStart]);

  if (!isOpen) {return null;}

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && dismissible) {
      onClose();
    }
  };

  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    if (!draggable) return;

    const rect = modalRef.current?.getBoundingClientRect();
    if (rect) {
      setDragStart({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      });
      setIsDragging(true);
    }
  };

  const modalClasses = [
    "modal",
    `modal--${size}`,
    draggable && "modal--draggable",
    noBackdrop && "modal--no-backdrop",
    className
  ].filter(Boolean).join(" ");

  const modalStyle = draggable && initialPosition ? {
    left: `${position.x}px`,
    top: `${position.y}px`,
    transform: "none"
  } : {};

  const content = (
    <div
      ref={modalRef}
      className={modalClasses}
      style={modalStyle}
      tabIndex={-1}
    >
      <div
        className={`modal__header ${draggable ? "modal__header--draggable" : ""}`}
        onMouseDown={handleHeaderMouseDown}
        style={{ cursor: draggable ? "move" : "default" }}
      >
        <div className="modal__title-group">
          <h2 id="modal-title" className="modal__title">{title}</h2>
          {subtitle && <p className="modal__subtitle">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="modal__close"
          onClick={onClose}
          aria-label="Close modal"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>

      <div className="modal__body">
        {children}
      </div>

      {footer && (
        <div className="modal__footer">
          {footer}
        </div>
      )}
    </div>
  );

  if (noBackdrop) {
    return content;
  }

  return (
    <div
      className="modal-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {content}
    </div>
  );
}