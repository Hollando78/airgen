import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentWindow } from "./FloatingDocumentWindow";
import { FloatingSurrogateDocumentWindow } from "./FloatingSurrogateDocumentWindow";

export function FloatingDocumentsManager() {
  const { floatingDocuments, closeFloatingDocument } = useFloatingDocuments();

  return (
    <>
      {floatingDocuments.map(doc =>
        doc.kind === "surrogate" ? (
          <FloatingSurrogateDocumentWindow
            key={doc.id}
            tenant={doc.tenant}
            project={doc.project}
            documentSlug={doc.documentSlug}
            documentName={doc.documentName}
            initialPosition={doc.position}
            downloadUrl={doc.downloadUrl ?? undefined}
            mimeType={doc.mimeType ?? undefined}
            originalFileName={doc.originalFileName ?? undefined}
            previewDownloadUrl={doc.previewDownloadUrl ?? undefined}
            previewMimeType={doc.previewMimeType ?? undefined}
            onClose={() => closeFloatingDocument(doc.id)}
          />
        ) : (
          <FloatingDocumentWindow
            key={doc.id}
            tenant={doc.tenant}
            project={doc.project}
            documentSlug={doc.documentSlug}
            documentName={doc.documentName}
            initialPosition={doc.position}
            focusRequirementId={doc.focusRequirementId}
            onClose={() => closeFloatingDocument(doc.id)}
          />
        )
      )}
    </>
  );
}
