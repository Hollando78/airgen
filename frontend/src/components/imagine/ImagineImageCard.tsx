import { useState, useRef, useEffect } from 'react';
import type { ImagineImageRecord } from '../../hooks/useImagineGalleryApi';

export interface ImagineImageCardProps {
  image: ImagineImageRecord;
  onClick: () => void;
  onReImagine: () => void;
}

export function ImagineImageCard({ image, onClick, onReImagine }: ImagineImageCardProps) {
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const cardRef = useRef<HTMLDivElement>(null);

  // Close context menu when clicking outside
  useEffect(() => {
    if (!contextMenuOpen) return;

    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (cardRef.current && !cardRef.current.contains(target)) {
        setContextMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenuOpen]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  };

  const handleReImagineClick = () => {
    setContextMenuOpen(false);
    onReImagine();
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const truncatePrompt = (prompt?: string, maxLength: number = 60) => {
    if (!prompt) return 'No custom instructions';
    if (prompt.length <= maxLength) return prompt;
    return prompt.substring(0, maxLength) + '...';
  };

  return (
    <>
      <div
        ref={cardRef}
        onClick={onClick}
        onContextMenu={handleContextMenu}
        style={{
          border: '1px solid #ddd',
          borderRadius: '8px',
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s, transform 0.2s',
          backgroundColor: '#fff',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = 'none';
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {/* Thumbnail */}
        <div
          style={{
            width: '100%',
            height: '200px',
            backgroundColor: '#f5f5f5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
          }}
        >
          <img
            src={image.imageUrl}
            alt={image.elementName}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
            loading="lazy"
          />
        </div>

        {/* Metadata */}
        <div style={{ padding: '12px' }}>
          <div style={{ marginBottom: '8px' }}>
            <div style={{
              fontSize: '14px',
              fontWeight: 600,
              color: '#333',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {image.elementName}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#666',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}>
              <span style={{
                display: 'inline-block',
                padding: '2px 6px',
                backgroundColor: image.elementType === 'Block' ? '#e3f2fd' : '#f3e5f5',
                color: image.elementType === 'Block' ? '#1976d2' : '#7b1fa2',
                borderRadius: '3px',
                fontSize: '11px',
                fontWeight: 500,
              }}>
                {image.elementType}
              </span>
              <span>•</span>
              <span>v{image.version}</span>
            </div>
          </div>

          <div style={{
            fontSize: '12px',
            color: '#888',
            marginBottom: '6px',
          }}>
            {formatDate(image.createdAt)}
          </div>

          <div style={{
            fontSize: '12px',
            color: '#666',
            fontStyle: 'italic',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {truncatePrompt(image.customPrompt)}
          </div>
        </div>
      </div>

      {/* Context Menu */}
      {contextMenuOpen && (
        <div
          style={{
            position: 'fixed',
            top: contextMenuPos.y,
            left: contextMenuPos.x,
            backgroundColor: '#fff',
            border: '1px solid #ccc',
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: 9999,
            minWidth: '160px',
          }}
        >
          <button
            type="button"
            onClick={handleReImagineClick}
            style={{
              width: '100%',
              padding: '10px 16px',
              border: 'none',
              backgroundColor: 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
              fontSize: '14px',
              color: '#333',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
            </svg>
            Re-Imagine
          </button>
        </div>
      )}
    </>
  );
}
