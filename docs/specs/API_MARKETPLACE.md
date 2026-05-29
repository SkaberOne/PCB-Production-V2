# API Marketplace

Source de verite runtime: `http://localhost:8000/docs`

Ce document resume les zones actives les plus utiles.

## Productions

- `GET /api/marketplace/productions`
- `POST /api/marketplace/productions`
- `GET /api/marketplace/productions/{production_id}`
- `PATCH /api/marketplace/productions/{production_id}`
- `DELETE /api/marketplace/productions/{production_id}`
- `POST /api/marketplace/productions/{production_id}/bom-revisions`
- `POST /api/marketplace/productions/{production_id}/bom-revisions/detach`
- `PATCH /api/marketplace/productions/{production_id}/bom-quantities`

## Commandes composants

- `POST /api/marketplace/commands`
- `GET /api/marketplace/commands`
- `GET /api/marketplace/commands/{command_id}`
- `PUT /api/marketplace/commands/{command_id}`
- `DELETE /api/marketplace/commands/{command_id}`
- `POST /api/marketplace/commands/generate`
- `GET /api/marketplace/commands/{command_id}/summary`
- `POST /api/marketplace/commands/{command_id}/erp-export`

## Plans de production

- `POST /api/marketplace/commands/{command_id}/plans`
- `GET /api/marketplace/commands/{command_id}/plans`
- `GET /api/marketplace/commands/{command_id}/plans/{plan_id}/summary`
- `POST /api/marketplace/commands/{command_id}/plans/{plan_id}/auto-assign`
- `POST /api/marketplace/commands/{command_id}/plans/{plan_id}/assignments`
- `PUT /api/marketplace/commands/{command_id}/plans/{plan_id}/assignments/{assignment_id}`
- `DELETE /api/marketplace/commands/{command_id}/plans/{plan_id}/assignments/{assignment_id}`
- `POST /api/marketplace/commands/{command_id}/plans/{plan_id}/validate`
- `DELETE /api/marketplace/commands/{command_id}/plans/{plan_id}`

## Machines / feeders / carts

- `GET /api/marketplace/machines`
- `POST /api/marketplace/machines`
- `GET /api/marketplace/machines/{machine_id}`
- `GET /api/marketplace/machines/{machine_id}/summary`
- `PUT /api/marketplace/machines/{machine_id}`
- `DELETE /api/marketplace/machines/{machine_id}`
- `POST /api/marketplace/feeder-types`
- `GET /api/marketplace/feeder-types`
- `PUT /api/marketplace/feeder-types/{feeder_id}`
- `DELETE /api/marketplace/feeder-types/{feeder_id}`
- `POST /api/marketplace/carts`
- `GET /api/marketplace/carts`
- `PUT /api/marketplace/carts/{cart_id}`
- `DELETE /api/marketplace/carts/{cart_id}`
- `POST /api/marketplace/fixed-feeders/calculate`
- `GET /api/marketplace/fixed-feeders/components`
- `PATCH /api/marketplace/fixed-feeders/components/{component_id}`
