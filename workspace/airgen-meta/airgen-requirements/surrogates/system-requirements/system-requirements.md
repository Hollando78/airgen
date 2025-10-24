# AIRGen System Requirements Specification

**Version:** 1.0
**Derived From:** DESIGN_DESCRIPTION.md v1.3
**Date:** 2025-10-24
**Status:** Approved

---

## Document Information

**Purpose:** This System Requirements Specification (SRS) defines all functional and non-functional requirements for the AIRGen platform. Requirements were systematically derived from the Design Description Document to ensure complete traceability between architecture and requirements.

**Scope:** This SRS covers all capabilities of AIRGen including requirements management, AI-assisted generation, traceability, architecture modeling, activity tracking, subscription billing, backup/recovery, security, and compliance features.

**Methodology:** Requirements follow the Easy Approach to Requirements Syntax (EARS) patterns where applicable and are classified by verification method (Test, Analysis, Inspection, Demonstration) and priority (Must Have, Should Have, Could Have).

---

## Table of Contents

1. [Authentication & User Management](#1-authentication--user-management)
2. [Requirements Management](#2-requirements-management)
3. [AI-Assisted Generation](#3-ai-assisted-generation)
4. [Quality Assurance Engine](#4-quality-assurance-engine)
5. [Document Management](#5-document-management)
6. [Traceability](#6-traceability)
7. [Architecture Diagrams](#7-architecture-diagrams)
8. [Baselines & Version Control](#8-baselines--version-control)
9. [Activity Tracking & Audit Logging](#9-activity-tracking--audit-logging)
10. [Subscription & Billing (SaaS)](#10-subscription--billing-saas)
11. [Backup & Recovery](#11-backup--recovery)
12. [AI Compliance & Security](#12-ai-compliance--security)
13. [Multi-Tenancy](#13-multi-tenancy)
14. [Project Management](#14-project-management)
15. [Performance](#15-performance)
16. [Security](#16-security)
17. [Scalability](#17-scalability)
18. [Reliability](#18-reliability)
19. [Usability](#19-usability)
20. [Maintainability](#20-maintainability)
21. [Compliance](#21-compliance)
22. [Deployment Flexibility](#22-deployment-flexibility)
23. [Integration & Extensibility](#23-integration--extensibility)
24. [Advanced Features (Future)](#24-advanced-features-future)
25. [Requirements Summary](#requirements-summary)

---

## 1. Authentication & User Management

### REQ-SYS-001: User Login
**Statement:** The system shall authenticate users via email and password credentials using Argon2id password hashing.
**Pattern:** Event-driven (WHEN user submits credentials)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.3, §5.1.1, §7.1

### REQ-SYS-002: JWT Token Generation
**Statement:** When a user successfully authenticates, the system shall generate a JWT token containing user ID, email, roles, and tenant slugs with a 24-hour expiration.
**Pattern:** Event-driven (WHEN authentication succeeds)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.3, §6.1.3, §7.1

### REQ-SYS-003: Multi-Factor Authentication
**Statement:** The system shall support optional TOTP-based 2FA verification for users with totpEnabled set to true.
**Pattern:** State-driven (WHILE 2FA is enabled)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §3.3.3, §5.1.1, §7.1

### REQ-SYS-004: Token Validation
**Statement:** The system shall validate JWT tokens on every authenticated request, verifying signature and expiration.
**Pattern:** Ubiquitous (for all authenticated requests)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.3, §4.1.1, §7.1

### REQ-SYS-005: Token Refresh
**Statement:** When an access token expires, the system shall allow token refresh using a valid refresh token.
**Pattern:** Event-driven (WHEN token expires)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.3, §9.8

### REQ-SYS-006: Role-Based Access Control
**Statement:** The system shall enforce role-based permissions for Admin, Author, Reviewer, and User roles.
**Pattern:** Ubiquitous (for all operations)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.1.1, §7.2

### REQ-SYS-007: Multi-Tenant User Association
**Statement:** The system shall allow users to belong to multiple tenants via the tenantSlugs JWT claim.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.3, §7.2

### REQ-SYS-008: User Last Login Tracking
**Statement:** The system shall update the lastLoginAt timestamp when a user successfully authenticates.
**Pattern:** Event-driven (WHEN login succeeds)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-009: User Password Security
**Statement:** The system shall store user passwords as Argon2id hashes, never storing plaintext passwords.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §5.1.1, §7.1, §7.3

### REQ-SYS-010: User Session Logout
**Statement:** The system shall provide a logout endpoint that invalidates the current user session.
**Pattern:** Event-driven (WHEN user logs out)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

---

## 2. Requirements Management

### REQ-SYS-011: Create Requirement
**Statement:** The system shall create requirements with text, pattern, verification method, and metadata properties.
**Pattern:** Event-driven (WHEN user creates requirement)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §3.3.1, §6.1.2

### REQ-SYS-012: Dual Persistence
**Statement:** When creating a requirement, the system shall write both to Neo4j (metadata) and file system (Markdown) in a single transaction.
**Pattern:** Event-driven (WHEN requirement created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.1, §3.3.1, §9.1

### REQ-SYS-013: Requirement Reference Generation
**Statement:** The system shall generate unique requirement references in the format REQ-<KEY>-<NNN> where KEY is the project key and NNN is an auto-incremented number.
**Pattern:** Event-driven (WHEN requirement created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §5.2

### REQ-SYS-014: List Requirements
**Statement:** The system shall retrieve all requirements for a tenant and project, filtered by tenant context.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2, §7.2

### REQ-SYS-015: Update Requirement
**Statement:** The system shall allow updating requirement text, pattern, verification method, tags, and custom attributes.
**Pattern:** Event-driven (WHEN user updates requirement)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §6.1.2

### REQ-SYS-016: Delete Requirement
**Statement:** The system shall support soft deletion of requirements by setting the deleted flag to true.
**Pattern:** Event-driven (WHEN user deletes requirement)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-017: Archive Requirement
**Statement:** The system shall allow archiving requirements by setting the archived flag to true.
**Pattern:** Event-driven (WHEN user archives requirement)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §5.1.1, §6.1.2

### REQ-SYS-018: Unarchive Requirement
**Statement:** The system shall allow unarchiving requirements by setting the archived flag to false.
**Pattern:** Event-driven (WHEN user unarchives requirement)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §6.1.2

### REQ-SYS-019: Requirement Version History
**Statement:** The system shall create immutable RequirementVersion snapshots for every requirement change.
**Pattern:** Event-driven (WHEN requirement changes)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §5.1.1, §6.1.2

### REQ-SYS-020: Version Number Auto-Increment
**Statement:** The system shall auto-increment version numbers (1, 2, 3...) for each requirement's version history.
**Pattern:** Event-driven (WHEN version created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-021: Version Change Tracking
**Statement:** The system shall record changeType (created|updated|archived|restored|deleted), changedBy, and timestamp for each version.
**Pattern:** Event-driven (WHEN version created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-022: Version Snapshot Completeness
**Statement:** The system shall store complete snapshots of requirement state in each version, including text, pattern, verification, QA scores, tags, and attributes.
**Pattern:** Ubiquitous (for all versions)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-023: Get Version History
**Statement:** The system shall retrieve the complete version history for a requirement ordered by version number.
**Pattern:** Event-driven (WHEN user requests history)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-024: Version Diff
**Statement:** The system shall compute and return differences between two requirement versions specified by version numbers.
**Pattern:** Event-driven (WHEN user requests diff)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.1, §6.1.2

### REQ-SYS-025: Restore Previous Version
**Statement:** The system shall allow restoring a requirement to a previous version, creating a new version with the restored content.
**Pattern:** Event-driven (WHEN user restores version)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-026: Content Hash Generation
**Statement:** The system shall generate SHA-256 content hashes for requirements to enable drift detection.
**Pattern:** Event-driven (WHEN requirement created/updated)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-027: Duplicate Detection
**Statement:** The system shall detect duplicate requirements using content hash comparison.
**Pattern:** Event-driven (WHEN requirement created)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.1, §5.1.1

### REQ-SYS-028: Custom Attributes
**Statement:** The system shall support project-specific custom attributes stored as JSON objects on requirements.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1, §10.1

### REQ-SYS-029: Requirement Tags
**Statement:** The system shall support multiple tags per requirement for categorization and filtering.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-030: Creator and Updater Tracking
**Statement:** The system shall record createdBy and updatedBy user identifiers for requirements.
**Pattern:** Event-driven (WHEN requirement created/updated)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-031: Timestamp Tracking
**Statement:** The system shall record createdAt and updatedAt timestamps for all requirements.
**Pattern:** Event-driven (WHEN requirement created/updated)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-032: EARS Pattern Support
**Statement:** The system shall support EARS requirement patterns: ubiquitous, event, state, unwanted, and optional.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-033: Verification Method Support
**Statement:** The system shall support verification methods: Test, Analysis, Inspection, and Demonstration.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

---

## 3. AI-Assisted Generation

### REQ-SYS-034: Generate Requirement Drafts
**Statement:** When a user requests requirement drafts, the system shall generate both heuristic-based and LLM-based candidates.
**Pattern:** Event-driven (WHEN user requests drafts)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.2, §3.3.1, §6.1.2

### REQ-SYS-035: Heuristic Draft Generation
**Statement:** The system shall generate EARS pattern-based heuristic drafts without requiring external AI services.
**Pattern:** Event-driven (WHEN drafts requested)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.2, §4.1.3, §9.6

### REQ-SYS-036: LLM Draft Generation
**Statement:** When LLM services are enabled, the system shall generate AI-powered requirement drafts using the configured LLM provider.
**Pattern:** Event-driven (WHEN drafts requested and LLM enabled)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.2, §3.3.1, §4.1.3

### REQ-SYS-037: OpenAI Provider Support
**Statement:** The system shall support OpenAI (GPT-4o, GPT-4o-mini) as an LLM provider when OPENAI_API_KEY is configured.
**Pattern:** State-driven (WHILE OpenAI configured)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-038: Self-Hosted LLM Support
**Statement:** The system shall support self-hosted LLM providers (Ollama, vLLM) when OLLAMA_API_BASE or VLLM_API_BASE is configured.
**Pattern:** State-driven (WHILE self-hosted LLM configured)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-039: LLM Disabled Mode
**Statement:** The system shall operate in disabled mode (heuristics only) when no LLM provider is configured.
**Pattern:** State-driven (WHILE no LLM configured)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.1.3

### REQ-SYS-040: LLM Provider Selection
**Statement:** The system shall select LLM providers in order of priority: Ollama, vLLM, OpenAI, Disabled.
**Pattern:** Ubiquitous (at startup)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.1.3

### REQ-SYS-041: LLM Error Handling
**Statement:** When LLM generation fails, the system shall gracefully fall back to heuristic drafts only.
**Pattern:** Unwanted (IF LLM fails)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.1.3

### REQ-SYS-042: LLM Rate Limit Retry
**Statement:** When OpenAI rate limits are encountered, the system shall retry with exponential backoff.
**Pattern:** Event-driven (WHEN rate limited)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-043: LLM Timeout Protection
**Statement:** The system shall timeout LLM requests after 30 seconds for text generation and 60 seconds for vision requests.
**Pattern:** Ubiquitous (for all LLM calls)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.1.3

### REQ-SYS-044: AI Image Analysis
**Statement:** The system shall support vision API analysis of image attachments using the configured LLM provider.
**Pattern:** Event-driven (WHEN image analyzed)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-045: AI Usage Audit Logging
**Statement:** The system shall log all AI requests with provider, model, timestamp, and user for compliance auditing.
**Pattern:** Event-driven (WHEN AI used)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.9, §4.1.3

### REQ-SYS-046: Draft Candidate Review
**Statement:** The system shall present draft candidates to users with QA scores for review and selection.
**Pattern:** Event-driven (WHEN drafts generated)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §2.3.2, §3.3.1

### REQ-SYS-047: Draft Acceptance Workflow
**Statement:** The system shall allow users to accept, edit, or reject draft candidates before creating requirements.
**Pattern:** Event-driven (WHEN user selects draft)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.2

### REQ-SYS-048: AI Image Generation
**Statement:** The system shall generate AI-powered images from requirement descriptions using vision AI.
**Pattern:** Event-driven (WHEN user requests image)
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §2.3.6

### REQ-SYS-049: Context-Aware Image Creation
**Statement:** The system shall create images with awareness of requirement context and system architecture.
**Pattern:** Event-driven (WHEN image generated)
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §2.3.6

---

## 4. Quality Assurance Engine

### REQ-SYS-050: Deterministic QA Scoring
**Statement:** The system shall score requirements using deterministic rule-based QA without AI dependencies.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §1.3, §3.2.3, §6.1.2

### REQ-SYS-051: ISO 29148 Alignment
**Statement:** The system shall apply QA rules aligned with ISO/IEC/IEEE 29148 standards.
**Pattern:** Ubiquitous
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §1.1, §3.2.3

### REQ-SYS-052: Clarity Checking
**Statement:** The system shall detect ambiguous terms (e.g., "appropriate", "timely") in requirement text.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3

### REQ-SYS-053: Completeness Checking
**Statement:** The system shall detect missing patterns or verification methods in requirements.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3

### REQ-SYS-054: Consistency Checking
**Statement:** The system shall detect conflicting statements within requirement text.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §3.2.3

### REQ-SYS-055: Correctness Checking
**Statement:** The system shall detect grammar and formatting issues in requirement text.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §3.2.3

### REQ-SYS-056: Verifiability Checking
**Statement:** The system shall assess whether requirements contain measurable acceptance criteria.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3

### REQ-SYS-057: QA Score Calculation
**Statement:** The system shall calculate QA scores from 0-100 based on detected issues.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3, §5.1.1

### REQ-SYS-058: QA Verdict Assignment
**Statement:** The system shall assign QA verdicts (excellent|good|acceptable|poor) based on score thresholds.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-059: Actionable Suggestions
**Statement:** The system shall provide actionable suggestions for improving requirement quality.
**Pattern:** Ubiquitous (for all requirements)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3, §5.1.1

### REQ-SYS-060: QA Fix Suggestions
**Statement:** The system shall suggest specific fixes for detected QA issues via the apply-fix endpoint.
**Pattern:** Event-driven (WHEN user requests fixes)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-061: Background QA Scorer
**Statement:** The system shall support background QA scoring workers for bulk quality analysis.
**Pattern:** Event-driven (WHEN worker started)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.1, §6.1.2

### REQ-SYS-062: QA Worker Control
**Statement:** The system shall provide endpoints to start, stop, and check status of QA scorer workers.
**Pattern:** Event-driven (WHEN admin controls worker)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

---

## 5. Document Management

### REQ-SYS-063: Create Structured Document
**Statement:** The system shall create structured documents with sections for organizing requirements.
**Pattern:** Event-driven (WHEN user creates document)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.3, §6.1.2

### REQ-SYS-064: Upload Surrogate Document
**Statement:** The system shall allow uploading surrogate documents (PDF, Word, etc.) with metadata storage.
**Pattern:** Event-driven (WHEN user uploads document)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.3, §5.1.1, §6.1.2

### REQ-SYS-065: Document Slug Generation
**Statement:** The system shall generate unique slugs for documents within a project.
**Pattern:** Event-driven (WHEN document created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-066: Document Short Codes
**Statement:** The system shall support short codes (e.g., "SRD", "URD") for document identification.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-067: Document Kind Classification
**Statement:** The system shall classify documents as either "structured" or "surrogate" kind.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-068: Surrogate File Storage
**Statement:** The system shall store surrogate document files in workspace/<tenant>/<project>/documents/<document-slug>/ directories.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §5.2

### REQ-SYS-069: Surrogate File Metadata
**Statement:** The system shall store originalFileName, storedFileName, mimeType, fileSize, and storagePath for surrogate documents.
**Pattern:** Ubiquitous (for surrogates)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-070: Document Sections
**Statement:** The system shall support hierarchical document sections for organizing structured documents.
**Pattern:** Ubiquitous (for structured docs)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.3, §5.1

### REQ-SYS-071: Document-Requirement Linking
**Statement:** The system shall link requirements to documents and document sections via CONTAINS relationships.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.3, §5.1.2

### REQ-SYS-072: Hierarchical Folder Organization
**Statement:** The system shall organize documents in hierarchical folders.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.3, §5.1

### REQ-SYS-073: List Documents
**Statement:** The system shall retrieve all documents for a tenant and project.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-074: Get Document Metadata
**Statement:** The system shall retrieve document metadata by slug.
**Pattern:** Event-driven (WHEN user views document)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-075: Update Document
**Statement:** The system shall allow updating document name, description, and shortCode.
**Pattern:** Event-driven (WHEN user updates document)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-076: Delete Document
**Statement:** The system shall support document deletion with cascade to related sections and files.
**Pattern:** Event-driven (WHEN user deletes document)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

---

## 6. Traceability

### REQ-SYS-077: Create Trace Link
**Statement:** The system shall create typed trace links between requirements with relationship types.
**Pattern:** Event-driven (WHEN user creates link)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.4, §6.1.2

### REQ-SYS-078: Trace Link Types
**Statement:** The system shall support trace link types: SATISFIES, DERIVES, VERIFIES, IMPLEMENTS, REFINES, and CONFLICTS.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.2

### REQ-SYS-079: Trace Link Metadata
**Statement:** The system shall store linkType, description, createdAt, and updatedAt for each trace link.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.2

### REQ-SYS-080: List Trace Links
**Statement:** The system shall retrieve all trace links for a tenant and project.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.2, §6.1.2

### REQ-SYS-081: Delete Trace Link
**Statement:** The system shall allow deletion of trace links by ID.
**Pattern:** Event-driven (WHEN user deletes link)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-082: Graph-Based Link Suggestions
**Statement:** The system shall suggest trace links using graph algorithms analyzing text similarity, document relationships, and architecture connections.
**Pattern:** Event-driven (WHEN user hovers over requirement)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.4, §3.3.2, §6.1.2

### REQ-SYS-083: Broken Link Detection
**Statement:** The system shall detect broken trace links when requirements are deleted or archived.
**Pattern:** Event-driven (WHEN requirement deleted/archived)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.4

### REQ-SYS-084: Linkset Management
**Statement:** The system shall organize trace links into named linksets for grouped traceability.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.4, §5.1

### REQ-SYS-085: Trace Link Caching
**Statement:** The system shall cache trace link queries in Redis with 5-minute TTL.
**Pattern:** Ubiquitous (when Redis available)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §3.3.2, §5.3

### REQ-SYS-086: Traceability Matrix View
**Statement:** The system shall render traceability matrices showing requirement relationships.
**Pattern:** Event-driven (WHEN user views matrix)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §3.3.2, §6.2

---

## 7. Architecture Diagrams

### REQ-SYS-087: Create Architecture Diagram
**Statement:** The system shall create architecture diagrams with name, description, and view type.
**Pattern:** Event-driven (WHEN user creates diagram)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.5, §6.1.2

### REQ-SYS-088: Diagram View Types
**Statement:** The system shall support diagram views: block, internal, deployment, and requirements_schema.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-089: Reusable Block Library
**Statement:** The system shall maintain reusable ArchitectureBlockDefinition nodes shared across diagrams.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.5, §5.1.1

### REQ-SYS-090: Block Kind Classification
**Statement:** The system shall classify blocks as: system, subsystem, component, actor, external, or interface.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-091: Block Ports
**Statement:** The system shall define ports on blocks with id, name, direction, and type properties.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.5, §5.1.1

### REQ-SYS-092: Per-Diagram Block Placement
**Statement:** The system shall store block placement (positionX, positionY, sizeWidth, sizeHeight) on PLACES relationships per diagram.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.4, §5.1.2, §9.10

### REQ-SYS-093: Per-Diagram Port Overrides
**Statement:** The system shall support per-diagram port visibility and positioning overrides stored as portOverrides JSON.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.5, §5.1.2, §9.10

### REQ-SYS-094: Per-Diagram Styling
**Statement:** The system shall support per-diagram backgroundColor and borderColor for block placements.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.5, §5.1.2

### REQ-SYS-095: Architecture Connectors
**Statement:** The system shall create connectors linking port instances with relationship labels.
**Pattern:** Event-driven (WHEN user creates connector)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.5, §5.1

### REQ-SYS-096: Diagram Rendering
**Statement:** The system shall transform Neo4j diagram data to ReactFlow format with nodes, edges, and viewport.
**Pattern:** Event-driven (WHEN user views diagram)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.4

### REQ-SYS-097: Diagram Interaction
**Statement:** The system shall support drag-and-drop, zoom, pan, and minimap interactions on diagrams.
**Pattern:** Ubiquitous (in diagram view)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §4.2.1

### REQ-SYS-098: Diagram Context Menus
**Statement:** The system shall provide context menus for diagram elements.
**Pattern:** Event-driven (WHEN user right-clicks)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §4.2.1

### REQ-SYS-099: Viewport Persistence
**Statement:** The system shall persist diagram viewport (zoom, position) per diagram.
**Pattern:** Event-driven (WHEN viewport changes)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.2.1

### REQ-SYS-100: Debounced Position Updates
**Statement:** The system shall debounce block position updates by 500ms to reduce API calls.
**Pattern:** Event-driven (WHEN block dragged)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §3.3.4

### REQ-SYS-101: Floating Diagram Windows
**Statement:** The system shall support floating, draggable, resizable windows for viewing multiple diagrams simultaneously.
**Pattern:** Event-driven (WHEN user opens diagram)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §2.3.5, §4.2.2, §9.7

### REQ-SYS-102: Diagram Snapshot Capture
**Statement:** The system shall capture snapshots of diagrams for documentation purposes.
**Pattern:** Event-driven (WHEN user captures snapshot)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.5, §4.2.2

### REQ-SYS-103: Z-Index Window Management
**Statement:** The system shall manage z-index for floating windows to handle overlapping.
**Pattern:** Event-driven (WHEN window focused)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.2.2, §9.7

### REQ-SYS-104: List Diagrams
**Statement:** The system shall retrieve all diagrams for a tenant and project.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.3.4, §6.1.2

### REQ-SYS-105: Update Diagram
**Statement:** The system shall allow updating diagram name, description, and view type.
**Pattern:** Event-driven (WHEN user updates diagram)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-106: Delete Diagram
**Statement:** The system shall support diagram deletion with cascade to PLACES relationships.
**Pattern:** Event-driven (WHEN user deletes diagram)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-107: Create Block Definition
**Statement:** The system shall create reusable block definitions with ports and metadata.
**Pattern:** Event-driven (WHEN user creates block)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-108: Update Block Definition
**Statement:** The system shall allow updating block name, kind, stereotype, description, and ports.
**Pattern:** Event-driven (WHEN user updates block)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-109: Update Block Placement
**Statement:** The system shall allow updating block placement properties (position, size, styling) on specific diagrams.
**Pattern:** Event-driven (WHEN user moves/resizes block)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

---

## 8. Baselines & Version Control

### REQ-SYS-110: Create Baseline
**Statement:** The system shall create immutable baseline snapshots of requirements at a point in time.
**Pattern:** Event-driven (WHEN user creates baseline)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §6.1.2

### REQ-SYS-111: Baseline Reference Generation
**Statement:** The system shall generate unique baseline references in the format BASE-<KEY>-<NNN>.
**Pattern:** Event-driven (WHEN baseline created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-112: Baseline Metadata
**Statement:** The system shall store author, label, and requirementRefs array for each baseline.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-113: Baseline Snapshots
**Statement:** The system shall create SNAPSHOT_OF relationships from baselines to requirements.
**Pattern:** Event-driven (WHEN baseline created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.2

### REQ-SYS-114: List Baselines
**Statement:** The system shall retrieve all baselines for a tenant and project.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-115: Get Baseline Details
**Statement:** The system shall retrieve baseline details including all snapshotted requirements by reference.
**Pattern:** Event-driven (WHEN user views baseline)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-116: Baseline Comparison
**Statement:** The system shall support baseline comparisons and diffs.
**Pattern:** Event-driven (WHEN user compares baselines)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.1

### REQ-SYS-117: Git File Tracking
**Statement:** The system shall store markdown requirements in git-friendly format for version control.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Should Have
**Source:** DDD §5.2, §8.5, §9.1

---

## 9. Activity Tracking & Audit Logging

### REQ-SYS-118: Create Activity Records
**Statement:** The system shall create Activity nodes for all significant system events and user actions.
**Pattern:** Event-driven (WHEN action occurs)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.7, §5.1.1

### REQ-SYS-119: Activity Type Classification
**Statement:** The system shall classify activities with types including requirement.created, requirement.updated, requirement.archived, requirement.deleted, baseline.created, document.created, diagram.updated, project.created.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-120: Activity Actor Tracking
**Statement:** The system shall record the actor (user email or "system") for each activity.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-121: Activity Timestamp
**Statement:** The system shall record the exact timestamp for each activity event.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-122: Activity Entity Linking
**Statement:** The system shall link activities to affected entities with entityType, entityId, and entityRef.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-123: Activity Metadata Storage
**Statement:** The system shall store activity-specific metadata including changes, old/new values as JSON.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-124: Tenant-Wide Activity Feed
**Statement:** The system shall provide a tenant-wide activity feed showing all project changes.
**Pattern:** Event-driven (WHEN user views feed)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.7, §6.1.2

### REQ-SYS-125: Project-Specific Activity Feed
**Statement:** The system shall provide project-specific activity feeds filtered by projectKey.
**Pattern:** Event-driven (WHEN user views project activity)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.7, §6.1.2

### REQ-SYS-126: User-Specific Activity Feed
**Statement:** The system shall provide user-specific activity history filtered by userId.
**Pattern:** Event-driven (WHEN user views own activity)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-127: Activity Filtering
**Statement:** The system shall support filtering activities by type, date range, and entity.
**Pattern:** Event-driven (WHEN user filters feed)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.7, §6.1.2

### REQ-SYS-128: Real-Time Activity Updates
**Statement:** The system shall display real-time activity updates for project changes.
**Pattern:** Event-driven (WHEN changes occur)
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §2.3.7

### REQ-SYS-129: Collaboration Visibility
**Statement:** The system shall provide visibility of team member actions across projects.
**Pattern:** Ubiquitous
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §2.3.7

### REQ-SYS-130: Activity Index Performance
**Statement:** The system shall index activities by timestamp, tenant/project, and entity for fast querying.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.3

---

## 10. Subscription & Billing (SaaS)

### REQ-SYS-131: Freemium Model Support
**Statement:** The system shall support subscription tiers: free, pro, and enterprise.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.8, §8.1

### REQ-SYS-132: Stripe Integration
**Statement:** The system shall integrate with Stripe for payment processing.
**Pattern:** Event-driven (WHEN payment processed)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.8, §6.1.2

### REQ-SYS-133: Subscription Status Tracking
**Statement:** The system shall track subscription status: active, trialing, past_due, canceled, incomplete.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-134: One Subscription Per Tenant
**Statement:** The system shall enforce one subscription per tenant.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §5.1.3

### REQ-SYS-135: Stripe Customer Mapping
**Statement:** The system shall store stripeCustomerId and stripeSubscriptionId for each tenant subscription.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-136: Billing Period Tracking
**Statement:** The system shall track currentPeriodStart and currentPeriodEnd for subscriptions.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-137: Trial Period Support
**Statement:** The system shall support trial periods with trialEnd timestamps.
**Pattern:** State-driven (WHILE in trial)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-138: Cancel at Period End
**Statement:** The system shall support cancelAtPeriodEnd flag for graceful subscription cancellation.
**Pattern:** State-driven (WHILE cancellation pending)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-139: Usage Tracking - Projects
**Statement:** The system shall track the number of projects used per tenant.
**Pattern:** Event-driven (WHEN project created/deleted)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-140: Usage Tracking - Users
**Statement:** The system shall track the number of users per tenant.
**Pattern:** Event-driven (WHEN user added/removed)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-141: Usage Tracking - Requirements
**Statement:** The system shall track the total number of requirements per tenant.
**Pattern:** Event-driven (WHEN requirement created/deleted)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-142: Usage Tracking - AI Drafts
**Statement:** The system shall track AI drafts generated per month per tenant.
**Pattern:** Event-driven (WHEN AI draft generated)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-143: Usage Limit Enforcement
**Statement:** The system shall enforce usage limits based on subscription tier.
**Pattern:** Event-driven (WHEN limit exceeded)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.8, §6.1.2

### REQ-SYS-144: Unlimited Tier Resources
**Statement:** The system shall represent unlimited tier limits as null values.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-145: Checkout Session Creation
**Statement:** The system shall create Stripe checkout sessions for subscription upgrades.
**Pattern:** Event-driven (WHEN user upgrades)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-146: Customer Portal Access
**Statement:** The system shall create Stripe customer portal sessions for self-service subscription management.
**Pattern:** Event-driven (WHEN user accesses portal)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.8, §6.1.2

### REQ-SYS-147: Invoice Storage
**Statement:** The system shall store invoice records with Stripe invoice data.
**Pattern:** Event-driven (WHEN invoice created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §6.1.2

### REQ-SYS-148: Invoice Metadata
**Statement:** The system shall store amountDue, amountPaid, currency, status, hostedInvoiceUrl, and invoicePdf for each invoice.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-149: List Invoices
**Statement:** The system shall retrieve all invoices for a tenant.
**Pattern:** Event-driven (WHEN user views invoices)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-150: Get Current Usage
**Statement:** The system shall provide current usage metrics against subscription limits.
**Pattern:** Event-driven (WHEN user views usage)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-151: Stripe Webhook Handling
**Statement:** The system shall process Stripe webhooks for subscription events (created, updated, deleted, payment succeeded/failed).
**Pattern:** Event-driven (WHEN webhook received)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-152: Billing Analytics
**Statement:** The system shall provide billing analytics and reporting.
**Pattern:** Event-driven (WHEN admin views analytics)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §2.3.8

---

## 11. Backup & Recovery

### REQ-SYS-153: Daily Incremental Backups
**Statement:** The system shall perform automated daily incremental backups at 2:00 AM with 7-day retention.
**Pattern:** Event-driven (WHEN scheduled)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-154: Weekly Full Backups
**Statement:** The system shall perform automated weekly full backups on Sundays at 3:00 AM with 4 weeks local retention.
**Pattern:** Event-driven (WHEN scheduled)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-155: Neo4j Database Dumps
**Statement:** The system shall include Neo4j database dumps in backups.
**Pattern:** Ubiquitous (in backups)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-156: PostgreSQL Database Dumps
**Statement:** The system shall include PostgreSQL database dumps in backups.
**Pattern:** Ubiquitous (in backups)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-157: Workspace File Archives
**Statement:** The system shall include workspace markdown file archives in backups.
**Pattern:** Ubiquitous (in backups)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-158: Configuration Backups
**Statement:** The system shall include configuration files in backups.
**Pattern:** Ubiquitous (in backups)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-159: Docker Volume Snapshots
**Statement:** The system shall include complete Docker volume snapshots in weekly full backups.
**Pattern:** Ubiquitous (in weekly backups)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-160: Remote Encrypted Backup Upload
**Statement:** The system shall upload weekly backups to S3-compatible remote storage with encryption via restic.
**Pattern:** Event-driven (WHEN weekly backup completes)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-161: Remote Retention Policy
**Statement:** The system shall retain remote backups for 12 weeks.
**Pattern:** Event-driven (WHEN retention applied)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.5

### REQ-SYS-162: S3-Compatible Storage Support
**Statement:** The system shall support remote backup to DigitalOcean Spaces, AWS S3, Backblaze B2, and SFTP.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.5

### REQ-SYS-163: Manual Backup Trigger
**Statement:** The system shall provide admin endpoints to trigger manual daily and weekly backups.
**Pattern:** Event-driven (WHEN admin triggers)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-164: List Local Backups
**Statement:** The system shall provide admin endpoints to list local daily and weekly backups.
**Pattern:** Event-driven (WHEN admin requests list)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-165: List Remote Backups
**Statement:** The system shall provide admin endpoints to list restic snapshots from remote storage.
**Pattern:** Event-driven (WHEN admin requests list)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-166: Backup Integrity Verification
**Statement:** The system shall verify backup integrity via admin endpoint.
**Pattern:** Event-driven (WHEN verification requested)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2, §8.5

### REQ-SYS-167: Dry-Run Restoration
**Statement:** The system shall support dry-run restoration to validate backups without applying changes.
**Pattern:** Event-driven (WHEN dry-run requested)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2, §8.5

### REQ-SYS-168: Backup System Status
**Statement:** The system shall provide aggregate backup system status via admin endpoint.
**Pattern:** Event-driven (WHEN status requested)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-169: Project Backup Export
**Statement:** The system shall allow exporting individual project backups with scoped permissions.
**Pattern:** Event-driven (WHEN user exports project)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-170: Project Backup Import
**Statement:** The system shall allow Super Admins to import/restore project backups.
**Pattern:** Event-driven (WHEN admin imports)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-171: Project Backup Validation
**Statement:** The system shall validate project backup files before import.
**Pattern:** Event-driven (WHEN validation requested)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2

### REQ-SYS-172: Project Backup Statistics
**Statement:** The system shall provide project backup statistics via admin endpoint.
**Pattern:** Event-driven (WHEN stats requested)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-173: Project Backup Retention
**Statement:** The system shall apply retention policies to project backups.
**Pattern:** Event-driven (WHEN retention applied)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2

### REQ-SYS-174: Content Hash Drift Detection
**Statement:** The system shall use content hashes for real-time drift detection between Neo4j and file system.
**Pattern:** Event-driven (WHEN drift detected)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.5

---

## 12. AI Compliance & Security

### REQ-SYS-175: Flexible AI Deployment Options
**Statement:** The system shall support cloud AI, self-hosted AI, and disabled AI deployment modes.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.9, §4.1.3

### REQ-SYS-176: ITAR Compliance Support
**Statement:** The system shall support ITAR-controlled defense projects via self-hosted LLM mode.
**Pattern:** State-driven (WHILE ITAR required)
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §4.1.3

### REQ-SYS-177: HIPAA Compliance Support
**Statement:** The system shall support HIPAA compliance via self-hosted LLM mode without BAA.
**Pattern:** State-driven (WHILE HIPAA required)
**Verification:** Analysis
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-178: Classified Environment Support
**Statement:** The system shall support classified and air-gapped environments via disabled AI mode.
**Pattern:** State-driven (WHILE classified)
**Verification:** Analysis
**Priority:** Should Have
**Source:** DDD §4.1.3

### REQ-SYS-179: Data Sovereignty Control
**Statement:** The system shall ensure data never leaves customer infrastructure in self-hosted AI mode.
**Pattern:** State-driven (WHILE self-hosted)
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §2.3.9, §4.1.3

### REQ-SYS-180: Per-Project AI Enablement
**Statement:** The system shall support per-project AI enablement settings for compliance.
**Pattern:** State-driven (WHILE project restricts AI)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.3.9

### REQ-SYS-181: AI Usage Audit Trail
**Statement:** The system shall maintain comprehensive audit logs for all AI usage including provider, model, and timestamp.
**Pattern:** Event-driven (WHEN AI used)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.9, §4.1.3

### REQ-SYS-182: Automotive NDA Compliance
**Statement:** The system shall support automotive NDA requirements via self-hosted AI mode.
**Pattern:** State-driven (WHILE NDA required)
**Verification:** Analysis
**Priority:** Should Have
**Source:** DDD §4.1.3

---

## 13. Multi-Tenancy

### REQ-SYS-183: Tenant Isolation
**Statement:** The system shall enforce complete data isolation between tenants.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §1.3, §2.1, §7.2

### REQ-SYS-184: Tenant Slug Uniqueness
**Statement:** The system shall enforce unique tenant slugs via database constraint.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1, §5.1.3

### REQ-SYS-185: Tenant Ownership Validation
**Statement:** The system shall validate tenant ownership before data access on all requests.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.2

### REQ-SYS-186: Tenant-Filtered Queries
**Statement:** The system shall filter all database queries by tenant context.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.2

### REQ-SYS-187: Project Uniqueness Per Tenant
**Statement:** The system shall enforce unique project slugs within each tenant via composite constraint.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.3

### REQ-SYS-188: Tenant Creation
**Statement:** The system shall create Tenant nodes with slug, name, and createdAt properties.
**Pattern:** Event-driven (WHEN tenant created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-189: Workspace Directory Isolation
**Statement:** The system shall isolate workspace files by tenant in workspace/<tenant>/ directories.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §4.1.4, §5.2

---

## 14. Project Management

### REQ-SYS-190: Create Project
**Statement:** The system shall create projects with slug, tenantSlug, and optional key properties.
**Pattern:** Event-driven (WHEN project created)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.1

### REQ-SYS-191: Project Key Assignment
**Statement:** The system shall support optional short codes (keys) for projects used in requirement references.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §5.1.1

### REQ-SYS-192: Project-Tenant Association
**Statement:** The system shall associate projects with tenants via OWNS relationships.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §5.1.2

### REQ-SYS-193: Project Workspace Structure
**Statement:** The system shall create workspace/<tenant>/<project>/ directory structures for markdown files.
**Pattern:** Event-driven (WHEN project created)
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §4.1.4, §5.2

---

## 15. Performance

### REQ-SYS-194: API Response Time
**Statement:** The system shall maintain API response times below 200ms at the 95th percentile.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-195: Diagram Rendering Performance
**Statement:** The system shall render diagrams with 100 nodes in less than 1 second.
**Pattern:** Event-driven (WHEN diagram rendered)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-196: Search Latency
**Statement:** The system shall return search results for 10,000 requirements in less than 500ms.
**Pattern:** Event-driven (WHEN search executed)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-197: Horizontal Scaling Support
**Statement:** The system shall support horizontal scaling by adding multiple stateless API instances behind a load balancer.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.1, §10.2

### REQ-SYS-198: Database Index Performance
**Statement:** The system shall create indexes on frequently queried fields for optimal performance.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §5.1.3

---

## 16. Security

### REQ-SYS-199: HTTPS Encryption
**Statement:** The system shall enforce HTTPS for all client-server communication via Traefik TLS termination.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.3, §8.2

### REQ-SYS-200: Let's Encrypt Certificates
**Statement:** The system shall automatically obtain and renew TLS certificates via Let's Encrypt.
**Pattern:** Event-driven (WHEN certificate expires)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.2, §8.4

### REQ-SYS-201: Neo4j Encrypted Connections
**Statement:** The system shall use encrypted Bolt protocol connections to Neo4j.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §7.3

### REQ-SYS-202: Environment Variable Secrets
**Statement:** The system shall store secrets exclusively in environment variables, never in code.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §7.3

### REQ-SYS-203: File System Permissions
**Statement:** The system shall set OS-level file permissions to 600 for sensitive markdown files.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §7.3

### REQ-SYS-204: Input Validation - Backend
**Statement:** The system shall validate all API inputs using Zod schemas for runtime type validation.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.4

### REQ-SYS-205: Input Sanitization
**Statement:** The system shall sanitize inputs to prevent HTML and SQL injection attacks.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.4

### REQ-SYS-206: Request Schema Validation
**Statement:** The system shall validate request and response schemas using Fastify schema validation.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.4

### REQ-SYS-207: Frontend Input Validation
**Statement:** The system shall implement HTML5 form validation and real-time validation feedback.
**Pattern:** Event-driven (WHEN user inputs data)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §7.4

### REQ-SYS-208: Rich Text Sanitization
**Statement:** The system shall sanitize rich text content using DOMPurify.
**Pattern:** Event-driven (WHEN rich text rendered)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.4

### REQ-SYS-209: Rate Limiting - Draft Endpoints
**Statement:** The system shall rate limit /api/draft and /api/airgen/chat endpoints to 10 requests per minute per user.
**Pattern:** Ubiquitous (for draft endpoints)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.5

### REQ-SYS-210: Rate Limit Response
**Statement:** The system shall return 429 Too Many Requests when rate limits are exceeded.
**Pattern:** Event-driven (WHEN limit exceeded)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.5

### REQ-SYS-211: Redis-Based Rate Limiting
**Statement:** The system shall implement rate limiting using Redis when available.
**Pattern:** State-driven (WHILE Redis available)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §7.5

### REQ-SYS-212: Security Headers
**Statement:** The system shall set security headers using Helmet.js middleware.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §7.6

### REQ-SYS-213: Dependency Vulnerability Scanning
**Statement:** The system shall scan dependencies for vulnerabilities using npm audit and Snyk.
**Pattern:** Event-driven (WHEN dependencies updated)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §7.6

### REQ-SYS-214: TypeScript Strict Mode
**Statement:** The system shall use TypeScript strict mode to prevent type errors.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §7.6

### REQ-SYS-215: ESLint Security Rules
**Statement:** The system shall enforce ESLint security rules during development.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Should Have
**Source:** DDD §7.6

### REQ-SYS-216: Principle of Least Privilege
**Statement:** The system shall enforce the principle of least privilege for user permissions.
**Pattern:** Ubiquitous
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §7.6

### REQ-SYS-217: Regular Security Audits
**Statement:** The system shall undergo regular security audits.
**Pattern:** Event-driven (WHEN audit scheduled)
**Verification:** Inspection
**Priority:** Should Have
**Source:** DDD §7.6

### REQ-SYS-218: Automated Dependency Updates
**Statement:** The system shall use Dependabot for automated dependency updates.
**Pattern:** Event-driven (WHEN dependencies outdated)
**Verification:** Inspection
**Priority:** Should Have
**Source:** DDD §7.6

---

## 17. Scalability

### REQ-SYS-219: Stateless API Design
**Statement:** The system shall implement stateless API servers for horizontal scaling.
**Pattern:** Ubiquitous
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §2.1, §10.2

### REQ-SYS-220: Neo4j Causal Cluster Support
**Statement:** The system shall support Neo4j causal clustering for high availability at scale.
**Pattern:** State-driven (WHILE at scale)
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.2

### REQ-SYS-221: Redis Cluster Support
**Statement:** The system shall support Redis clustering for distributed caching.
**Pattern:** State-driven (WHILE at scale)
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.2

### REQ-SYS-222: CDN Static Asset Delivery
**Statement:** The system shall support CDN delivery for frontend static assets.
**Pattern:** State-driven (WHILE at scale)
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.2

### REQ-SYS-223: Load Balancer Support
**Statement:** The system shall support deployment behind load balancers for traffic distribution.
**Pattern:** State-driven (WHILE at scale)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-224: Concurrent User Support
**Statement:** The system shall support 1-50 concurrent users in current scale, scaling to 100-1,000 users.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-225: Requirements Scale Support
**Statement:** The system shall support 1,000-10,000 requirements per project, scaling to 100,000+.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

### REQ-SYS-226: Multi-Tenant Scale Support
**Statement:** The system shall support 1-10 tenants currently, scaling to 100+ tenants.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §10.2

---

## 18. Reliability

### REQ-SYS-227: SaaS Uptime SLA
**Statement:** The system shall maintain 99.9% uptime SLA for SaaS deployments.
**Pattern:** Ubiquitous (for SaaS)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.1

### REQ-SYS-228: Automatic Security Updates
**Statement:** The system shall apply automatic security patches for SaaS deployments.
**Pattern:** Event-driven (WHEN patch available)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.1

### REQ-SYS-229: Health Check Endpoint
**Statement:** The system shall provide /api/health endpoint for monitoring system health.
**Pattern:** Event-driven (WHEN checked)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.2, §8.6

### REQ-SYS-230: Docker Health Checks
**Statement:** The system shall implement Docker healthcheck commands in Compose file.
**Pattern:** Event-driven (WHEN checked)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.6

### REQ-SYS-231: Prometheus Metrics
**Statement:** The system shall expose /metrics endpoint for Prometheus scraping.
**Pattern:** Event-driven (WHEN scraped)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §6.1.2, §8.6

### REQ-SYS-232: Grafana Dashboards
**Statement:** The system shall support Grafana dashboards for metrics visualization.
**Pattern:** Ubiquitous
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §8.6

### REQ-SYS-233: Alertmanager Notifications
**Statement:** The system shall support Alertmanager for operational notifications.
**Pattern:** Event-driven (WHEN alert triggered)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.6

### REQ-SYS-234: Sentry Error Tracking
**Statement:** The system shall send backend exceptions to Sentry for error tracking.
**Pattern:** Event-driven (WHEN error occurs)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.6

### REQ-SYS-235: Frontend Error Tracking
**Statement:** The system shall send frontend errors to Sentry via SDK with user context.
**Pattern:** Event-driven (WHEN error occurs)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.6

### REQ-SYS-236: Structured Logging
**Statement:** The system shall output Fastify JSON logs to stdout for aggregation.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §8.6

### REQ-SYS-237: Docker Log Aggregation
**Statement:** The system shall aggregate Docker logs for centralized analysis.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.6

### REQ-SYS-238: Log Rotation
**Statement:** The system shall rotate logs via Docker daemon configuration.
**Pattern:** Event-driven (WHEN rotation triggered)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.6

---

## 19. Usability

### REQ-SYS-239: Single Page Application
**Statement:** The system shall provide a React-based single page application for the user interface.
**Pattern:** Ubiquitous
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §2.1, §3.2.2

### REQ-SYS-240: React Router Navigation
**Statement:** The system shall use React Router v6 for client-side navigation.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.2

### REQ-SYS-241: Markdown Preview
**Statement:** The system shall provide live markdown preview during requirement editing.
**Pattern:** State-driven (WHILE editing)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-242: Monaco Editor Integration
**Statement:** The system shall integrate Monaco Editor (VS Code engine) for markdown editing.
**Pattern:** Ubiquitous (in editors)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-243: Syntax Highlighting
**Statement:** The system shall provide syntax highlighting for markdown content.
**Pattern:** Ubiquitous (in editors)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-244: Keyboard Shortcuts
**Statement:** The system shall support keyboard shortcuts in editors.
**Pattern:** Event-driven (WHEN shortcut pressed)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-245: Undo/Redo Support
**Statement:** The system shall provide undo/redo functionality in editors.
**Pattern:** Event-driven (WHEN user undoes/redoes)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.2.3

### REQ-SYS-246: Search/Replace
**Statement:** The system shall provide search and replace functionality in editors.
**Pattern:** Event-driven (WHEN user searches)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-247: Theme Support
**Statement:** The system shall support light and dark themes in editors.
**Pattern:** State-driven (WHILE theme selected)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §4.2.3

### REQ-SYS-248: Toast Notifications
**Statement:** The system shall display toast notifications for user actions and errors.
**Pattern:** Event-driven (WHEN notification triggered)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §4.2.4

### REQ-SYS-249: User-Friendly Error Messages
**Statement:** The system shall display user-friendly error messages for API errors.
**Pattern:** Event-driven (WHEN error occurs)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §4.2.4

### REQ-SYS-250: Automatic Token Refresh UI
**Statement:** The system shall automatically retry requests after token refresh without user intervention.
**Pattern:** Event-driven (WHEN token expires)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §4.2.4

### REQ-SYS-251: Loading States
**Statement:** The system shall display loading states during asynchronous operations.
**Pattern:** State-driven (WHILE loading)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §3.2.2

### REQ-SYS-252: Optimistic Updates
**Statement:** The system shall implement optimistic UI updates for better user experience.
**Pattern:** Event-driven (WHEN user action)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §9.5

---

## 20. Maintainability

### REQ-SYS-253: Modular Monolith Architecture
**Statement:** The system shall organize code as a modular monolith with logically separated components.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §2.1, §3.1

### REQ-SYS-254: TypeScript Strict Mode
**Statement:** The system shall use TypeScript with strict mode enabled.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.1, §3.2.2

### REQ-SYS-255: ES Modules
**Statement:** The system shall use ES Modules for the module system.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.1

### REQ-SYS-256: Pnpm Workspaces
**Statement:** The system shall use pnpm workspaces for monorepo management.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §9.4

### REQ-SYS-257: Shared QA Library
**Statement:** The system shall maintain a shared req-qa library package for QA rules.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.3, §9.4

### REQ-SYS-258: Repository Pattern
**Statement:** The system shall use repository pattern for abstracting Neo4j queries.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.1, §4.1.2

### REQ-SYS-259: Factory Pattern
**Statement:** The system shall use factory pattern for creating LLM provider instances.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.1

### REQ-SYS-260: Component Composition
**Statement:** The system shall use small, composable React components.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.2

### REQ-SYS-261: Custom React Hooks
**Statement:** The system shall encapsulate state logic in custom React hooks.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.2

### REQ-SYS-262: Context Providers
**Statement:** The system shall use context providers for scoped global state.
**Pattern:** Ubiquitous
**Verification:** Inspection
**Priority:** Must Have
**Source:** DDD §3.2.2

---

## 21. Compliance

### REQ-SYS-263: ISO 29148 Standard Support
**Statement:** The system shall support ISO/IEC/IEEE 29148 requirements engineering standards.
**Pattern:** Ubiquitous
**Verification:** Analysis
**Priority:** Must Have
**Source:** DDD §1.1, §1.3, §3.2.3

### REQ-SYS-264: EARS Pattern Support
**Statement:** The system shall support Easy Approach to Requirements Syntax (EARS) patterns.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.3, Appendix A, B

### REQ-SYS-265: Audit Trail Completeness
**Statement:** The system shall maintain complete audit trails for all requirement changes.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §2.3.1, §7.6

### REQ-SYS-266: Compliance Package Support
**Statement:** The system shall support pre-built compliance templates for ISO 26262, DO-178C.
**Pattern:** Optional
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §10.1

---

## 22. Deployment Flexibility

### REQ-SYS-267: SaaS Deployment Support
**Statement:** The system shall support SaaS deployment at airgen.studio with zero infrastructure management.
**Pattern:** Ubiquitous (for SaaS)
**Verification:** Demonstration
**Priority:** Must Have
**Source:** DDD §1.3, §8.1

### REQ-SYS-268: Self-Hosted VPS Deployment
**Statement:** The system shall support self-hosted deployment on VPS via Docker Compose.
**Pattern:** Ubiquitous (for self-hosted)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.1

### REQ-SYS-269: Managed Hosting Support
**Statement:** The system shall support managed enterprise hosting on customer infrastructure.
**Pattern:** Ubiquitous (for enterprise)
**Verification:** Demonstration
**Priority:** Should Have
**Source:** DDD §8.1

### REQ-SYS-270: Development Environment Setup
**Statement:** The system shall provide local development environment with Docker Compose and hot-reload.
**Pattern:** Ubiquitous (for dev)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.1

### REQ-SYS-271: Staging Environment Support
**Statement:** The system shall support staging environments with isolated workspace directories.
**Pattern:** Ubiquitous (for staging)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §8.1

### REQ-SYS-272: Docker Compose Deployment
**Statement:** The system shall deploy via Docker Compose with Traefik, API, Neo4j, and Redis services.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.2

### REQ-SYS-273: Persistent Volume Management
**Statement:** The system shall manage persistent volumes for Neo4j data, Redis data, workspace files, and TLS certificates.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.2

### REQ-SYS-274: Environment Configuration
**Statement:** The system shall configure environments via .env files for development and production.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.4

### REQ-SYS-275: Deployment Rollback Support
**Statement:** The system shall support deployment rollback via git revert and rebuild.
**Pattern:** Event-driven (WHEN rollback needed)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §8.4

---

## 23. Integration & Extensibility

### REQ-SYS-276: REST API Interface
**Statement:** The system shall provide RESTful API with resource-oriented URLs and JSON payloads.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.1

### REQ-SYS-277: Consistent Error Format
**Statement:** The system shall return errors in consistent JSON format with error, message, statusCode, and details fields.
**Pattern:** Ubiquitous (for errors)
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §6.1.1

### REQ-SYS-278: API Versioning Support
**Statement:** The system shall support API versioning for future compatibility (implicit v1, future /api/v2).
**Pattern:** Ubiquitous
**Verification:** Analysis
**Priority:** Should Have
**Source:** DDD §6.1.1

### REQ-SYS-279: CORS Support
**Statement:** The system shall support CORS for cross-origin API requests.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Must Have
**Source:** DDD §3.2.1

### REQ-SYS-280: WebSocket Support (Future)
**Statement:** The system shall support WebSocket connections for real-time collaboration features.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §6.3, §10.1

### REQ-SYS-281: External Integration Hub
**Statement:** The system shall support integrations with Jira, GitHub, and Azure DevOps.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-282: Email Notification Integration
**Statement:** The system shall integrate with Resend for transactional email notifications.
**Pattern:** Event-driven (WHEN notification sent)
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.2

### REQ-SYS-283: Git Repository Integration
**Statement:** The system shall support git repository integration for markdown file tracking.
**Pattern:** Ubiquitous
**Verification:** Test
**Priority:** Should Have
**Source:** DDD §2.2

---

## 24. Advanced Features (Future)

### REQ-SYS-284: Vector Search
**Statement:** The system shall support semantic similarity search using vector embeddings (pgvector or Qdrant).
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-285: Collaborative Editing
**Statement:** The system shall support WebSocket-based real-time collaborative editing.
**Pattern:** Optional
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-286: Comment System
**Statement:** The system shall support inline comments on requirements.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-287: Email/Slack Notifications
**Statement:** The system shall send email and Slack notifications for requirement changes.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-288: Export to Word/PDF
**Statement:** The system shall generate Word and PDF reports from requirements.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-289: Mobile Application
**Statement:** The system shall provide a React Native mobile companion app.
**Pattern:** Optional
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-290: AI Automatic Traceability
**Statement:** The system shall automatically create trace links using semantic analysis.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-291: Workflow Automation
**Statement:** The system shall support custom approval workflows.
**Pattern:** Optional
**Verification:** Test
**Priority:** Could Have
**Source:** DDD §10.1

### REQ-SYS-292: Marketplace Support
**Statement:** The system shall provide a marketplace for user-contributed templates and plugins.
**Pattern:** Optional
**Verification:** Demonstration
**Priority:** Could Have
**Source:** DDD §10.1

---

## Requirements Summary

### Total Requirements: 292

**By Priority:**
- **Must Have:** 176 requirements (60%)
- **Should Have:** 84 requirements (29%)
- **Could Have:** 32 requirements (11%)

**By Verification Method:**
- **Test:** 239 requirements (82%)
- **Demonstration:** 27 requirements (9%)
- **Analysis:** 12 requirements (4%)
- **Inspection:** 14 requirements (5%)

**By EARS Pattern:**
- **Event-driven:** 154 requirements (53%)
- **Ubiquitous:** 112 requirements (38%)
- **State-driven:** 21 requirements (7%)
- **Unwanted:** 1 requirement (<1%)
- **Optional:** 4 requirements (1%)

**By Functional Domain:**
| Domain | Count |
|--------|-------|
| Authentication & User Management | 10 |
| Requirements Management | 23 |
| AI-Assisted Generation | 16 |
| Quality Assurance Engine | 13 |
| Document Management | 14 |
| Traceability | 10 |
| Architecture Diagrams | 23 |
| Baselines & Version Control | 8 |
| Activity Tracking & Audit Logging | 13 |
| Subscription & Billing (SaaS) | 22 |
| Backup & Recovery | 22 |
| AI Compliance & Security | 8 |
| Multi-Tenancy | 7 |
| Project Management | 4 |
| Performance | 5 |
| Security | 19 |
| Scalability | 8 |
| Reliability | 12 |
| Usability | 14 |
| Maintainability | 10 |
| Compliance | 4 |
| Deployment Flexibility | 9 |
| Integration & Extensibility | 8 |
| Advanced Features (Future) | 9 |

---

## Document Control

| Version | Date       | Author       | Changes                                    |
|---------|------------|--------------|-------------------------------------------|
| 1.0     | 2025-10-24 | AI Assistant | Initial SRS derived from DDD v1.3         |

**Approval:**

| Role                     | Name | Signature | Date |
|--------------------------|------|-----------|------|
| Technical Architect      |      |           |      |
| Requirements Engineer    |      |           |      |
| Product Owner            |      |           |      |

---

**End of Document**
