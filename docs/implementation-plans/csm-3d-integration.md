# CSM 3D Integration - Implementation Plan

**Date:** 2025-10-26
**Feature:** Image-to-3D Model Generation with Interactive Viewer
**API Provider:** Common Sense Machines (CSM)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Backend Implementation](#backend-implementation)
5. [Frontend Implementation](#frontend-implementation)
6. [Async Processing Strategy](#async-processing-strategy)
7. [3D Viewer & Interactivity](#3d-viewer--interactivity)
8. [Metadata Tagging System](#metadata-tagging-system)
9. [File Storage Strategy](#file-storage-strategy)
10. [API Endpoints](#api-endpoints)
11. [Security & Performance](#security--performance)
12. [Testing Strategy](#testing-strategy)
13. [Deployment & Configuration](#deployment--configuration)
14. [Cost Management](#cost-management)
15. [Timeline & Milestones](#timeline--milestones)

---

## Overview

### Goals
- Generate 3D models from AIRGen Imagine 2D visualizations using CSM API
- Provide interactive 3D viewer with part selection and metadata tagging
- Store models locally in project database
- Support multiple export formats (GLB, OBJ, USDZ, FBX)
- Track generation status and costs

### User Journey
1. User generates 2D image via Imagine (existing)
2. User clicks "Generate 3D Model" button
3. System submits image to CSM API
4. User sees real-time progress indicator
5. On completion, user opens interactive 3D viewer
6. User can rotate, zoom, select parts, add metadata tags
7. User can download model in various formats
8. User can tag individual parts with requirements/specs

---

## Architecture

### System Overview

```
┌─────────────────┐
│  Imagine 2D     │
│  Generation     │
└────────┬────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ CSM API Client  │─────▶│  CSM Cloud   │
│ (Backend)       │      │  Processing  │
└────────┬────────┘      └──────┬───────┘
         │                      │
         │ Webhook/Poll         │
         │◀─────────────────────┘
         │
         ▼
┌─────────────────┐      ┌──────────────┐
│ Model Storage   │      │ PostgreSQL   │
│ (workspace/3d/) │      │ Metadata DB  │
└─────────────────┘      └──────────────┘
         │
         ▼
┌─────────────────┐
│ Three.js Viewer │
│ (Frontend)      │
└─────────────────┘
```

### Data Flow

1. **Generation Request**
   - Frontend: `POST /api/:tenant/:project/imagine/3d/generate`
   - Backend: Create DB record with status "pending"
   - Backend: Submit to CSM API with image URL
   - Response: Return session ID + polling endpoint

2. **Status Polling** (Frontend polls every 5s)
   - Frontend: `GET /api/:tenant/:project/imagine/3d/:modelId/status`
   - Backend: Check CSM session status
   - Backend: Update DB record if complete
   - Backend: Download models if ready

3. **Viewing & Interaction**
   - Frontend: `GET /api/:tenant/:project/imagine/3d/:modelId`
   - Backend: Return metadata + file paths
   - Frontend: Load GLB into Three.js viewer
   - User: Select parts, add tags

4. **Metadata Tagging**
   - User selects 3D mesh part
   - Frontend: `POST /api/:tenant/:project/imagine/3d/:modelId/tags`
   - Backend: Store tag with part identifier
   - Tags link to requirements, specs, blocks

---

## Database Schema

### PostgreSQL Tables

#### `imagine_3d_models`
```sql
CREATE TABLE IF NOT EXISTS imagine_3d_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Linkage
  imagine_image_id VARCHAR(255) NOT NULL,  -- Links to Neo4j ImagineImage.id
  element_id UUID NOT NULL,                 -- Block/Interface ID from Neo4j
  element_type VARCHAR(50) NOT NULL CHECK (element_type IN ('Block', 'Interface')),
  user_id UUID NOT NULL,
  tenant_slug VARCHAR(255) NOT NULL,
  project_slug VARCHAR(255) NOT NULL,

  -- CSM Session Info
  csm_session_id VARCHAR(255) UNIQUE,
  status VARCHAR(50) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'cancelled')),

  -- Generation Settings
  geometry_model VARCHAR(50) NOT NULL DEFAULT 'base'
    CHECK (geometry_model IN ('base', 'turbo', 'highest', 'parts')),
  texture_model VARCHAR(50) NOT NULL DEFAULT 'pbr'
    CHECK (texture_model IN ('none', 'baked', 'pbr')),
  resolution INTEGER NOT NULL DEFAULT 100000,
  symmetry VARCHAR(50) DEFAULT 'auto'
    CHECK (symmetry IN ('auto', 'on', 'off')),
  scaled_bbox JSONB,  -- Target dimensions [width, height, depth]

  -- File Paths (stored locally)
  glb_file_path TEXT,
  obj_file_path TEXT,
  usdz_file_path TEXT,
  fbx_file_path TEXT,

  -- File URLs (from CSM - temporary)
  glb_url TEXT,
  obj_url TEXT,
  usdz_url TEXT,
  fbx_url TEXT,

  -- Metadata
  file_size_bytes BIGINT,
  polygon_count INTEGER,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_imagine_3d_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_imagine_3d_image ON imagine_3d_models(imagine_image_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_element ON imagine_3d_models(element_id, element_type);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_user ON imagine_3d_models(user_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_tenant ON imagine_3d_models(tenant_slug, project_slug);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_status ON imagine_3d_models(status);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_session ON imagine_3d_models(csm_session_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_created ON imagine_3d_models(created_at DESC);

-- Updated_at trigger
CREATE TRIGGER trigger_update_imagine_3d_models_updated_at
BEFORE UPDATE ON imagine_3d_models
FOR EACH ROW
EXECUTE FUNCTION update_snapdraft_drawings_updated_at();

-- Comments
COMMENT ON TABLE imagine_3d_models IS 'Stores 3D model generation results from CSM API';
COMMENT ON COLUMN imagine_3d_models.imagine_image_id IS 'ID of the source ImagineImage (from Neo4j)';
COMMENT ON COLUMN imagine_3d_models.csm_session_id IS 'CSM API session ID for status tracking';
COMMENT ON COLUMN imagine_3d_models.status IS 'Generation status: pending, processing, complete, failed, cancelled';
COMMENT ON COLUMN imagine_3d_models.glb_file_path IS 'Local path to GLB file (workspace/3d/models/)';
COMMENT ON COLUMN imagine_3d_models.scaled_bbox IS 'Target dimensions in meters [width, height, depth]';
```

#### `imagine_3d_parts`
```sql
CREATE TABLE IF NOT EXISTS imagine_3d_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,

  -- Part Identification
  part_name VARCHAR(255),
  mesh_index INTEGER,              -- Index in the GLB mesh array
  mesh_uuid VARCHAR(255),          -- Three.js mesh UUID
  bounding_box JSONB,              -- {min: [x,y,z], max: [x,y,z]}

  -- Metadata
  description TEXT,
  part_type VARCHAR(100),          -- e.g., 'port', 'connector', 'housing'

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_imagine_3d_part_model FOREIGN KEY (model_id) REFERENCES imagine_3d_models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imagine_3d_parts_model ON imagine_3d_parts(model_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_parts_mesh ON imagine_3d_parts(model_id, mesh_index);

COMMENT ON TABLE imagine_3d_parts IS 'Individual parts/meshes within 3D models';
COMMENT ON COLUMN imagine_3d_parts.mesh_index IS 'Index of mesh in GLB file for selection';
COMMENT ON COLUMN imagine_3d_parts.mesh_uuid IS 'Three.js generated UUID for runtime identification';
```

#### `imagine_3d_tags`
```sql
CREATE TABLE IF NOT EXISTS imagine_3d_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL,

  -- Tag Data
  tag_type VARCHAR(50) NOT NULL
    CHECK (tag_type IN ('requirement', 'spec', 'note', 'material', 'dimension', 'port', 'connector')),
  tag_key VARCHAR(255) NOT NULL,
  tag_value TEXT NOT NULL,

  -- External References
  requirement_id VARCHAR(255),     -- Links to Neo4j Requirement.id
  block_id UUID,                    -- Links to Neo4j Block.id
  connector_id UUID,                -- Links to Neo4j Connector.id
  port_definition_id UUID,          -- Links to Neo4j PortDefinition.id

  -- User Info
  created_by UUID NOT NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_imagine_3d_tag_part FOREIGN KEY (part_id) REFERENCES imagine_3d_parts(id) ON DELETE CASCADE,
  CONSTRAINT fk_imagine_3d_tag_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imagine_3d_tags_part ON imagine_3d_tags(part_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_tags_type ON imagine_3d_tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_tags_requirement ON imagine_3d_tags(requirement_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_tags_created ON imagine_3d_tags(created_at DESC);

COMMENT ON TABLE imagine_3d_tags IS 'Metadata tags attached to 3D model parts';
COMMENT ON COLUMN imagine_3d_tags.tag_type IS 'Type of tag: requirement, spec, note, material, dimension, port, connector';
COMMENT ON COLUMN imagine_3d_tags.requirement_id IS 'Optional link to requirement (from Neo4j)';
```

#### `imagine_3d_generation_logs`
```sql
CREATE TABLE IF NOT EXISTS imagine_3d_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL,

  -- Event Info
  event_type VARCHAR(50) NOT NULL
    CHECK (event_type IN ('request', 'processing', 'download', 'complete', 'error', 'webhook')),
  message TEXT,

  -- API Response
  csm_response JSONB,              -- Raw CSM API response
  http_status INTEGER,

  -- Cost Tracking
  credits_used DECIMAL(10, 2),     -- CSM credits consumed

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT fk_imagine_3d_log_model FOREIGN KEY (model_id) REFERENCES imagine_3d_models(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_imagine_3d_logs_model ON imagine_3d_generation_logs(model_id);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_logs_event ON imagine_3d_generation_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_imagine_3d_logs_created ON imagine_3d_generation_logs(created_at DESC);

COMMENT ON TABLE imagine_3d_generation_logs IS 'Audit log for 3D generation events and API calls';
```

### Neo4j Relationships

```cypher
// Add relationship from ImagineImage to 3D model metadata
(:ImagineImage)-[:HAS_3D_MODEL {
  modelId: UUID,           // PostgreSQL imagine_3d_models.id
  status: String,
  createdAt: DateTime
}]->(:Imagine3DModelRef)

// Reference node (lightweight)
CREATE (ref:Imagine3DModelRef {
  id: UUID,                // Same as PostgreSQL ID
  status: String,
  glbPath: String,
  createdAt: DateTime
})
```

**Rationale:** Keep heavy binary data and complex metadata in PostgreSQL, use Neo4j only for graph relationships and lightweight references.

---

## Backend Implementation

### File Structure

```
backend/src/services/imagine-3d/
├── csm-client.ts                 # CSM API client
├── imagine-3d-service.ts         # Main orchestrator
├── model-storage.ts              # File download & storage
├── model-processor.ts            # GLB parsing & mesh extraction
├── webhook-handler.ts            # CSM webhook receiver (optional)
├── polling-manager.ts            # Background polling service
└── types.ts                      # TypeScript types

backend/src/routes/
└── imagine-3d-routes.ts          # API endpoints

backend/migrations/
└── 010-create-imagine-3d-tables.sql
```

### Core Services

#### 1. `csm-client.ts` - CSM API Integration

```typescript
import axios, { AxiosInstance } from 'axios';
import { config } from '../../config.js';

export interface CSMSessionRequest {
  type: 'image_to_3d';
  image: string;  // Cloud-hosted URL or base64 data URL
  settings: {
    geometry_model?: 'base' | 'turbo' | 'highest' | 'parts';
    texture_model?: 'none' | 'baked' | 'pbr';
    resolution?: number;
    symmetry?: 'auto' | 'on' | 'off';
    scaled_bbox?: [number, number, number];  // [width, height, depth]
  };
  num_variations?: number;
  manual_segmentation?: boolean;
}

export interface CSMSessionResponse {
  _id: string;  // Session ID
  status: 'incomplete' | 'pending' | 'complete' | 'failed';
  output?: {
    meshes: Array<{
      data: {
        glb_url: string;
        obj_url: string;
        usdz_url: string;
        fbx_url: string;
      };
      metadata?: {
        polygon_count?: number;
        file_size?: number;
      };
    }>;
  };
  error?: {
    code: string;
    message: string;
  };
}

export class CSMClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(apiKey: string, baseUrl: string = 'https://api.csm.ai/v3') {
    this.apiKey = apiKey;
    this.client = axios.create({
      baseURL: baseUrl,
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Create a new image-to-3D generation session
   */
  async createSession(request: CSMSessionRequest): Promise<CSMSessionResponse> {
    try {
      const response = await this.client.post<CSMSessionResponse>('/sessions/', request);
      console.log(`[CSM] Session created: ${response.data._id}`);
      return response.data;
    } catch (error: any) {
      console.error('[CSM] Session creation failed:', error.response?.data || error.message);
      throw new Error(`CSM session creation failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Get session status and results
   */
  async getSession(sessionId: string): Promise<CSMSessionResponse> {
    try {
      const response = await this.client.get<CSMSessionResponse>(`/sessions/${sessionId}`);
      return response.data;
    } catch (error: any) {
      console.error(`[CSM] Failed to get session ${sessionId}:`, error.response?.data || error.message);
      throw new Error(`CSM session retrieval failed: ${error.response?.data?.error?.message || error.message}`);
    }
  }

  /**
   * Download model file from CSM URL
   */
  async downloadFile(url: string): Promise<Buffer> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 300000, // 5 minute timeout for large files
      });
      return Buffer.from(response.data);
    } catch (error: any) {
      console.error(`[CSM] File download failed:`, error.message);
      throw new Error(`File download failed: ${error.message}`);
    }
  }

  /**
   * Check if API key is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey && this.apiKey !== '';
  }
}
```

#### 2. `model-storage.ts` - File Management

```typescript
import { promises as fs } from 'fs';
import { join } from 'path';
import { config } from '../../config.js';

export class ModelStorage {
  private storageDir: string;

  constructor() {
    this.storageDir = join(config.workspaceRoot, '3d', 'models');
  }

  async ensureDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (err: any) {
      if (err.code !== 'EEXIST') throw err;
    }
  }

  async saveModel(
    modelData: Buffer,
    modelId: string,
    format: 'glb' | 'obj' | 'usdz' | 'fbx'
  ): Promise<string> {
    await this.ensureDirectory();

    const filename = `${modelId}.${format}`;
    const filepath = join(this.storageDir, filename);

    await fs.writeFile(filepath, modelData);

    console.log(`[3D Storage] Model saved: ${filepath} (${modelData.length} bytes)`);

    return `/3d/models/${filename}`;
  }

  async getModel(modelId: string, format: string): Promise<Buffer | null> {
    const filepath = join(this.storageDir, `${modelId}.${format}`);

    try {
      return await fs.readFile(filepath);
    } catch (err: any) {
      if (err.code === 'ENOENT') return null;
      throw err;
    }
  }

  async deleteModel(modelId: string): Promise<void> {
    const formats = ['glb', 'obj', 'usdz', 'fbx'];

    for (const format of formats) {
      const filepath = join(this.storageDir, `${modelId}.${format}`);
      try {
        await fs.unlink(filepath);
        console.log(`[3D Storage] Deleted: ${filepath}`);
      } catch (err: any) {
        if (err.code !== 'ENOENT') {
          console.warn(`[3D Storage] Failed to delete ${filepath}:`, err.message);
        }
      }
    }
  }

  getStorageDir(): string {
    return this.storageDir;
  }
}
```

#### 3. `imagine-3d-service.ts` - Main Orchestrator

```typescript
import { Pool } from 'pg';
import { CSMClient, CSMSessionRequest } from './csm-client.js';
import { ModelStorage } from './model-storage.js';
import { config } from '../../config.js';
import { getSession as getNeo4jSession } from '../graph/driver.js';

export interface Generate3DRequest {
  imagineImageId: string;
  tenantSlug: string;
  projectSlug: string;
  userId: string;
  settings?: {
    geometryModel?: 'base' | 'turbo' | 'highest' | 'parts';
    textureModel?: 'none' | 'baked' | 'pbr';
    resolution?: number;
    symmetry?: 'auto' | 'on' | 'off';
    scaledBbox?: [number, number, number];
  };
}

export interface Imagine3DModel {
  id: string;
  imagineImageId: string;
  elementId: string;
  elementType: 'Block' | 'Interface';
  userId: string;
  tenantSlug: string;
  projectSlug: string;
  csmSessionId: string | null;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';
  geometryModel: string;
  textureModel: string;
  resolution: number;
  symmetry: string;
  scaledBbox: number[] | null;
  glbFilePath: string | null;
  objFilePath: string | null;
  usdzFilePath: string | null;
  fbxFilePath: string | null;
  fileSizeBytes: number | null;
  polygonCount: number | null;
  errorMessage: string | null;
  createdAt: Date;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export class Imagine3DService {
  private csmClient: CSMClient;
  private modelStorage: ModelStorage;
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
    this.csmClient = new CSMClient(
      config.csm.apiKey,
      config.csm.baseUrl
    );
    this.modelStorage = new ModelStorage();
  }

  /**
   * Initiate 3D model generation from an Imagine image
   */
  async generate3DModel(request: Generate3DRequest): Promise<Imagine3DModel> {
    if (!this.csmClient.isConfigured()) {
      throw new Error('[3D] CSM API key not configured');
    }

    console.log(`[3D] Starting 3D generation for image ${request.imagineImageId}`);

    // 1. Get ImagineImage metadata from Neo4j
    const imageData = await this.getImagineImageData(request.imagineImageId);

    // 2. Create DB record with status "pending"
    const model = await this.createModelRecord({
      imagineImageId: request.imagineImageId,
      elementId: imageData.elementId,
      elementType: imageData.elementType,
      userId: request.userId,
      tenantSlug: request.tenantSlug,
      projectSlug: request.projectSlug,
      ...request.settings,
    });

    // 3. Log generation request
    await this.logEvent(model.id, 'request', 'Initiating CSM session');

    try {
      // 4. Submit to CSM API
      const imageUrl = this.getPublicImageUrl(imageData.imageUrl);

      const csmRequest: CSMSessionRequest = {
        type: 'image_to_3d',
        image: imageUrl,
        settings: {
          geometry_model: request.settings?.geometryModel || config.csm.geometryModel,
          texture_model: request.settings?.textureModel || config.csm.textureModel,
          resolution: request.settings?.resolution || config.csm.resolution,
          symmetry: request.settings?.symmetry || 'auto',
          scaled_bbox: request.settings?.scaledBbox,
        },
        num_variations: 1,
      };

      const session = await this.csmClient.createSession(csmRequest);

      // 5. Update model with session ID and status
      await this.updateModelSession(model.id, session._id, session.status);
      await this.logEvent(model.id, 'processing', `CSM session created: ${session._id}`, session);

      // 6. Create Neo4j relationship
      await this.createNeo4jRelationship(request.imagineImageId, model.id);

      console.log(`[3D] Generation initiated: model=${model.id}, session=${session._id}`);

      return await this.getModelById(model.id);
    } catch (error: any) {
      await this.updateModelStatus(model.id, 'failed', error.message);
      await this.logEvent(model.id, 'error', error.message);
      throw error;
    }
  }

  /**
   * Poll CSM session status and update model
   */
  async updateModelStatus(modelId: string, csmSessionId?: string): Promise<Imagine3DModel> {
    const model = await this.getModelById(modelId);

    if (!model.csmSessionId && !csmSessionId) {
      throw new Error('[3D] No CSM session ID available');
    }

    const sessionId = csmSessionId || model.csmSessionId!;
    const session = await this.csmClient.getSession(sessionId);

    console.log(`[3D] Session ${sessionId} status: ${session.status}`);

    // Map CSM status to our status
    let newStatus: Imagine3DModel['status'];
    switch (session.status) {
      case 'incomplete':
      case 'pending':
        newStatus = 'processing';
        break;
      case 'complete':
        newStatus = 'complete';
        break;
      case 'failed':
        newStatus = 'failed';
        break;
      default:
        newStatus = model.status;
    }

    await this.db.query(
      `UPDATE imagine_3d_models
       SET status = $1, updated_at = NOW()
       WHERE id = $2`,
      [newStatus, modelId]
    );

    if (session.status === 'complete') {
      await this.downloadAndStoreModels(modelId, session);
      await this.logEvent(modelId, 'complete', 'Model generation complete', session);
    } else if (session.status === 'failed') {
      const errorMsg = session.error?.message || 'Unknown error';
      await this.db.query(
        `UPDATE imagine_3d_models
         SET error_message = $1, updated_at = NOW()
         WHERE id = $2`,
        [errorMsg, modelId]
      );
      await this.logEvent(modelId, 'error', errorMsg, session);
    }

    return await this.getModelById(modelId);
  }

  /**
   * Download model files from CSM and store locally
   */
  private async downloadAndStoreModels(modelId: string, session: any): Promise<void> {
    console.log(`[3D] Downloading models for ${modelId}`);

    const meshData = session.output?.meshes?.[0]?.data;
    if (!meshData) {
      throw new Error('[3D] No mesh data in session output');
    }

    const downloads = [];
    const filePaths: any = {};

    // Download all formats in parallel
    if (meshData.glb_url) {
      downloads.push(
        this.csmClient.downloadFile(meshData.glb_url)
          .then(data => this.modelStorage.saveModel(data, modelId, 'glb'))
          .then(path => { filePaths.glbFilePath = path; })
      );
    }

    if (meshData.obj_url) {
      downloads.push(
        this.csmClient.downloadFile(meshData.obj_url)
          .then(data => this.modelStorage.saveModel(data, modelId, 'obj'))
          .then(path => { filePaths.objFilePath = path; })
      );
    }

    if (meshData.usdz_url) {
      downloads.push(
        this.csmClient.downloadFile(meshData.usdz_url)
          .then(data => this.modelStorage.saveModel(data, modelId, 'usdz'))
          .then(path => { filePaths.usdzFilePath = path; })
      );
    }

    if (meshData.fbx_url) {
      downloads.push(
        this.csmClient.downloadFile(meshData.fbx_url)
          .then(data => this.modelStorage.saveModel(data, modelId, 'fbx'))
          .then(path => { filePaths.fbxFilePath = path; })
      );
    }

    await Promise.all(downloads);

    // Update DB with file paths and metadata
    await this.db.query(
      `UPDATE imagine_3d_models
       SET glb_file_path = $1,
           obj_file_path = $2,
           usdz_file_path = $3,
           fbx_file_path = $4,
           polygon_count = $5,
           completed_at = NOW(),
           updated_at = NOW()
       WHERE id = $6`,
      [
        filePaths.glbFilePath || null,
        filePaths.objFilePath || null,
        filePaths.usdzFilePath || null,
        filePaths.fbxFilePath || null,
        session.output?.meshes?.[0]?.metadata?.polygon_count || null,
        modelId,
      ]
    );

    await this.logEvent(modelId, 'download', 'Models downloaded and stored');

    console.log(`[3D] Models stored for ${modelId}:`, filePaths);
  }

  // ... (Additional helper methods: createModelRecord, getModelById, logEvent, etc.)
}
```

#### 4. `polling-manager.ts` - Background Polling

```typescript
/**
 * Background service to poll pending/processing models
 * Runs every 30 seconds, checks models that haven't been updated in 5 seconds
 */

import { Pool } from 'pg';
import { Imagine3DService } from './imagine-3d-service.js';

export class PollingManager {
  private db: Pool;
  private service: Imagine3DService;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(db: Pool) {
    this.db = db;
    this.service = new Imagine3DService(db);
  }

  start(intervalMs: number = 30000): void {
    if (this.isRunning) {
      console.warn('[3D Polling] Already running');
      return;
    }

    console.log(`[3D Polling] Starting (interval: ${intervalMs}ms)`);
    this.isRunning = true;

    this.intervalId = setInterval(() => {
      this.pollPendingModels().catch(err => {
        console.error('[3D Polling] Error:', err);
      });
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      console.log('[3D Polling] Stopped');
    }
  }

  private async pollPendingModels(): Promise<void> {
    const result = await this.db.query(
      `SELECT id, csm_session_id
       FROM imagine_3d_models
       WHERE status IN ('pending', 'processing')
         AND updated_at < NOW() - INTERVAL '5 seconds'
       ORDER BY created_at ASC
       LIMIT 20`
    );

    if (result.rows.length === 0) {
      return;
    }

    console.log(`[3D Polling] Checking ${result.rows.length} pending models`);

    for (const row of result.rows) {
      try {
        await this.service.updateModelStatus(row.id, row.csm_session_id);
      } catch (error: any) {
        console.error(`[3D Polling] Failed to update model ${row.id}:`, error.message);
      }
    }
  }
}
```

#### 5. `types.ts` - TypeScript Definitions

```typescript
export interface Generate3DRequest {
  imagineImageId: string;
  tenantSlug: string;
  projectSlug: string;
  userId: string;
  settings?: {
    geometryModel?: 'base' | 'turbo' | 'highest' | 'parts';
    textureModel?: 'none' | 'baked' | 'pbr';
    resolution?: number;
    symmetry?: 'auto' | 'on' | 'off';
    scaledBbox?: [number, number, number];
  };
}

export interface Imagine3DModel {
  id: string;
  imagineImageId: string;
  elementId: string;
  elementType: 'Block' | 'Interface';
  userId: string;
  tenantSlug: string;
  projectSlug: string;
  csmSessionId: string | null;
  status: 'pending' | 'processing' | 'complete' | 'failed' | 'cancelled';
  geometryModel: string;
  textureModel: string;
  resolution: number;
  symmetry: string;
  scaledBbox: number[] | null;
  glbFilePath: string | null;
  objFilePath: string | null;
  usdzFilePath: string | null;
  fbxFilePath: string | null;
  fileSizeBytes: number | null;
  polygonCount: number | null;
  errorMessage: string | null;
  createdAt: Date;
  processingStartedAt: Date | null;
  completedAt: Date | null;
  updatedAt: Date;
}

export interface Imagine3DPart {
  id: string;
  modelId: string;
  partName: string | null;
  meshIndex: number | null;
  meshUuid: string | null;
  boundingBox: {
    min: [number, number, number];
    max: [number, number, number];
  } | null;
  description: string | null;
  partType: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Imagine3DTag {
  id: string;
  partId: string;
  tagType: 'requirement' | 'spec' | 'note' | 'material' | 'dimension' | 'port' | 'connector';
  tagKey: string;
  tagValue: string;
  requirementId: string | null;
  blockId: string | null;
  connectorId: string | null;
  portDefinitionId: string | null;
  createdBy: string;
  createdAt: Date;
}
```

---

## Frontend Implementation

### File Structure

```
frontend/src/components/imagine-3d/
├── Imagine3DViewer.tsx           # Main 3D viewer component
├── Imagine3DControls.tsx         # Camera/render controls
├── Imagine3DPartSelector.tsx     # Part selection UI
├── Imagine3DTagPanel.tsx         # Metadata tagging sidebar
├── Imagine3DGenerateButton.tsx   # Generate 3D button
├── Imagine3DStatusBadge.tsx      # Status indicator
└── Imagine3DDownloadMenu.tsx     # Export dropdown

frontend/src/hooks/
└── useImagine3DApi.ts            # React Query hooks

frontend/src/lib/
└── threejs/
    ├── ModelLoader.ts            # GLB/OBJ loader
    ├── PartHighlighter.ts        # Mesh selection/highlight
    └── MeshAnalyzer.ts           # Bounding box calculation
```

### Key Components

#### 1. `Imagine3DViewer.tsx` - Main Viewer

```typescript
import React, { useRef, useEffect, useState } from 'react';
import { Canvas, useThree, useLoader } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Grid, Environment } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import * as THREE from 'three';

interface Imagine3DViewerProps {
  modelId: string;
  glbUrl: string;
  onPartSelect?: (meshIndex: number, meshUuid: string) => void;
  selectedPartId?: string;
}

function Model({ url, onMeshClick, selectedMeshUuid }: any) {
  const gltf = useLoader(GLTFLoader, url);
  const [hoveredMesh, setHoveredMesh] = useState<string | null>(null);

  useEffect(() => {
    // Traverse model and make meshes interactive
    gltf.scene.traverse((child: any) => {
      if (child.isMesh) {
        child.userData.originalColor = child.material.color.clone();
        child.userData.meshUuid = child.uuid;
      }
    });
  }, [gltf]);

  const handlePointerOver = (e: any) => {
    e.stopPropagation();
    if (e.object.isMesh) {
      setHoveredMesh(e.object.uuid);
      e.object.material.emissive = new THREE.Color(0x444444);
      document.body.style.cursor = 'pointer';
    }
  };

  const handlePointerOut = (e: any) => {
    e.stopPropagation();
    if (e.object.isMesh && e.object.uuid !== selectedMeshUuid) {
      setHoveredMesh(null);
      e.object.material.emissive = new THREE.Color(0x000000);
      document.body.style.cursor = 'default';
    }
  };

  const handleClick = (e: any) => {
    e.stopPropagation();
    if (e.object.isMesh) {
      onMeshClick(e.object);
    }
  };

  return (
    <primitive
      object={gltf.scene}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
      onClick={handleClick}
    />
  );
}

export function Imagine3DViewer({ modelId, glbUrl, onPartSelect, selectedPartId }: Imagine3DViewerProps) {
  const [selectedMesh, setSelectedMesh] = useState<any>(null);

  const handleMeshClick = (mesh: any) => {
    // Reset previous selection
    if (selectedMesh) {
      selectedMesh.material.emissive = new THREE.Color(0x000000);
    }

    // Highlight new selection
    mesh.material.emissive = new THREE.Color(0x0066ff);
    setSelectedMesh(mesh);

    // Notify parent
    if (onPartSelect) {
      const meshIndex = mesh.parent.children.indexOf(mesh);
      onPartSelect(meshIndex, mesh.uuid);
    }
  };

  return (
    <div className="w-full h-full">
      <Canvas shadows>
        <PerspectiveCamera makeDefault position={[5, 5, 5]} />
        <OrbitControls enableDamping dampingFactor={0.05} />

        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
        <pointLight position={[-10, -10, -5]} intensity={0.5} />

        {/* Environment */}
        <Environment preset="studio" />
        <Grid infiniteGrid fadeDistance={50} fadeStrength={5} />

        {/* 3D Model */}
        <Model
          url={glbUrl}
          onMeshClick={handleMeshClick}
          selectedMeshUuid={selectedMesh?.uuid}
        />
      </Canvas>
    </div>
  );
}
```

#### 2. `Imagine3DTagPanel.tsx` - Metadata Tagging

```typescript
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select } from '../ui/select';
import { useImagine3DApi } from '../../hooks/useImagine3DApi';

interface Imagine3DTagPanelProps {
  modelId: string;
  partId: string | null;
  tenantSlug: string;
  projectSlug: string;
}

export function Imagine3DTagPanel({ modelId, partId, tenantSlug, projectSlug }: Imagine3DTagPanelProps) {
  const queryClient = useQueryClient();
  const { getTags, createTag, deleteTag } = useImagine3DApi();

  const [tagType, setTagType] = useState<string>('note');
  const [tagKey, setTagKey] = useState('');
  const [tagValue, setTagValue] = useState('');

  const { data: tags, isLoading } = useQuery({
    queryKey: ['imagine-3d-tags', partId],
    queryFn: () => getTags(tenantSlug, projectSlug, modelId, partId!),
    enabled: !!partId,
  });

  const createMutation = useMutation({
    mutationFn: () => createTag(tenantSlug, projectSlug, modelId, {
      partId: partId!,
      tagType,
      tagKey,
      tagValue,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagine-3d-tags', partId] });
      setTagKey('');
      setTagValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (tagId: string) => deleteTag(tenantSlug, projectSlug, modelId, tagId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['imagine-3d-tags', partId] });
    },
  });

  if (!partId) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Select a part to add metadata tags
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <h3 className="font-semibold">Part Metadata</h3>

      {/* Existing Tags */}
      <div className="space-y-2">
        {tags?.map(tag => (
          <div key={tag.id} className="flex items-center justify-between p-2 border rounded">
            <div>
              <div className="font-medium text-sm">{tag.tagKey}</div>
              <div className="text-xs text-muted-foreground">{tag.tagValue}</div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => deleteMutation.mutate(tag.id)}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      {/* Add New Tag */}
      <div className="space-y-3 pt-3 border-t">
        <div>
          <Label>Tag Type</Label>
          <Select value={tagType} onValueChange={setTagType}>
            <option value="note">Note</option>
            <option value="requirement">Requirement</option>
            <option value="spec">Specification</option>
            <option value="material">Material</option>
            <option value="dimension">Dimension</option>
            <option value="port">Port</option>
            <option value="connector">Connector</option>
          </Select>
        </div>

        <div>
          <Label>Key</Label>
          <Input
            value={tagKey}
            onChange={e => setTagKey(e.target.value)}
            placeholder="e.g., 'Material', 'Function'"
          />
        </div>

        <div>
          <Label>Value</Label>
          <Input
            value={tagValue}
            onChange={e => setTagValue(e.target.value)}
            placeholder="e.g., 'Aluminum', 'Heat Sink'"
          />
        </div>

        <Button
          onClick={() => createMutation.mutate()}
          disabled={!tagKey || !tagValue || createMutation.isPending}
          className="w-full"
        >
          Add Tag
        </Button>
      </div>
    </div>
  );
}
```

#### 3. `useImagine3DApi.ts` - API Hooks

```typescript
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client } from '../lib/client';

export function useImagine3DApi() {
  const queryClient = useQueryClient();

  const generate3DModel = useMutation({
    mutationFn: async ({
      tenantSlug,
      projectSlug,
      imagineImageId,
      settings,
    }: any) => {
      const response = await client.post(
        `/api/${tenantSlug}/${projectSlug}/imagine/3d/generate`,
        { imagineImageId, settings }
      );
      return response.data.data;
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['imagine-3d-models', variables.tenantSlug, variables.projectSlug]
      });
    },
  });

  const getModelStatus = (tenantSlug: string, projectSlug: string, modelId: string) =>
    useQuery({
      queryKey: ['imagine-3d-model', modelId],
      queryFn: async () => {
        const response = await client.get(
          `/api/${tenantSlug}/${projectSlug}/imagine/3d/${modelId}`
        );
        return response.data.data;
      },
      refetchInterval: (data) => {
        // Poll every 5s while processing
        if (data?.status === 'pending' || data?.status === 'processing') {
          return 5000;
        }
        return false;
      },
    });

  const getTags = async (tenantSlug: string, projectSlug: string, modelId: string, partId: string) => {
    const response = await client.get(
      `/api/${tenantSlug}/${projectSlug}/imagine/3d/${modelId}/parts/${partId}/tags`
    );
    return response.data.data.tags;
  };

  const createTag = async (tenantSlug: string, projectSlug: string, modelId: string, tag: any) => {
    const response = await client.post(
      `/api/${tenantSlug}/${projectSlug}/imagine/3d/${modelId}/tags`,
      tag
    );
    return response.data.data;
  };

  const deleteTag = async (tenantSlug: string, projectSlug: string, modelId: string, tagId: string) => {
    await client.delete(
      `/api/${tenantSlug}/${projectSlug}/imagine/3d/${modelId}/tags/${tagId}`
    );
  };

  return {
    generate3DModel,
    getModelStatus,
    getTags,
    createTag,
    deleteTag,
  };
}
```

### Package Dependencies

Add to `frontend/package.json`:

```json
{
  "dependencies": {
    "@react-three/fiber": "^8.15.0",
    "@react-three/drei": "^9.92.0",
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0"
  }
}
```

---

## Async Processing Strategy

### Recommended Approach: **Hybrid (Polling + Webhooks)**

#### Option A: Polling (Primary)
- **Frontend**: Polls status endpoint every 5s while `status IN ('pending', 'processing')`
- **Backend**: Background service polls CSM every 30s for stale models
- **Pros**: Simple, no infrastructure changes, works behind firewalls
- **Cons**: Slight delay (5-30s), more API calls

#### Option B: Webhooks (Future Enhancement)
- **CSM**: Sends POST to `/api/webhooks/csm` when session completes
- **Backend**: Updates model immediately, notifies frontend via WebSocket
- **Pros**: Instant updates, fewer API calls
- **Cons**: Requires public endpoint, SSL cert, webhook security

#### Implementation Plan:
1. **Phase 1**: Implement polling (frontend + background service)
2. **Phase 2**: Add webhook endpoint (optional, requires reverse proxy setup)
3. **Phase 3**: Add WebSocket notifications for real-time UI updates

### Polling Implementation

**Frontend (React Query):**
```typescript
const { data: model } = useQuery({
  queryKey: ['imagine-3d-model', modelId],
  queryFn: () => api.getModelStatus(tenantSlug, projectSlug, modelId),
  refetchInterval: (data) => {
    // Poll every 5s while processing
    if (data?.status === 'pending' || data?.status === 'processing') {
      return 5000;
    }
    return false; // Stop polling when complete/failed
  },
});
```

**Backend (Background Service):**
```typescript
// In server.ts startup
import { PollingManager } from './services/imagine-3d/polling-manager.js';

const pollingManager = new PollingManager(db);
pollingManager.start(30000); // Check every 30s
```

---

## 3D Viewer & Interactivity

### Features

1. **Camera Controls**
   - Orbit: Rotate around model
   - Zoom: Mouse wheel
   - Pan: Right-click drag
   - Reset view button

2. **Part Selection**
   - Click mesh to select
   - Highlight selected part (blue emissive)
   - Hover preview (gray emissive)
   - Display part info in sidebar

3. **Visualization Modes**
   - Solid: Default textured view
   - Wireframe: Show mesh topology
   - X-Ray: Semi-transparent for internal parts
   - Bounding boxes: Show part dimensions

4. **Measurement Tools**
   - Click two points to measure distance
   - Display dimensions in meters/feet
   - Show bounding box dimensions

5. **Lighting & Environment**
   - Studio HDRI environment
   - Directional shadow casting
   - Ambient + point lights
   - Ground grid for scale reference

### User Workflow

1. User opens 3D viewer
2. Model loads from GLB file
3. User rotates/zooms to inspect
4. User clicks part → part highlights
5. Sidebar shows part info + tags
6. User adds metadata tag (e.g., "Material: Aluminum")
7. Tag saved to database
8. User can filter/search by tags later

---

## Metadata Tagging System

### Tag Types

| Type | Description | Example |
|------|-------------|---------|
| `requirement` | Links to requirement | `REQ-123: Must withstand 100°C` |
| `spec` | Technical specification | `Tensile Strength: 400 MPa` |
| `note` | General annotation | `Review with mechanical team` |
| `material` | Material property | `Aluminum 6061-T6` |
| `dimension` | Size measurement | `Width: 50mm` |
| `port` | Links to port definition | `Port: HVAC-IN` |
| `connector` | Links to connector | `Connector: USB-C` |

### Data Model

```
Imagine3DModel
  └─ Imagine3DPart (mesh_index: 0)
      ├─ Tag 1: {type: "material", key: "Material", value: "Steel"}
      ├─ Tag 2: {type: "requirement", requirementId: "REQ-123"}
      └─ Tag 3: {type: "dimension", key: "Thickness", value: "5mm"}
```

### Integration with Requirements

When user tags a part with a requirement:
1. Frontend: User selects "Requirement" tag type
2. Frontend: Shows autocomplete of linked requirements
3. User selects requirement (e.g., REQ-123)
4. Backend: Creates tag with `requirement_id` foreign key
5. Neo4j: Query finds requirement details for display

### Future Enhancements
- Auto-tagging based on part names (e.g., "port_inlet" → tag with port)
- Import tags from CAD metadata
- Export tags to PDF/Excel reports
- Version tracking for tag changes

---

## File Storage Strategy

### Storage Layout

```
workspace/
  └─ 3d/
      └─ models/
          ├─ {model-id-1}.glb       # Primary format (viewer)
          ├─ {model-id-1}.obj       # Export format
          ├─ {model-id-1}.usdz      # Export format (iOS/AR)
          └─ {model-id-1}.fbx       # Export format (Unity/Unreal)
```

### Storage Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Location** | Local filesystem (`workspace/3d/`) | Consistent with Imagine/SnapDraft patterns |
| **Database** | PostgreSQL metadata + file paths | Binary data on disk, not in DB |
| **Formats** | Store all 4 formats (GLB, OBJ, USDZ, FBX) | Support different use cases |
| **Primary** | GLB for web viewer | Best Three.js support, smallest size |
| **Cleanup** | Delete files when model deleted | CASCADE on DB delete |
| **Backup** | Include in project backup jobs | Treat like other workspace assets |

### CDN Considerations (Future)

For production at scale:
- Serve GLB files via Nginx static file serving
- Add `Cache-Control` headers for browser caching
- Consider S3/CloudFront for multi-server deployments
- Keep PostgreSQL paths, update to S3 URLs when deployed

---

## API Endpoints

### Generation

#### `POST /api/:tenant/:project/imagine/3d/generate`
**Description:** Initiate 3D model generation from an Imagine image

**Request Body:**
```json
{
  "imagineImageId": "img-1234567890",
  "settings": {
    "geometryModel": "base",
    "textureModel": "pbr",
    "resolution": 100000,
    "symmetry": "auto",
    "scaledBbox": [0.5, 0.5, 0.5]
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-...",
    "imagineImageId": "img-1234567890",
    "status": "pending",
    "csmSessionId": "csm_...",
    "createdAt": "2025-10-26T12:00:00Z"
  }
}
```

### Status

#### `GET /api/:tenant/:project/imagine/3d/:modelId`
**Description:** Get model status and metadata

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid-...",
    "status": "complete",
    "glbFilePath": "/3d/models/uuid-....glb",
    "objFilePath": "/3d/models/uuid-....obj",
    "polygonCount": 95432,
    "completedAt": "2025-10-26T12:05:00Z"
  }
}
```

### Download

#### `GET /api/:tenant/:project/imagine/3d/:modelId/download/:format`
**Description:** Download model file in specified format

**Params:**
- `format`: `glb` | `obj` | `usdz` | `fbx`

**Response:** Binary file stream with appropriate `Content-Type`

### Parts

#### `POST /api/:tenant/:project/imagine/3d/:modelId/parts`
**Description:** Create a part record (usually auto-created during model processing)

**Request Body:**
```json
{
  "partName": "Front Panel",
  "meshIndex": 0,
  "meshUuid": "three-uuid-...",
  "boundingBox": {
    "min": [0, 0, 0],
    "max": [1, 1, 1]
  }
}
```

#### `GET /api/:tenant/:project/imagine/3d/:modelId/parts`
**Description:** List all parts in a model

### Tags

#### `GET /api/:tenant/:project/imagine/3d/:modelId/parts/:partId/tags`
**Description:** Get all tags for a part

**Response:**
```json
{
  "success": true,
  "data": {
    "tags": [
      {
        "id": "uuid-...",
        "tagType": "material",
        "tagKey": "Material",
        "tagValue": "Aluminum 6061-T6",
        "createdAt": "2025-10-26T12:10:00Z"
      }
    ]
  }
}
```

#### `POST /api/:tenant/:project/imagine/3d/:modelId/tags`
**Description:** Create a new tag

**Request Body:**
```json
{
  "partId": "uuid-...",
  "tagType": "requirement",
  "tagKey": "Requirement",
  "tagValue": "REQ-123",
  "requirementId": "req-uuid-..."
}
```

#### `DELETE /api/:tenant/:project/imagine/3d/:modelId/tags/:tagId`
**Description:** Delete a tag

---

## Security & Performance

### Security

1. **Authentication**
   - All endpoints require JWT authentication (`fastify.authenticate`)
   - CSM API key stored in Docker secrets
   - Never expose CSM API key to frontend

2. **Authorization**
   - Verify tenant/project access before operations
   - Check user permissions for 3D generation
   - Rate limit generation requests (e.g., 10/hour per user)

3. **Input Validation**
   - Validate model ID format (UUID)
   - Validate file format in download endpoint
   - Sanitize tag inputs to prevent XSS
   - Validate CSM session IDs

4. **File Access**
   - Serve models through API (not direct filesystem access)
   - Verify user has access to project before serving files
   - Add CORS headers for GLB files if needed

### Performance

1. **Caching**
   - Browser cache GLB files (1 hour `Cache-Control`)
   - React Query cache model metadata (5 min stale time)
   - CDN for static 3D assets (future)

2. **Optimization**
   - Compress GLB files during download (gzip)
   - Lazy load 3D viewer component (code splitting)
   - Use Three.js LOD (Level of Detail) for large models
   - Throttle frontend polling (5s interval)

3. **Database**
   - Index on `(tenant_slug, project_slug, status)`
   - Index on `csm_session_id` for webhook lookups
   - Limit query results to last 100 models

4. **Concurrent Requests**
   - Background polling service limits to 20 models per cycle
   - Download models in parallel (Promise.all)
   - Queue CSM API requests to avoid rate limits

---

## Testing Strategy

### Unit Tests

**Backend:**
- `csm-client.test.ts`: Mock CSM API responses, test error handling
- `model-storage.test.ts`: Test file save/read/delete operations
- `imagine-3d-service.test.ts`: Mock DB + CSM, test generation workflow

**Frontend:**
- `Imagine3DViewer.test.tsx`: Test component rendering with mock data
- `useImagine3DApi.test.ts`: Test React Query hooks with MSW

### Integration Tests

1. **Generation Flow**
   - Create Imagine image
   - Initiate 3D generation
   - Poll status until complete
   - Verify files downloaded
   - Verify DB records created

2. **Tagging Flow**
   - Load 3D model
   - Select part
   - Add tag
   - Verify tag in database
   - Verify tag appears in UI

3. **Error Handling**
   - CSM API failure (invalid key)
   - Session timeout (exceeds 10 min)
   - Download failure (network error)
   - Invalid file format

### E2E Tests (Playwright)

```typescript
test('User generates 3D model from Imagine image', async ({ page }) => {
  await page.goto('/project/imagine');
  await page.click('[data-testid="imagine-image-card"]');
  await page.click('[data-testid="generate-3d-button"]');

  // Wait for processing
  await page.waitForSelector('[data-testid="3d-status-complete"]', { timeout: 120000 });

  // Open viewer
  await page.click('[data-testid="open-3d-viewer"]');
  await page.waitForSelector('canvas');

  // Verify model loaded
  const canvas = await page.$('canvas');
  expect(canvas).toBeTruthy();
});
```

---

## Deployment & Configuration

### Environment Variables

**`.env.production`**
```bash
# CSM API Configuration
CSM_API_KEY=csm_live_...
CSM_BASE_URL=https://api.csm.ai/v3
CSM_GEOMETRY_MODEL=base
CSM_TEXTURE_MODEL=pbr
CSM_RESOLUTION=100000
CSM_POLL_INTERVAL=30000
CSM_MAX_POLL_TIME=600000

# Webhook (optional)
CSM_WEBHOOK_URL=https://airgen.studio/api/webhooks/csm
CSM_WEBHOOK_SECRET=webhook_secret_...
```

### Docker Secrets

**`docker-compose.prod.yml`**
```yaml
services:
  api:
    secrets:
      - csm_api_key
      - csm_webhook_secret

secrets:
  csm_api_key:
    file: ./secrets/csm_api_key.txt
  csm_webhook_secret:
    file: ./secrets/csm_webhook_secret.txt
```

### Database Migration

```bash
# Run migration
psql $DATABASE_URL < backend/migrations/010-create-imagine-3d-tables.sql

# Verify tables
psql $DATABASE_URL -c "\dt imagine_3d_*"
```

### Backend Configuration

**`config.ts`**
```typescript
csm: {
  apiKey: getSecret('csm_api_key', 'CSM_API_KEY'),
  baseUrl: env.CSM_BASE_URL || 'https://api.csm.ai/v3',
  geometryModel: env.CSM_GEOMETRY_MODEL || 'base',
  textureModel: env.CSM_TEXTURE_MODEL || 'pbr',
  resolution: parseNumber(env.CSM_RESOLUTION, 100000),
  pollInterval: parseNumber(env.CSM_POLL_INTERVAL, 30000),
  maxPollTime: parseNumber(env.CSM_MAX_POLL_TIME, 600000),
  webhookSecret: getSecret('csm_webhook_secret', 'CSM_WEBHOOK_SECRET'),
}
```

### Nginx Configuration (Static File Serving)

**`nginx/default.conf`**
```nginx
# Serve 3D model files
location /3d/ {
    alias /workspace/3d/;
    add_header Cache-Control "public, max-age=3600";
    add_header Access-Control-Allow-Origin *;
    types {
        model/gltf-binary glb;
        model/obj obj;
        model/vnd.usdz+zip usdz;
        application/octet-stream fbx;
    }
}
```

---

## Cost Management

### CSM Pricing (as of 2025)

| Tier | Credits/Month | Price | Cost per Credit |
|------|---------------|-------|-----------------|
| Free | 10 | $0 | $0 |
| Starter | 100 | $12 | $0.12 |
| Pro | 400 | $40 | $0.10 |
| Enterprise | Custom | Custom | ~$0.08 |

**Image-to-3D Cost:** 1-5 credits per generation (depending on settings)

### Cost Tracking

1. **Database Logging**
   - `imagine_3d_generation_logs.credits_used` column
   - Query monthly usage: `SUM(credits_used) WHERE created_at > date_trunc('month', NOW())`

2. **Usage Limits**
   - Implement per-user rate limits (e.g., 5 generations/day)
   - Admin dashboard showing monthly credit usage
   - Alert when approaching tier limit

3. **Optimization**
   - Default to `geometry_model: "base"` (lowest cost)
   - Offer "High Quality" option for critical models
   - Cache 3D models to avoid regeneration

### Implementation

**Rate Limiting (Backend):**
```typescript
async function checkGenerationLimit(userId: string): Promise<boolean> {
  const result = await db.query(
    `SELECT COUNT(*) as count
     FROM imagine_3d_models
     WHERE user_id = $1
       AND created_at > NOW() - INTERVAL '24 hours'`,
    [userId]
  );

  const dailyLimit = 5; // Configurable
  return result.rows[0].count < dailyLimit;
}
```

**Usage Dashboard:**
```sql
-- Monthly usage by user
SELECT
  user_id,
  COUNT(*) as generations,
  SUM(COALESCE(credits_used, 3)) as estimated_credits
FROM imagine_3d_models
WHERE created_at >= date_trunc('month', NOW())
GROUP BY user_id
ORDER BY estimated_credits DESC;
```

---

## Timeline & Milestones

### Phase 1: Core Infrastructure (Week 1-2)

**Backend:**
- [ ] Database migration: Create PostgreSQL tables
- [ ] CSM client: API integration + session management
- [ ] Model storage: File download + local storage
- [ ] Core service: Generation orchestration
- [ ] API routes: Generate, status, download endpoints
- [ ] Background polling service

**Frontend:**
- [ ] Install Three.js dependencies
- [ ] Basic 3D viewer component
- [ ] Generate button + status badge
- [ ] API hooks with React Query
- [ ] Polling implementation

**Deliverable:** Can generate 3D model from Imagine image and view in basic viewer

---

### Phase 2: Viewer & Interactivity (Week 3)

**Frontend:**
- [ ] Part selection (click mesh to highlight)
- [ ] Camera controls (orbit, zoom, pan, reset)
- [ ] Lighting & environment setup
- [ ] Wireframe/X-ray visualization modes
- [ ] Loading states + error handling

**Deliverable:** Interactive 3D viewer with part selection

---

### Phase 3: Metadata Tagging (Week 4)

**Backend:**
- [ ] Parts API: CRUD endpoints
- [ ] Tags API: Create, read, delete
- [ ] Mesh analyzer: Auto-extract parts from GLB

**Frontend:**
- [ ] Tag panel sidebar
- [ ] Create/delete tag UI
- [ ] Requirement autocomplete
- [ ] Tag type selector (material, spec, etc.)

**Deliverable:** Users can tag 3D parts with metadata

---

### Phase 4: Polish & Testing (Week 5)

**Testing:**
- [ ] Unit tests (backend services)
- [ ] Integration tests (API endpoints)
- [ ] E2E tests (generation + tagging flow)

**Features:**
- [ ] Download menu (all formats)
- [ ] Gallery integration (3D badge on images)
- [ ] Cost tracking dashboard
- [ ] Rate limiting
- [ ] Error recovery (retry failed generations)

**Deliverable:** Production-ready feature with tests

---

### Phase 5: Advanced Features (Future)

- [ ] Webhook support for instant updates
- [ ] WebSocket notifications
- [ ] Measurement tools (distance, dimensions)
- [ ] Auto-tagging based on part names
- [ ] AR preview (USDZ on iOS)
- [ ] Annotation mode (add notes directly on 3D)
- [ ] Export to PDF with 3D views
- [ ] Multi-part assembly support (CSM "parts" mode)

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| CSM API downtime | High | Implement retry logic, queue failed requests |
| Large file sizes (>100MB) | Medium | Limit resolution, compress downloads |
| CSM cost overruns | High | Rate limiting, usage alerts, default to "base" model |
| Browser performance (complex models) | Medium | Use LOD, offer "simplified" viewer mode |
| Mesh parsing failures | Low | Fallback to basic viewer without part selection |
| Storage growth | Medium | Implement cleanup policy (delete old models) |

---

## Success Criteria

1. **Functional:**
   - ✅ User can generate 3D model from any Imagine image
   - ✅ Generation completes in <5 minutes for typical models
   - ✅ 3D viewer loads and renders GLB files
   - ✅ User can select parts and add metadata tags
   - ✅ Tags persist and link to requirements

2. **Performance:**
   - ✅ GLB files load in <3 seconds
   - ✅ Viewer maintains 30+ FPS on modern browsers
   - ✅ Polling doesn't overload backend (<1% CPU)

3. **Reliability:**
   - ✅ 95% generation success rate
   - ✅ Graceful error handling for API failures
   - ✅ No data loss on network interruptions

4. **UX:**
   - ✅ Clear progress indicators during generation
   - ✅ Intuitive part selection (hover + click)
   - ✅ Responsive controls (rotate/zoom feels smooth)

---

## Appendix

### Glossary

- **GLB**: Binary GLTF format, best for web 3D viewers
- **OBJ**: Wavefront OBJ format, widely supported in CAD tools
- **USDZ**: Universal Scene Description, iOS AR format
- **FBX**: Autodesk format for Unity/Unreal Engine
- **Mesh**: 3D geometry consisting of vertices, edges, faces
- **PBR**: Physically-Based Rendering, realistic textures
- **LOD**: Level of Detail, simplified models for performance

### References

- **CSM API Docs:** https://docs.csm.ai
- **Three.js Docs:** https://threejs.org/docs
- **React Three Fiber:** https://docs.pmnd.rs/react-three-fiber
- **GLTF Spec:** https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html

### Related AIRGen Features

- **Imagine (2D):** `/docs/features/imagine.md`
- **SnapDraft (Technical Drawings):** `/docs/features/snapdraft.md`
- **Architecture Viewer:** `/docs/features/architecture-viewer.md`
- **Graph Visualization:** `/docs/features/graph-viewer.md`

---

**Document Version:** 1.0
**Last Updated:** 2025-10-26
**Author:** Claude (AIRGen Development Team)
