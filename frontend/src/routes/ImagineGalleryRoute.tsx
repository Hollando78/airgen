import { useState } from 'react';
import { useTenantProject } from '../hooks/useTenantProject';
import { useImagineGalleryApi } from '../hooks/useImagineGalleryApi';
import { PageLayout } from '../components/layout/PageLayout';
import { EmptyState } from '../components/ui/empty-state';
import { ImagineGallery } from '../components/imagine/ImagineGallery';
import { ImagineImageViewer } from '../components/imagine/ImagineImageViewer';
import { ReImagineModal } from '../components/imagine/ReImagineModal';
import type { ImagineImageRecord } from '../hooks/useImagineGalleryApi';
import { Image } from 'lucide-react';

export function ImagineGalleryRoute(): JSX.Element {
  const { state } = useTenantProject();
  const tenant = state.tenant;
  const project = state.project;

  // Early return BEFORE other hooks to avoid React error #185
  if (!tenant || !project) {
    return (
      <PageLayout
        title="AIRGen Imagine"
        description="AI-generated visualizations of your architecture"
      >
        <EmptyState
          icon={Image}
          title="No Project Selected"
          description="Select a tenant and project to view AIRGen Imagine visualizations."
        />
      </PageLayout>
    );
  }

  const { images, isLoading, error, refetch, useImageDetails, reImagine, isReImagining } = useImagineGalleryApi(tenant, project);

  const [selectedImage, setSelectedImage] = useState<ImagineImageRecord | null>(null);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [reImagineOpen, setReImagineOpen] = useState(false);
  const [imageToReImagine, setImageToReImagine] = useState<ImagineImageRecord | null>(null);

  // Get details for selected image
  const imageDetailsQuery = useImageDetails(selectedImage?.id || null);
  const imageDetails = imageDetailsQuery.data?.data;

  const handleImageClick = (image: ImagineImageRecord) => {
    setSelectedImage(image);
    setViewerOpen(true);
  };

  const handleReImagineClick = (image: ImagineImageRecord) => {
    setImageToReImagine(image);
    setReImagineOpen(true);
  };

  const handleReImagineFromViewer = () => {
    console.log('[ImagineGalleryRoute] Re-Imagine clicked from viewer', {
      selectedImage,
      imageUrl: selectedImage?.imageUrl
    });
    if (selectedImage) {
      setImageToReImagine(selectedImage);
      setReImagineOpen(true);
      console.log('[ImagineGalleryRoute] ReImagine modal should now be open');
      // Keep viewer open - don't call setViewerOpen(false)
    }
  };

  const handleReImagineSubmit = async (iterationInstructions: string) => {
    if (!imageToReImagine) return;

    try {
      const result = await reImagine({
        parentImageId: imageToReImagine.id,
        iterationInstructions,
      });

      // Close modal
      setReImagineOpen(false);
      setImageToReImagine(null);

      // Refresh gallery
      await refetch();

      // If viewer is open, update to show new version
      if (viewerOpen && result.data?.image) {
        setSelectedImage(result.data.image);
      }
    } catch (err) {
      console.error('Failed to re-imagine:', err);
      // Error handling is done by the hook
    }
  };

  const handleVersionSelect = (imageId: string) => {
    const version = imageDetails?.versions.find(v => v.id === imageId);
    if (version) {
      setSelectedImage(version);
    }
  };

  const handleViewerClose = () => {
    setViewerOpen(false);
    // Don't clear selectedImage immediately to avoid flicker
    setTimeout(() => setSelectedImage(null), 300);
  };

  if (error) {
    return (
      <PageLayout
        title="AIRGen Imagine"
        description="AI-generated visualizations of your architecture"
      >
        <div style={{
          padding: '32px',
          textAlign: 'center',
        }}>
          <p style={{ color: '#c00', fontSize: '14px' }}>
            Error loading visualizations: {error instanceof Error ? error.message : 'Unknown error'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="button-primary"
            style={{ marginTop: '16px' }}
          >
            Retry
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <>
      <PageLayout
        title="AIRGen Imagine"
        description="AI-generated visualizations of your architecture"
      >
        <ImagineGallery
          images={images}
          isLoading={isLoading}
          onImageClick={handleImageClick}
          onReImagine={handleReImagineClick}
        />
      </PageLayout>

      {/* Image Viewer Modal */}
      <ImagineImageViewer
        isOpen={viewerOpen}
        onClose={handleViewerClose}
        image={selectedImage}
        versions={imageDetails?.versions || []}
        isLoadingVersions={imageDetailsQuery.isLoading}
        onVersionSelect={handleVersionSelect}
        onReImagine={handleReImagineFromViewer}
      />

      {/* Re-Imagine Modal */}
      <ReImagineModal
        isOpen={reImagineOpen}
        onClose={() => {
          setReImagineOpen(false);
          setImageToReImagine(null);
        }}
        onSubmit={handleReImagineSubmit}
        imageName={imageToReImagine?.elementName || ''}
        imageUrl={imageToReImagine?.imageUrl}
        isSubmitting={isReImagining}
      />
    </>
  );
}
