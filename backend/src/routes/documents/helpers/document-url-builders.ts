/**
 * Build download URL for a surrogate document
 */
export function buildDownloadUrl(tenant: string, project: string, documentSlug: string): string {
  const encodedTenant = encodeURIComponent(tenant);
  const encodedProject = encodeURIComponent(project);
  const encodedSlug = encodeURIComponent(documentSlug);
  return `/documents/${encodedTenant}/${encodedProject}/${encodedSlug}/file`;
}

/**
 * Build preview URL for a surrogate document
 */
export function buildPreviewUrl(tenant: string, project: string, documentSlug: string): string {
  const encodedTenant = encodeURIComponent(tenant);
  const encodedProject = encodeURIComponent(project);
  const encodedSlug = encodeURIComponent(documentSlug);
  return `/documents/${encodedTenant}/${encodedProject}/${encodedSlug}/preview`;
}
