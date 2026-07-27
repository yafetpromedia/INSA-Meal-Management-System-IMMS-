# IMMS REST API

Full specification: [SRS Part 6](../srs/06-rest-api-specification.md).

| Item | Value |
| ---- | ----- |
| Base URL | `/api/v1` |
| Docs | `/api/docs` |
| Auth | Bearer JWT |
| Envelope | `{ success, message, data, meta }` |
| Pagination | `page` + `limit` (legacy `skip`/`take` accepted) |
