import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentWindow } from "./FloatingDocumentWindow";
import { FloatingSurrogateDocumentWindow } from "./FloatingSurrogateDocumentWindow";
import { FloatingDiagramWindow } from "./FloatingDiagramWindow";
import { FloatingDocumentBrowser } from "./FloatingDocumentBrowser";

export function FloatingDocumentsManager() {
  const { floatingDocuments, closeFloatingDocument, bringToFront, sendToBack } = useFloatingDocuments();

  return (
    <>
      {floatingDocuments.map(doc => {
        if (doc.kind === "browser") {
          return (
            <FloatingDocumentBrowser
              key={doc.id}
              tenant={doc.tenant}
              project={doc.project}
              initialPosition={doc.position}
              zIndex={doc.zIndex}
              onClose={() => closeFloatingDocument(doc.id)}
              onBringToFront={() => bringToFront(doc.id)}
              onSendToBack={() => sendToBack(doc.id)}
            />
          );
        }

        if (doc.kind === "diagram") {
          return (
            <FloatingDiagramWindow
              key={doc.id}
              diagramName={doc.documentName}
              initialPosition={doc.position}
              zIndex={doc.zIndex}
              nodes={doc.diagramNodes || []}
              edges={doc.diagramEdges || []}
              viewport={doc.diagramViewport}
              onClose={() => closeFloatingDocument(doc.id)}
              onBringToFront={() => bringToFront(doc.id)}
              onSendToBack={() => sendToBack(doc.id)}
              tenant={doc.tenant}
              project={doc.project}
            />
          );
        }

        if (doc.kind === "surrogate") {
          return (
            <FloatingSurrogateDocumentWindow
              key={doc.id}
              tenant={doc.tenant}
              project={doc.project}
              documentSlug={doc.documentSlug ?? ""}
              documentName={doc.documentName}
              initialPosition={doc.position}
              zIndex={doc.zIndex}
              downloadUrl={doc.downloadUrl ?? undefined}
              mimeType={doc.mimeType ?? undefined}
              originalFileName={doc.originalFileName ?? undefined}
              previewDownloadUrl={doc.previewDownloadUrl ?? undefined}
              previewMimeType={doc.previewMimeType ?? undefined}
              onClose={() => closeFloatingDocument(doc.id)}
              onBringToFront={() => bringToFront(doc.id)}
              onSendToBack={() => sendToBack(doc.id)}
            />
          );
        }

        return (
          <FloatingDocumentWindow
            key={doc.id}
            tenant={doc.tenant}
            project={doc.project}
            documentSlug={doc.documentSlug ?? ""}
            documentName={doc.documentName}
            initialPosition={doc.position}
            zIndex={doc.zIndex}
            focusRequirementId={doc.focusRequirementId}
            onClose={() => closeFloatingDocument(doc.id)}
            onBringToFront={() => bringToFront(doc.id)}
            onSendToBack={() => sendToBack(doc.id)}
          />
        );
      })}
    </>
  );
}
