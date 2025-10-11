/**
 * Parsed multipart form data result
 */
export type ParsedMultipart = {
  fields: Record<string, string>;
  file?: {
    filename: string;
    contentType: string;
    data: Buffer;
  };
};

/**
 * Parse multipart/form-data from a raw buffer
 *
 * Extracts text fields and a single file upload from multipart form data.
 * Used for document upload endpoint.
 */
export function parseMultipartFormData(body: Buffer, boundary: string): ParsedMultipart {
  const result: ParsedMultipart = { fields: {} };
  const boundaryMarker = `--${boundary}`;
  const parts = body.toString("binary").split(boundaryMarker);

  for (const rawPart of parts) {
    if (!rawPart || rawPart === "--" || rawPart === "--\r\n") {continue;}

    let part = rawPart;
    if (part.startsWith("\r\n")) {
      part = part.slice(2);
    }
    if (part.endsWith("\r\n")) {
      part = part.slice(0, -2);
    }
    if (part === "--") {continue;}

    const headerEndIndex = part.indexOf("\r\n\r\n");
    if (headerEndIndex === -1) {continue;}

    const headerSection = part.slice(0, headerEndIndex);
    const bodySection = part.slice(headerEndIndex + 4);

    const headers = headerSection.split("\r\n");
    const dispositionHeader = headers.find(header => header.toLowerCase().startsWith("content-disposition"));
    if (!dispositionHeader) {continue;}

    const nameMatch = dispositionHeader.match(/name="([^"]+)"/);
    if (!nameMatch) {continue;}
    const fieldName = nameMatch[1];

    const filenameMatch = dispositionHeader.match(/filename="([^"]*)"/);
    if (filenameMatch && filenameMatch[1]) {
      const contentTypeHeader = headers.find(header => header.toLowerCase().startsWith("content-type"));
      const contentType = contentTypeHeader ? contentTypeHeader.split(":")[1].trim() : "application/octet-stream";
      const fileBuffer = Buffer.from(bodySection, "binary");
      result.file = {
        filename: filenameMatch[1],
        contentType,
        data: fileBuffer
      };
    } else {
      let textValue = Buffer.from(bodySection, "binary").toString("utf8");
      if (textValue.endsWith("\r\n")) {
        textValue = textValue.slice(0, -2);
      }
      result.fields[fieldName] = textValue;
    }
  }

  return result;
}
