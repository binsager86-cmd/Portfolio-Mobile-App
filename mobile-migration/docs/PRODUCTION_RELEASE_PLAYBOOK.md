# Production Release Playbook

## Feature Flags

- Source file: `backend-api/app/core/feature_flags.py`
- Default behavior ships with conservative flags.
- Toggle high-risk capabilities gradually after deploy.

## Zero-Downtime Rollout

1. Pin stable image tag before deployment.
2. Run database migration (`alembic upgrade head`) as a pre-start step.
3. Start new instance and verify `/health` and `/metrics`.
4. Shift traffic gradually.
5. Observe Sentry + Prometheus for 10-15 minutes.

### Example Commands

```bash
renderctl deploy portfolio-api --image=registry.example.com/portfolio-api:v2.4.1
cd backend-api && alembic downgrade -1 && alembic stamp head
```

## Render Notes

Render Blueprint does not currently support a first-class `rollback` policy block in this repo schema. Use image pinning, pre-deploy DB snapshots, and `renderctl deploy --image` to achieve blue/green-style rollback behavior.

## Post-Deploy Verification

- `GET /health` returns status ok
- `GET /metrics` exposes Prometheus counters/histograms
- Sentry release health is receiving events
- `SHOW POOLS;` in PgBouncer shows expected pool usage
