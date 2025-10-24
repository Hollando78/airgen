# AIRGen Network Architecture

Complete network diagram and documentation for the AIRGen system architecture.

## Network Diagram

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              INTERNET / EXTERNAL CLIENTS                         │
│                                                                                  │
│   ┌──────────────┐     ┌──────────────┐     ┌──────────────┐                  │
│   │   Browser    │     │   OpenAI     │     │   Gemini     │                  │
│   │   Clients    │     │ api.openai   │     │ googleapis   │                  │
│   │              │     │    .com      │     │    .com      │                  │
│   └──────────────┘     └──────────────┘     └──────────────┘                  │
│          │                     ▲                     ▲                          │
│       HTTPS                    │                     │                          │
│          │                  HTTPS                 HTTPS                         │
│          │                     │                     │                          │
│   ┌──────────────┐                                                              │
│   │  SMTP Server │                                                              │
│   │ (Mailgun etc)│                                                              │
│   └──────────────┘                                                              │
│          ▲                                                                       │
│        SMTP                                                                      │
│          │                                                                       │
└──────────┼───────────────────────────────────────────┬──────────────────────────┘
           │                                           │
           │                                           │
┌──────────┼───────────────────────────────────────────┼──────────────────────────┐
│  HOST OS │(Port 443/80)                              │                          │
│          │                                           │                          │
│    ┌─────▼─────────────────────────────────────┐    │                          │
│    │            TRAEFIK                        │    │                          │
│    │      Reverse Proxy / Load Balancer       │    │                          │
│    │                                           │    │                          │
│    │  - Listens: 0.0.0.0:80, 0.0.0.0:443     │    │                          │
│    │  - SSL/TLS Termination                   │    │                          │
│    │  - HTTP → HTTPS Redirect                 │    │                          │
│    │  - Routing Rules (Docker labels)         │    │                          │
│    └───────────────┬───────────────────────────┘    │                          │
│                    │                                 │                          │
│    ┌───────────────┼─────────────────────────────────┼──────────────────────┐  │
│    │ DOCKER BRIDGE NETWORK (airgen_default)         │                      │  │
│    │                                                 │                      │  │
│    │          ┌──────────────────────────────────────┘                      │  │
│    │          │                        │                                    │  │
│    │          │                        │                                    │  │
│    │  ┌───────▼────────┐      ┌────────▼─────────┐                         │  │
│    │  │  NGINX         │      │  FASTIFY API     │                         │  │
│    │  │  (Frontend)    │      │  (Backend)       │                         │  │
│    │  │                │      │                  │────── HTTPS:443 ────────┼──┼─→ OpenAI
│    │  │  - Static HTML │      │  - Port 8787     │                         │  │
│    │  │  - JS/CSS      │      │  - REST API      │────── HTTPS:443 ────────┼──┼─→ Gemini
│    │  │  - Images      │      │  - Auth/JWT      │                         │  │
│    │  │                │      │  - Business      │────── SMTP:587/465 ─────┼──┼─→ SMTP
│    │  │  Routes:       │      │    Logic         │                         │  │
│    │  │   airgen       │      │                  │                         │  │
│    │  │   .studio/     │      │  Routes:         │                         │  │
│    │  │                │      │   /api/*         │                         │  │
│    │  │                │      │   /imagine/*     │                         │  │
│    │  └────────────────┘      └──────┬───────────┘                         │  │
│    │                                  │                                     │  │
│    │                                  │                                     │  │
│    │         ┌────────────────────────┼─────────────────────────┐          │  │
│    │         │                        │                         │          │  │
│    │         │                        │                         │          │  │
│    │  ┌──────▼────────┐     ┌─────────▼──────┐      ┌──────────▼───────┐ │  │
│    │  │  POSTGRESQL   │     │     NEO4J      │      │      REDIS       │ │  │
│    │  │               │     │                │      │                  │ │  │
│    │  │  - Port 5432  │     │  - Bolt: 7687  │      │   - Port 6379   │ │  │
│    │  │  - Protocol:  │     │  - HTTP: 7474  │      │   - Protocol:   │ │  │
│    │  │    PostgreSQL │     │  - Protocol:   │      │     RESP/TCP    │ │  │
│    │  │    Wire       │     │    Bolt Binary │      │                  │ │  │
│    │  │  - Relational │     │  - Graph DB    │      │   - In-Memory   │ │  │
│    │  │    Data       │     │  - Architecture│      │     KV Store    │ │  │
│    │  │  - Users      │     │    Models      │      │   - Sessions    │ │  │
│    │  │  - Documents  │     │  - Trace Links │      │   - Cache       │ │  │
│    │  │  - Projects   │     │  - Blocks      │      │   - Refresh     │ │  │
│    │  │               │     │  - Interfaces  │      │     Tokens      │ │  │
│    │  └───────────────┘     └────────────────┘      └──────────────────┘ │  │
│    │                                                                       │  │
│    │  NO EXTERNAL PORTS EXPOSED (Internal Docker Network Only)            │  │
│    └───────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│    ┌───────────────────────────────────────────────────────────────────────┐  │
│    │ DOCKER VOLUMES (Persistent Storage)                                   │  │
│    │                                                                        │  │
│    │  - airgen_pgdata          (PostgreSQL data)                           │  │
│    │  - airgen_neo4jdata       (Neo4j graph data)                          │  │
│    │  - /workspace             (Surrogate images, uploads)                 │  │
│    │  - ./letsencrypt          (SSL certificates)                          │  │
│    └────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

## Connection Summary

| Source          | Destination     | Protocol       | Port | Direction | Purpose                    |
|-----------------|-----------------|----------------|------|-----------|----------------------------|
| Browser         | Traefik         | HTTPS          | 443  | Inbound   | User web traffic           |
| Browser         | Traefik         | HTTP           | 80   | Inbound   | Redirects to HTTPS         |
| Traefik         | Nginx           | HTTP           | 80   | Internal  | Serve static frontend      |
| Traefik         | Fastify API     | HTTP           | 8787 | Internal  | API requests               |
| Fastify API     | PostgreSQL      | PostgreSQL     | 5432 | Internal  | Relational data queries    |
| Fastify API     | Neo4j           | Bolt           | 7687 | Internal  | Graph queries              |
| Fastify API     | Redis           | RESP/TCP       | 6379 | Internal  | Cache & session management |
| Fastify API     | OpenAI          | HTTPS          | 443  | Outbound  | LLM API calls              |
| Fastify API     | Gemini          | HTTPS          | 443  | Outbound  | Vision/Image generation    |
| Fastify API     | SMTP Server     | SMTP/STARTTLS  | 587  | Outbound  | Email delivery             |

## Network Layers

```
┌────────────────────────────────────────────────────────────┐
│ PRESENTATION LAYER                                         │
│  - Traefik (Reverse Proxy, SSL/TLS, Routing)              │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ APPLICATION LAYER                                          │
│  - Nginx (Static Assets)                                   │
│  - Fastify API (Business Logic, Authentication)           │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ DATA LAYER                                                 │
│  - PostgreSQL (Relational)                                 │
│  - Neo4j (Graph)                                           │
│  - Redis (Cache/Sessions)                                  │
└────────────────────────────────────────────────────────────┘
                          ↓
┌────────────────────────────────────────────────────────────┐
│ EXTERNAL SERVICES LAYER                                    │
│  - OpenAI (LLM)                                            │
│  - Gemini (Vision/Image)                                   │
│  - SMTP (Email)                                            │
└────────────────────────────────────────────────────────────┘
```

## Component Details

### Presentation Layer

#### Traefik (Reverse Proxy)
- **Role**: Entry point for all HTTP/HTTPS traffic
- **Listens on**: Ports 80 (HTTP) and 443 (HTTPS)
- **Functions**:
  - SSL/TLS termination with Let's Encrypt
  - Automatic HTTP to HTTPS redirect
  - Request routing based on path and host
  - Load balancing (if scaled horizontally)
- **Routing Rules**:
  - `airgen.studio/*` → Nginx (frontend)
  - `airgen.studio/api/*` → Fastify API
  - `airgen.studio/imagine/*` → Fastify API (image serving)

### Application Layer

#### Nginx (Frontend Server)
- **Role**: Serves static frontend assets
- **Serves**:
  - Compiled React application (HTML, JS, CSS)
  - Static images and assets
- **No external port exposure** (accessed via Traefik)

#### Fastify API (Backend Server)
- **Role**: REST API and business logic
- **Internal Port**: 8787
- **Functions**:
  - User authentication (JWT tokens)
  - Requirements management
  - Document management
  - Trace link management
  - AI integration (AIRGen, Imagine)
  - Architecture diagram generation
- **No external port exposure** (accessed via Traefik)

### Data Layer

#### PostgreSQL
- **Role**: Primary relational database
- **Port**: 5432 (internal only)
- **Protocol**: PostgreSQL Wire Protocol
- **Stores**:
  - User accounts
  - Tenants and projects
  - Documents and sections
  - Requirements, infos, surrogates
  - Trace links
  - Activity logs
- **Volume**: `airgen_pgdata`

#### Neo4j
- **Role**: Graph database for architecture modeling
- **Ports**:
  - 7687 (Bolt protocol - used by API)
  - 7474 (HTTP - not exposed externally)
- **Protocol**: Bolt (binary graph protocol)
- **Stores**:
  - Architecture blocks
  - Interfaces
  - Port definitions and instances
  - Connector definitions and instances
  - Block-to-block relationships
- **Volume**: `airgen_neo4jdata`

#### Redis
- **Role**: In-memory cache and session store
- **Port**: 6379 (internal only)
- **Protocol**: RESP (REdis Serialization Protocol) over TCP
- **Stores**:
  - HTTP response cache (with TTL)
  - Refresh tokens (7-day expiry)
  - Session data
- **No persistent volume** (ephemeral, recreated on restart)

### External Services Layer

#### OpenAI
- **Endpoint**: `https://api.openai.com/v1/*`
- **Port**: 443 (HTTPS)
- **Used for**:
  - AIRGen (requirement generation)
  - Text generation features
- **Model**: GPT-4o-mini (configurable)

#### Gemini (Google)
- **Endpoint**: `https://generativelanguage.googleapis.com/*`
- **Port**: 443 (HTTPS)
- **Used for**:
  - Imagine (image generation from text)
  - Vision analysis (image understanding)
- **Model**: Gemini 2.5 Flash Image (configurable)

#### SMTP Server
- **Port**: 587 (STARTTLS) or 465 (SMTPS)
- **Used for**:
  - Password reset emails
  - Account verification
  - Notifications
- **Provider**: Configurable (e.g., Mailgun, SendGrid)

## Security Boundaries

1. **Public Internet → Traefik**
   - HTTPS only (port 80 redirects to 443)
   - SSL/TLS encrypted (Let's Encrypt certificates)
   - Rate limiting configured
   - CORS policies enforced

2. **Traefik → Internal Services**
   - HTTP within Docker network (trusted environment)
   - No encryption needed (isolated network)
   - Services not directly accessible from internet

3. **Data Layer**
   - NO external port exposure
   - Accessible only within Docker network
   - No direct internet access
   - Database credentials stored as Docker secrets

4. **Outbound API Calls**
   - HTTPS encrypted to external services
   - API keys stored as Docker secrets
   - Rate limiting applied

## Port Reference

### Standard Ports (IANA)
- **80**: HTTP (redirects to HTTPS)
- **443**: HTTPS (standard encrypted web traffic)
- **587**: SMTP with STARTTLS (email submission)
- **465**: SMTPS (SMTP over SSL)

### Database Defaults
- **5432**: PostgreSQL Wire Protocol
- **6379**: Redis RESP Protocol
- **7687**: Neo4j Bolt Protocol
- **7474**: Neo4j HTTP (not exposed)

### Custom Application Ports
- **8787**: Fastify API (internal only)

## Network Flow Examples

### User Loads Web Page
```
User Browser → Traefik:443 → Nginx:80 → Static HTML/JS
```

### User Makes API Call
```
User Browser → Traefik:443 → Fastify:8787 → PostgreSQL:5432
                                          → Neo4j:7687
                                          → Redis:6379
```

### AI Feature (AIRGen)
```
User Browser → Traefik:443 → Fastify:8787 → PostgreSQL:5432 (fetch requirements)
                                          → OpenAI:443 (generate)
                                          → PostgreSQL:5432 (save results)
                                          → Redis:6379 (cache)
```

### Image Generation (Imagine)
```
User Browser → Traefik:443 → Fastify:8787 → Neo4j:7687 (fetch block data)
                                          → Gemini:443 (generate image)
                                          → Filesystem (save image)
                                          → PostgreSQL:5432 (save metadata)
```

## Infrastructure Notes

### Docker Networking
- **Network Type**: Bridge network (default)
- **DNS**: Docker's internal DNS resolves service names
- **Isolation**: Services cannot be accessed from host unless ports are exposed

### Persistent Storage
- **PostgreSQL Data**: Docker volume `airgen_pgdata`
- **Neo4j Data**: Docker volume `airgen_neo4jdata`
- **Workspace Files**: Host directory mount at `/workspace`
- **SSL Certificates**: Host directory mount at `./letsencrypt`

### High Availability Considerations
- Redis has no persistence (by design) - can be recreated
- PostgreSQL and Neo4j have persistent volumes
- Traefik uses Let's Encrypt with automatic renewal
- All services configured with `restart: unless-stopped`

## Future Considerations

### Potential Scaling
- Multiple Fastify API instances behind Traefik
- PostgreSQL read replicas
- Redis Cluster for high availability
- Separate Neo4j cluster

### Monitoring
- Traefik dashboard (`/traefik` endpoint)
- Application logs via Docker
- Database performance metrics
- API rate limiting metrics

---

**Last Updated**: 2025-10-24
**AIRGen Version**: Production deployment at airgen.studio
