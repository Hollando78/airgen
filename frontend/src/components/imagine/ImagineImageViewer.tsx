import { useEffect, useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Spinner } from '../Spinner';
import { useApiClient } from '../../lib/client';
import type { ImagineImageRecord } from '../../hooks/useImagineGalleryApi';

export interface ImagineImageViewerProps {
  isOpen: boolean;
  onClose: () => void;
  image: ImagineImageRecord | null;
  versions?: ImagineImageRecord[];
  isLoadingVersions?: boolean;
  onVersionSelect: (imageId: string) => void;
  onReImagine: () => void;
}

export function ImagineImageViewer({
  isOpen,
  onClose,
  image,
  versions = [],
  isLoadingVersions = false,
  onVersionSelect,
  onReImagine,
}: ImagineImageViewerProps) {
  const api = useApiClient();
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!image) return null;

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const formatCost = (cost: number) => {
    return `$${cost.toFixed(4)}`;
  };

  const handleSaveToDocuments = async () => {
    if (!image) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Fetch the image from the URL
      const response = await fetch(image.imageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const fileName = `imagine-${image.elementName.replace(/\s+/g, '-')}-v${image.version}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Upload as surrogate document
      const uploadResponse = await api.uploadSurrogateDocument({
        tenant: image.tenantSlug,
        projectKey: image.projectSlug,
        file,
        name: `Imagine: ${image.elementName} (v${image.version})`,
        description: `AI-generated visualization of ${image.elementType}: ${image.elementName} (version ${image.version})${image.customPrompt ? ` - ${image.customPrompt}` : ''}`,
      });

      // Get the element's current documents and diagram
      const elementMetadata = await api.getImagineElementMetadata(
        image.tenantSlug,
        image.projectSlug,
        image.elementId,
        image.elementType
      );

      const currentDocumentIds = elementMetadata.data.documentIds || [];
      const diagramId = elementMetadata.data.diagramId;

      // Link the document to the architecture element
      if (uploadResponse.document?.id && diagramId) {
        const newDocumentIds = [...currentDocumentIds, uploadResponse.document.id];

        if (image.elementType === 'Block') {
          await api.updateArchitectureBlock(image.tenantSlug, image.projectSlug, image.elementId, {
            diagramId,
            documentIds: newDocumentIds
          });
        } else if (image.elementType === 'Interface') {
          await api.updateArchitectureConnector(image.tenantSlug, image.projectSlug, image.elementId, {
            diagramId,
            documentIds: newDocumentIds
          });
        }
      }

      setSaveSuccess(true);

      // Clear success message after 3 seconds
      setTimeout(() => {
        setSaveSuccess(false);
      }, 3000);
    } catch (err) {
      console.error('Failed to save to documents:', err);
      setSaveError(err instanceof Error ? err.message : 'Failed to save to documents');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={image.elementName}
      subtitle={`${image.elementType} Visualization • Version ${image.version}`}
      size="xlarge"
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={onReImagine}
              className="button-primary"
            >
              Re-Imagine
            </button>
            <button
              type="button"
              onClick={handleSaveToDocuments}
              className="button-primary"
              disabled={isSaving || saveSuccess}
            >
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save to Documents'}
            </button>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              onClick={() => {
                const link = document.createElement('a');
                link.href = image.imageUrl;
                link.download = `${image.elementName.replace(/\s+/g, '-')}-v${image.version}.png`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="button-secondary"
            >
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="button-secondary"
            >
              Close
            </button>
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', gap: '24px', minHeight: '500px' }}>
        {/* Main Image */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div
            style={{
              width: '100%',
              backgroundColor: '#f5f5f5',
              border: '1px solid #ddd',
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <img
              src={image.imageUrl}
              alt={image.elementName}
              style={{
                width: '100%',
                maxHeight: '600px',
                objectFit: 'contain',
                display: 'block',
              }}
            />
          </div>

          {/* Metadata */}
          <div style={{
            padding: '16px',
            backgroundColor: '#f9f9f9',
            border: '1px solid #ddd',
            borderRadius: '8px',
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#333' }}>
              Metadata
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: '8px', fontSize: '13px' }}>
              <div style={{ fontWeight: 500, color: '#666' }}>Generated:</div>
              <div>{formatDate(image.createdAt)}</div>

              <div style={{ fontWeight: 500, color: '#666' }}>Model:</div>
              <div>{image.metadata.model}</div>

              <div style={{ fontWeight: 500, color: '#666' }}>Aspect Ratio:</div>
              <div>{image.metadata.aspectRatio}</div>

              <div style={{ fontWeight: 500, color: '#666' }}>Estimated Cost:</div>
              <div>{formatCost(image.metadata.estimatedCost)}</div>

              {image.customPrompt && (
                <>
                  <div style={{ fontWeight: 500, color: '#666' }}>Custom Instructions:</div>
                  <div style={{ fontStyle: 'italic' }}>{image.customPrompt}</div>
                </>
              )}

              {image.requirementIds && image.requirementIds.length > 0 && (
                <>
                  <div style={{ fontWeight: 500, color: '#666' }}>Requirements:</div>
                  <div>{image.requirementIds.length} requirement(s) used</div>
                </>
              )}
            </div>

            {/* Success Message */}
            {saveSuccess && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#d1fae5',
                border: '1px solid #10b981',
                borderRadius: '4px',
                color: '#065f46',
                fontSize: '13px',
              }}>
                ✓ Successfully saved to Documents!
              </div>
            )}

            {/* Error Message */}
            {saveError && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                backgroundColor: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: '4px',
                color: '#991b1b',
                fontSize: '13px',
              }}>
                <strong>Error:</strong> {saveError}
              </div>
            )}
          </div>
        </div>

        {/* Version History Sidebar */}
        <div style={{
          width: '280px',
          borderLeft: '1px solid #ddd',
          paddingLeft: '24px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px', color: '#333' }}>
            Version History
          </h3>

          {isLoadingVersions ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '32px' }}>
              <Spinner />
            </div>
          ) : versions.length === 0 ? (
            <div style={{ fontSize: '13px', color: '#666', fontStyle: 'italic' }}>
              No other versions
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflowY: 'auto',
              maxHeight: '600px',
            }}>
              {versions.map((version) => (
                <button
                  key={version.id}
                  type="button"
                  onClick={() => onVersionSelect(version.id)}
                  style={{
                    padding: '12px',
                    border: version.id === image.id ? '2px solid #2196f3' : '1px solid #ddd',
                    borderRadius: '6px',
                    backgroundColor: version.id === image.id ? '#e3f2fd' : '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    if (version.id !== image.id) {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (version.id !== image.id) {
                      e.currentTarget.style.backgroundColor = '#fff';
                    }
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '6px',
                  }}>
                    <span style={{
                      fontWeight: 600,
                      fontSize: '13px',
                      color: version.id === image.id ? '#1976d2' : '#333',
                    }}>
                      Version {version.version}
                    </span>
                    {version.id === image.id && (
                      <span style={{
                        fontSize: '11px',
                        color: '#1976d2',
                        fontWeight: 500,
                      }}>
                        (Current)
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#666', marginBottom: '6px' }}>
                    {formatDate(version.createdAt)}
                  </div>
                  {version.customPrompt && (
                    <div style={{
                      fontSize: '11px',
                      color: '#888',
                      fontStyle: 'italic',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}>
                      {version.customPrompt}
                    </div>
                  )}
                  <div
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      height: '80px',
                      backgroundColor: '#f5f5f5',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <img
                      src={version.imageUrl}
                      alt={`Version ${version.version}`}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                      }}
                    />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
