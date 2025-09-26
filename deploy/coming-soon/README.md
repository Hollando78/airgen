# AIRGen Coming Soon Stack

This minimal stack serves a static "coming soon" page for `airgen.studio` behind Traefik with automatic TLS via Let's Encrypt (DNS challenge against Cloudflare).

## Prerequisites

- Docker Compose v2 and Docker Engine installed on the target host.
- Root access to the host's shell.
- The public IPv4 address of the host (for DNS).
- A Cloudflare API token with permission to edit the DNS records for `airgen.studio`.

## 1. Configure Cloudflare DNS

1. Create an **API Token** in Cloudflare with the following settings:
   - Permissions: `Zone.DNS Edit`
   - Zone Resources: `airgen.studio`
2. Add (or update) an `A` record for `airgen.studio` that points to the host's public IP. Leave the proxy (orange cloud) **enabled**—DNS challenge works while proxied when using the API token.

## 2. Prepare environment variables

From the repo root:

```bash
cp deploy/coming-soon/.env.example deploy/coming-soon/.env
```

Edit `deploy/coming-soon/.env` and set:

- `ACME_EMAIL` – email address for Let's Encrypt expiry notices.
- `CLOUDFLARE_DNS_API_TOKEN` – the Cloudflare API token created above.
- `DOMAIN` – normally `airgen.studio`; adjust if you plan to serve a subdomain.

## 3. Launch the stack

Still from the repo root:

```bash
docker compose \
  --env-file deploy/coming-soon/.env \
  -f deploy/coming-soon/docker-compose.yml \
  up -d
```

Traefik will request certificates from Let's Encrypt using the DNS challenge. The issued certificates are stored in `letsencrypt/acme.json` (already ignored by git).

## 4. Verify deployment

- Check container status: `docker compose -f deploy/coming-soon/docker-compose.yml ps`
- Follow Traefik logs until the certificate is issued: `docker compose -f deploy/coming-soon/docker-compose.yml logs -f traefik`
- Visit `https://airgen.studio` to confirm the coming soon page renders with a valid certificate.
- The Traefik dashboard is available at `https://airgen.studio/traefik` (consider securing it with basic auth before exposing publicly).

## 5. Teardown

```bash
docker compose \
  --env-file deploy/coming-soon/.env \
  -f deploy/coming-soon/docker-compose.yml \
  down
```

Persisted certificates remain in `letsencrypt/acme.json`. Remove that file only if you need to force new certificate issuance.
