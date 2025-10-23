import { ImagineImageCard } from './ImagineImageCard';
import { Spinner } from '../Spinner';
import type { ImagineImageRecord } from '../../hooks/useImagineGalleryApi';

export interface ImagineGalleryProps {
  images: ImagineImageRecord[];
  isLoading: boolean;
  onImageClick: (image: ImagineImageRecord) => void;
  onReImagine: (image: ImagineImageRecord) => void;
}

export function ImagineGallery({
  images,
  isLoading,
  onImageClick,
  onReImagine,
}: ImagineGalleryProps) {
  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px',
        gap: '16px',
      }}>
        <Spinner />
        <p style={{ color: '#666', fontSize: '14px' }}>Loading visualizations...</p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px',
        gap: '16px',
      }}>
        <svg
          width="64"
          height="64"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#999"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
          <circle cx="8.5" cy="8.5" r="1.5"/>
          <polyline points="21 15 16 10 5 21"/>
        </svg>
        <div style={{ textAlign: 'center' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 600, color: '#333', marginBottom: '8px' }}>
            No Visualizations Yet
          </h3>
          <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
            Generate your first AI visualization from the Architecture or Interfaces views.
          </p>
          <p style={{ fontSize: '13px', color: '#888' }}>
            Right-click on any block or interface and select "Imagine" to create a visualization.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header with count */}
      <div style={{
        marginBottom: '24px',
        padding: '16px',
        backgroundColor: '#f9f9f9',
        border: '1px solid #ddd',
        borderRadius: '8px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 600, color: '#333', marginBottom: '4px' }}>
              AIRGen Imagine Gallery
            </h2>
            <p style={{ fontSize: '14px', color: '#666' }}>
              {images.length} visualization{images.length !== 1 ? 's' : ''} generated
            </p>
          </div>
          <div style={{ fontSize: '12px', color: '#888' }}>
            <div>💡 <strong>Tip:</strong> Right-click any image to re-imagine with new instructions</div>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '20px',
        paddingBottom: '32px',
      }}>
        {images.map((image) => (
          <ImagineImageCard
            key={image.id}
            image={image}
            onClick={() => onImageClick(image)}
            onReImagine={() => onReImagine(image)}
          />
        ))}
      </div>
    </div>
  );
}
