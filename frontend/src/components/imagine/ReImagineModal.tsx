import { useState } from 'react';
import { Modal } from '../Modal/Modal';

export interface ReImagineModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (iterationInstructions: string) => Promise<void>;
  imageName: string;
  isSubmitting?: boolean;
}

export function ReImagineModal({
  isOpen,
  onClose,
  onSubmit,
  imageName,
  isSubmitting = false,
}: ReImagineModalProps) {
  const [iterationInstructions, setIterationInstructions] = useState('');

  const handleSubmit = async () => {
    if (!iterationInstructions.trim()) {
      return;
    }

    await onSubmit(iterationInstructions.trim());
    setIterationInstructions('');
  };

  const handleClose = () => {
    setIterationInstructions('');
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Re-Imagine Visualization"
      subtitle={`Create a new version of: ${imageName}`}
      size="medium"
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <button
            type="button"
            onClick={handleClose}
            className="button-secondary"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            className="button-primary"
            disabled={isSubmitting || !iterationInstructions.trim()}
          >
            {isSubmitting ? 'Generating...' : 'Re-Imagine'}
          </button>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div>
          <p style={{ marginBottom: '12px', fontSize: '14px', color: '#666' }}>
            Describe the changes you want to make to the visualization. The AI will create a new
            version based on your instructions while maintaining the original style and subject.
          </p>
        </div>

        <div>
          <label htmlFor="iterationInstructions" style={{ display: 'block', marginBottom: '8px', fontWeight: 500 }}>
            Iteration Instructions
          </label>
          <textarea
            id="iterationInstructions"
            value={iterationInstructions}
            onChange={(e) => setIterationInstructions(e.target.value)}
            placeholder="Examples:
• Remove all labels and text
• Convert dimensions to metric units
• Change color scheme to dark mode
• Add more detail to the cooling system
• Show the system from a different angle"
            rows={8}
            style={{
              width: '100%',
              padding: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              fontFamily: 'inherit',
              fontSize: '14px',
              resize: 'vertical',
            }}
            disabled={isSubmitting}
            autoFocus
          />
          <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
            Be specific about what you want to change. The original visualization and context will
            be preserved.
          </div>
        </div>

        {isSubmitting && (
          <div style={{
            padding: '12px',
            backgroundColor: '#e3f2fd',
            border: '1px solid #2196f3',
            borderRadius: '4px',
            fontSize: '14px',
            color: '#1976d2',
          }}>
            Generating new version with Gemini 2.5 Flash Image... This may take 10-30 seconds.
          </div>
        )}
      </div>
    </Modal>
  );
}
