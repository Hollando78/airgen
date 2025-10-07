# Changelog

All notable changes to AIRGen will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Inline editing for verification field in requirements table (double-click to edit)
- Custom attributes foundation: `attributes` field on RequirementRecord for extensible metadata
- Comprehensive implementation guide for custom attributes system (CUSTOM_ATTRIBUTES_IMPLEMENTATION.md)
- Optimized `/sections/:tenant/:project/:docSlug/full` endpoint with batched Neo4j queries

### Changed
- Markdown editor now uses live Neo4j data as source of truth instead of cached ContentBlocks
- Inline edits are now considered published changes (no separate ContentBlock cache)
- Document section queries optimized: reduced from 31 API calls to 1 (~97% improvement)
- Markdown generation now includes infos and surrogates alongside requirements

### Fixed
- Verification field now properly displays in requirements table
- Surrogate slug property corrected in markdown generation (was `surrogateSlug`, now `slug`)
- Markdown editor displays all inline edits immediately upon opening

### Performance
- Batched Neo4j query for document sections with relations (listDocumentSectionsWithRelations)
- Query monitoring integration using executeMonitoredQuery
- Optimized queries follow patterns from Neo4j performance improvements (commit f7736f8)

## [Previous Work]

### Performance Improvements
- Comprehensive Neo4j performance and security enhancements
- Monitored query system with performance tracking
- Connection pooling and query optimization

### Features
- Requirements inline editing and section moves
- Markdown roundtrip integrity tests
- Architecture diagram port overrides and connector label positioning
- Floating document windows
- Toast notifications system
- Admin requirements management with broken links detection

### Documentation
- Design Description Document
- Test infrastructure documentation
- E2E testing guide with Playwright
- Observability and monitoring setup
- Troubleshooting guide

---

For detailed commit history, see: https://github.com/Hollando78/airgen/commits/master
