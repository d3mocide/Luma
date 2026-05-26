# Luma
Your Health Coach 

## Frontend Dev Hot Reload (Docker)

Use the Compose dev profile to run Vite with live reload in a container:

```bash
docker compose --profile dev up -d frontend-dev api postgres redis whisper worker
```

Then open:

- http://localhost:5173

The Vite dev server proxies API calls to the in-network `api` service.

Mock mode:

- Dev profile enables frontend mock data by default via `VITE_USE_MOCK_DATA=1`.
- To test against live backend data, start with `VITE_USE_MOCK_DATA=0`.
