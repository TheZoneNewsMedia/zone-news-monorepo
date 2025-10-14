### Routing Map (Gateway → Services)

- Purpose: Make forwarding decisions explicit and consistent.

API Gateway (apps/api) should route as follows:

- /v1/news/* → apps/news-api (3011)
  - /v1/news, /v1/trending, /v1/breaking, /v1/stats
- /v1/groups/* → apps/groups-service (3012)
  - /v1/groups, /v1/groups/:chatId, .../topics
- /v1/channels/* → apps/channels-service (3013)
- /v1/auth/* → apps/auth-service (TBA)
- /v1/user/* → apps/user-service (TBA)
- /v1/workflow/* → apps/workflow-service (TBA)
- /v1/settings/* → apps/settings-service (TBA)
- /v1/mtproto/* → apps/mtproto-sidecar (3014, internal-only)

Notes
- Prefix all service routes with /v1 to enable versioning
- Apply rate limiting and auth at the gateway
- Use internal tokens for sidecar calls