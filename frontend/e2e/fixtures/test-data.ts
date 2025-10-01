/**
 * Test data fixtures for E2E tests
 */

export const testTenant = 'hollando';
export const testProject = 'main-battle-tank';

export interface TestRequirement {
  ref: string;
  title: string;
  text: string;
  type: string;
}

export interface TestCandidate {
  instruction: string;
  expectedCount: number;
}

/**
 * Sample requirements for testing
 */
export const sampleRequirements: TestRequirement[] = [
  {
    ref: 'TEST-REQ-001',
    title: 'System Startup',
    text: 'The system shall start within 5 seconds of power on.',
    type: 'functional',
  },
  {
    ref: 'TEST-REQ-002',
    title: 'User Authentication',
    text: 'The system shall authenticate users using multi-factor authentication.',
    type: 'security',
  },
  {
    ref: 'TEST-REQ-003',
    title: 'Data Backup',
    text: 'The system shall perform automatic backups every 24 hours.',
    type: 'operational',
  },
];

/**
 * Sample AIRGen instructions for testing
 */
export const sampleInstructions: TestCandidate[] = [
  {
    instruction: 'Create requirements for a basic login system with username and password',
    expectedCount: 5,
  },
  {
    instruction: 'Generate requirements for data encryption at rest and in transit',
    expectedCount: 5,
  },
  {
    instruction: 'Define requirements for system monitoring and alerting',
    expectedCount: 5,
  },
];

/**
 * Sample glossary terms
 */
export const sampleGlossary = `
MBT: Main Battle Tank
Turret: The rotating armored structure on top of the tank
Fire Control System: Electronic system for targeting and weapon discharge
`;

/**
 * Sample constraints
 */
export const sampleConstraints = `
- All requirements must follow IEEE 830 format
- Requirements must be testable and verifiable
- Each requirement must have a unique identifier
`;

/**
 * Get a unique test reference
 */
export function getUniqueTestRef(prefix = 'TEST'): string {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}-${timestamp}-${random}`;
}

/**
 * Get a random sample requirement
 */
export function getRandomRequirement(): TestRequirement {
  const index = Math.floor(Math.random() * sampleRequirements.length);
  const requirement = sampleRequirements[index];
  return {
    ...requirement,
    ref: getUniqueTestRef(),
  };
}

/**
 * Get a random sample instruction
 */
export function getRandomInstruction(): TestCandidate {
  const index = Math.floor(Math.random() * sampleInstructions.length);
  return sampleInstructions[index];
}

/**
 * Test user credentials
 */
export const testUsers = {
  admin: {
    username: 'admin',
    password: 'admin123',
  },
  user: {
    username: 'testuser',
    password: 'test123',
  },
};

/**
 * Common test timeouts (in milliseconds)
 */
export const timeouts = {
  short: 5000,
  medium: 10000,
  long: 30000,
  veryLong: 60000,
};

/**
 * Common selectors
 */
export const selectors = {
  // Header
  tenantSelector: '[data-testid="tenant-selector"]',
  projectSelector: '[data-testid="project-selector"]',

  // Requirements page
  requirementsList: '[data-testid="requirements-list"]',
  requirementRow: '[data-testid="requirement-row"]',
  searchInput: 'input[placeholder*="Search"]',

  // AIRGen page
  instructionInput: 'textarea[name="instruction"]',
  generateButton: 'button[type="submit"]',
  candidateCard: '[data-testid="candidate-card"]',
  acceptButton: 'button:has-text("Accept")',
  rejectButton: 'button:has-text("Reject")',

  // Modals
  modal: '[role="dialog"]',
  modalClose: 'button[aria-label="Close"]',
  confirmButton: 'button:has-text("Confirm")',
  cancelButton: 'button:has-text("Cancel")',

  // Common
  loadingSpinner: '[data-testid="spinner"]',
  errorMessage: '[data-testid="error-message"]',
  successMessage: '[data-testid="success-message"]',
};
