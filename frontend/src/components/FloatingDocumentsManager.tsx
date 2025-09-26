import { useFloatingDocuments } from "../contexts/FloatingDocumentsContext";
import { FloatingDocumentWindow } from "./FloatingDocumentWindow";

export function FloatingDocumentsManager() {
  const { floatingDocuments, closeFloatingDocument } = useFloatingDocuments();

  return (
    <>
      {floatingDocuments.map(doc => (
        <FloatingDocumentWindow
          key={doc.id}
          tenant={doc.tenant}
          project={doc.project}
          documentSlug={doc.documentSlug}
          documentName={doc.documentName}
          initialPosition={doc.position}
          onClose={() => closeFloatingDocument(doc.id)}
        />
      ))}
    </>
  );
}