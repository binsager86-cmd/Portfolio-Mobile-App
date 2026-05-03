# Portfolio Tracker Incident Runbook

| Symptom | Triage Steps | Owner | SLA |
| --- | --- | --- | --- |
| API p95 > 800ms | Check PgBouncer `SHOW POOLS`; query `pg_stat_activity` for active sessions; disable heavy AI routes via feature flag | Backend Eng | 15m |
| Mobile crash spike (>2%) | Check Sentry by release version; verify Expo OTA state; roll back bundle via `eas update:rollback` | Mobile Eng | 30m |
| Scraper returns empty | Check `X-Cache-Status`; verify upstream structure; toggle `enable_whale_signals_v2=false`; notify users via push | Data Eng | 1h |
| DB connection pool full | Run PgBouncer `SHOW POOLS`; kill idle-in-transaction sessions; raise `default_pool_size`; restart API with jitter controls | DevOps | 10m |
| Alembic migration fails | Run `alembic current`; restore pre-deploy snapshot; run `alembic downgrade`; patch migration and redeploy | DBA/Backend | 5m |

## Pre-Release Checklist

- `alembic upgrade head` passes in CI
- `pytest --cov=app --cov-report=term-missing` >= 80%
- Sentry release created: `sentry-cli releases new vYYYYMMDD`
- Feature flags verified: `enable_new_ai_pipeline=false` for first rollout
- DB backup taken: `pg_dump -Fc portfolio_db > pre_deploy_<timestamp>.dump`
- Mobile OTA staged: `eas update --branch production --message "v2.5.0-rc1"`

## Performance Budgets

- DB connection wait time: <= 50ms
- Web bundle size (gzipped): <= 6.2MB
- CDN cache hit ratio: >= 94%
- Rollback time: <= 90s
- MTTR: <= 15m
