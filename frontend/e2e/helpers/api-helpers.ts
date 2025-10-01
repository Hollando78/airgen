import { Page, APIResponse } from '@playwright/test';

/**
 * API interaction helpers for E2E tests
 */

export interface ApiRequestOptions {
  tenant: string;
  project: string;
}

/**
 * Make an authenticated API request
 */
export async function apiRequest(
  page: Page,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  endpoint: string,
  data?: any
): Promise<APIResponse> {
  const options: any = {
    method,
  };

  if (data) {
    options.data = data;
  }

  return await page.request.fetch(endpoint, options);
}

/**
 * List requirements via API
 */
export async function listRequirements(
  page: Page,
  options: ApiRequestOptions
): Promise<any> {
  const response = await apiRequest(
    page,
    'GET',
    `/api/${options.tenant}/${options.project}/requirements`
  );

  if (!response.ok()) {
    throw new Error(`Failed to list requirements: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Create a requirement via API
 */
export async function createRequirement(
  page: Page,
  options: ApiRequestOptions,
  data: {
    ref: string;
    title: string;
    text: string;
    type?: string;
  }
): Promise<any> {
  const response = await apiRequest(
    page,
    'POST',
    `/api/${options.tenant}/${options.project}/requirements`,
    data
  );

  if (!response.ok()) {
    throw new Error(`Failed to create requirement: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Delete a requirement via API
 */
export async function deleteRequirement(
  page: Page,
  options: ApiRequestOptions,
  ref: string
): Promise<void> {
  const response = await apiRequest(
    page,
    'DELETE',
    `/api/${options.tenant}/${options.project}/requirements/${ref}`
  );

  if (!response.ok() && response.status() !== 404) {
    throw new Error(`Failed to delete requirement: ${response.status()}`);
  }
}

/**
 * Generate AIRGen candidates via API
 */
export async function generateCandidates(
  page: Page,
  options: ApiRequestOptions,
  data: {
    user_input: string;
    n?: number;
    glossary?: string;
    constraints?: string;
  }
): Promise<any> {
  const response = await apiRequest(
    page,
    'POST',
    `/api/${options.tenant}/${options.project}/airgen/chat`,
    {
      user_input: data.user_input,
      n: data.n || 5,
      glossary: data.glossary,
      constraints: data.constraints,
      mode: 'requirements',
    }
  );

  if (!response.ok()) {
    throw new Error(`Failed to generate candidates: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Accept a candidate via API
 */
export async function acceptCandidate(
  page: Page,
  options: ApiRequestOptions,
  candidateId: string,
  data: {
    ref: string;
    type: string;
  }
): Promise<any> {
  const response = await apiRequest(
    page,
    'POST',
    `/api/${options.tenant}/${options.project}/airgen/candidates/${candidateId}/accept`,
    data
  );

  if (!response.ok()) {
    throw new Error(`Failed to accept candidate: ${response.status()}`);
  }

  return await response.json();
}

/**
 * Wait for API endpoint to respond
 */
export async function waitForApiEndpoint(
  page: Page,
  endpoint: string,
  timeout = 10000
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    try {
      const response = await page.request.get(endpoint);
      if (response.ok()) {
        return;
      }
    } catch (error) {
      // Continue waiting
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`API endpoint ${endpoint} did not respond within ${timeout}ms`);
}

/**
 * Clear test data
 */
export async function clearTestData(
  page: Page,
  options: ApiRequestOptions
): Promise<void> {
  // This is a placeholder - implement based on your API
  // You might want to delete test requirements, candidates, etc.
  try {
    await apiRequest(
      page,
      'DELETE',
      `/api/${options.tenant}/${options.project}/test-data`
    );
  } catch (error) {
    // Ignore errors if endpoint doesn't exist
  }
}
