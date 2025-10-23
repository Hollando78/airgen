import { useState } from 'react';
import { Modal } from '../Modal/Modal';
import { Spinner } from '../Spinner';
import { useImagineApi } from '../../hooks/useImagineApi';
import { useApiClient } from '../../lib/client';

export interface ImagineModalProps {
  isOpen: boolean;
  onClose: () => void;
  elementId: string;
  elementType: 'Block' | 'Interface';
  elementName: string;
  tenant: string;
  project: string;
  documentIds?: string[];
  diagramId?: string;
}

export function ImagineModal({
  isOpen,
  onClose,
  elementId,
  elementType,
  elementName,
  tenant,
  project,
  documentIds,
  diagramId,
}: ImagineModalProps) {
  const api = useApiClient();
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [selectedRequirementIds, setSelectedRequirementIds] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { requirements, isLoadingRequirements, generateImagination, isGenerating, error } = useImagineApi(tenant, project, elementId);

  const handleGenerate = async () => {
    try {
      const result = await generateImagination.mutateAsync({
        elementId,
        elementType,
        customPrompt: customPrompt.trim() || undefined,
        requirementIds: selectedRequirementIds.length > 0 ? selectedRequirementIds : undefined,
      });

      if (result.success && result.data.imageUrl) {
        setGeneratedImageUrl(result.data.imageUrl);
      }
    } catch (err) {
      console.error('Failed to generate visualization:', err);
    }
  };

  const handleRequirementToggle = (reqId: string) => {
    setSelectedRequirementIds((prev) =>
      prev.includes(reqId)
        ? prev.filter((id) => id !== reqId)
        : [...prev, reqId]
    );
  };

  const handleSaveToDocuments = async () => {
    if (!generatedImageUrl) return;

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Fetch the image from the URL
      const response = await fetch(generatedImageUrl);
      if (!response.ok) {
        throw new Error('Failed to fetch image');
      }

      const blob = await response.blob();
      const fileName = `imagine-${elementName.replace(/\s+/g, '-')}-${Date.now()}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Upload as surrogate document
      const uploadResponse = await api.uploadSurrogateDocument({
        tenant,
        projectKey: project,
        file,
        name: `Imagine: ${elementName}`,
        description: `AI-generated visualization of ${elementType}: ${elementName}`,
      });

      // Link the document to the architecture element
      if (uploadResponse.document?.id && diagramId) {
        const newDocumentIds = [...(documentIds || []), uploadResponse.document.id];

        if (elementType === 'Block') {
          await api.updateArchitectureBlock(tenant, project, elementId, {
            diagramId,
            documentIds: newDocumentIds
          });
        } else if (elementType === 'Interface') {
          await api.updateArchitectureConnector(tenant, project, elementId, {
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

  const handleClose = () => {
    setCustomPrompt('');
    setGeneratedImageUrl(null);
    setSelectedRequirementIds([]);
    setSaveSuccess(false);
    setSaveError(null);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Imagine Visualization"
      subtitle={`Generate AI visualization for ${elementType}: ${elementName}`}
      size="large"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={handleClose}
            className="button-secondary"
            disabled={isGenerating}
          >
            Close
          </button>
          {!generatedImageUrl && (
            <button
              type="button"
              onClick={handleGenerate}
              className="button-primary"
              disabled={isGenerating}
            >
              {isGenerating ? 'Generating...' : 'Generate Visualization'}
            </button>
          )}
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Element Info */}
        <div>
          <strong>Element:</strong> {elementType} - {elementName}
        </div>

        {/* Requirements Selection */}
        {!generatedImageUrl && requirements.length > 0 && (
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Select Requirements (optional)
            </label>
            {isLoadingRequirements ? (
              <div style={{ padding: '8px', fontSize: '14px', color: '#666' }}>
                Loading requirements...
              </div>
            ) : (
              <div style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #ccc',
                borderRadius: '4px',
                padding: '8px',
              }}>
                {requirements.map((req) => (
                  <label
                    key={req.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      padding: '6px 0',
                      cursor: 'pointer',
                      borderBottom: '1px solid #eee',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={selectedRequirementIds.includes(req.id)}
                      onChange={() => handleRequirementToggle(req.id)}
                      disabled={isGenerating}
                      style={{ marginRight: '8px', marginTop: '3px', flexShrink: 0 }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>
                        {req.ref}: {req.title}
                      </div>
                      {req.text && (
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          {req.text.length > 100 ? req.text.substring(0, 100) + '...' : req.text}
                        </div>
                      )}
                      {req.priority && (
                        <div style={{ fontSize: '11px', color: '#999', marginTop: '2px' }}>
                          Priority: {req.priority}
                        </div>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}
            <div style={{ marginTop: '6px', fontSize: '12px', color: '#666' }}>
              {selectedRequirementIds.length > 0
                ? `${selectedRequirementIds.length} requirement(s) selected`
                : 'No requirements selected - all linked requirements will be used'}
            </div>
          </div>
        )}

        {/* Custom Prompt */}
        {!generatedImageUrl && (
          <div>
            <label htmlFor="customPrompt" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
              Custom Instructions (optional)
            </label>
            <textarea
              id="customPrompt"
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Add any specific instructions for the visualization (e.g., 'show these two components assembled', 'focus on the cooling system')"
              rows={4}
              style={{
                width: '100%',
                padding: '8px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontFamily: 'inherit',
                fontSize: '14px',
              }}
              disabled={isGenerating}
            />
            <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
              Leave blank for automatic generation based on the element's context
            </div>
          </div>
        )}

        {/* Loading State */}
        {isGenerating && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px', gap: '16px' }}>
            <Spinner />
            <p>Generating visualization with Gemini 2.5 Flash Image...</p>
            <p style={{ fontSize: '12px', color: '#666' }}>
              This may take 10-30 seconds
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !isGenerating && (
          <div style={{ padding: '16px', backgroundColor: '#fee', border: '1px solid #fcc', borderRadius: '4px', color: '#c00' }}>
            <strong>Error:</strong> {error.message}
          </div>
        )}

        {/* Generated Image */}
        {generatedImageUrl && !isGenerating && (
          <div>
            <div style={{ marginBottom: '8px', fontWeight: 500 }}>
              Generated Visualization:
            </div>
            <div style={{ border: '1px solid #ccc', borderRadius: '4px', overflow: 'hidden' }}>
              <img
                src={generatedImageUrl}
                alt={`Visualization of ${elementName}`}
                style={{ width: '100%', height: 'auto', display: 'block' }}
              />
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
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
                <span>Successfully saved to Documents!</span>
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
              }}>
                <strong>Error:</strong> {saveError}
              </div>
            )}

            <div style={{ marginTop: '16px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleSaveToDocuments}
                className="button-primary"
                disabled={isSaving || saveSuccess}
              >
                {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save to Documents'}
              </button>
              <button
                type="button"
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = generatedImageUrl;
                  link.download = `imagine-${elementName.replace(/\s+/g, '-')}.png`;
                  document.body.appendChild(link);
                  link.click();
                  document.body.removeChild(link);
                }}
                className="button-secondary"
              >
                Download Image
              </button>
              <button
                type="button"
                onClick={() => {
                  setGeneratedImageUrl(null);
                  setCustomPrompt('');
                  setSaveSuccess(false);
                  setSaveError(null);
                }}
                className="button-secondary"
              >
                Generate Another
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
