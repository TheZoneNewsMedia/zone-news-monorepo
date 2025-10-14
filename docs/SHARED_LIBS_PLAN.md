### Shared Libraries Plan

- Purpose: Remove duplication, standardize cross-cutting concerns.

Libraries
- libs/database: Mongo client factory, readiness, connection pooling
- libs/auth: JWT verify/sign; internal token validator (for sidecars)
- libs/logger: pino/winston JSON logger with request IDs
- libs/queue: Redis pub/sub or BullMQ; job helpers
- libs/shared: types, constants, error helpers

Adoption order
1) libs/database + libs/logger (quick wins)
2) libs/auth (gateway + auth-service)
3) libs/queue (mtproto jobs)

Guidelines
- No service imports another service’s code
- Only depend on libs/* and external packages