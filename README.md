# Vercel MCP Server

Model Context Protocol (MCP) server for Vercel deployment automation. Enables Javari AI to autonomously deploy applications, monitor builds, and manage Vercel resources.

## Features

- ✅ Trigger deployments (preview and production)
- ✅ Monitor build status in real-time
- ✅ Retrieve deployment logs
- ✅ Parse build errors
- ✅ Promote preview to production
- ✅ Cancel failed deployments
- ✅ Manage environment variables
- ✅ Configure domains
- ✅ List all projects
- ✅ Secure API key authentication
- ✅ Comprehensive logging

## Installation

```bash
npm install
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `VERCEL_TOKEN`: Vercel access token with deployment permissions
- `MCP_API_KEY`: Secure key for MCP authentication

## Development

```bash
npm run dev
```

## Production

```bash
npm run build
npm start
```

## API Endpoints

### Health Check
```
GET /health
```

### Trigger Deployment
```
POST /api/deploy
Headers: x-api-key: YOUR_MCP_KEY
Body: {
  "name": "my-app",
  "gitSource": {
    "type": "github",
    "repo": "CR-AudioViz-AI/my-repo",
    "ref": "main"
  },
  "framework": "nextjs",
  "envVariables": [
    { "key": "API_KEY", "value": "secret" }
  ]
}
```

### Get Deployment Status
```
GET /api/deploy/:id/status
Headers: x-api-key: YOUR_MCP_KEY
```

### Get Deployment Logs
```
GET /api/deploy/:id/logs
Headers: x-api-key: YOUR_MCP_KEY
```

### Get Build Errors
```
GET /api/deploy/:id/errors
Headers: x-api-key: YOUR_MCP_KEY
```

### Promote to Production
```
POST /api/deploy/:id/promote
Headers: x-api-key: YOUR_MCP_KEY
```

### Cancel Deployment
```
DELETE /api/deploy/:id
Headers: x-api-key: YOUR_MCP_KEY
```

### List Projects
```
GET /api/projects
Headers: x-api-key: YOUR_MCP_KEY
```

### Set Environment Variables
```
POST /api/env
Headers: x-api-key: YOUR_MCP_KEY
Body: {
  "projectId": "prj_xxx",
  "env": {
    "API_KEY": "value",
    "DATABASE_URL": "postgres://..."
  }
}
```

### Configure Domain
```
POST /api/projects/:id/domain
Headers: x-api-key: YOUR_MCP_KEY
Body: {
  "domain": "myapp.com"
}
```

## Security

- All endpoints (except /health) require API key authentication
- Rate limiting: 1000 requests per hour per IP
- Vercel token stored securely in environment variables
- Audit logging for all operations

## Deployment

### Railway (Recommended)

```bash
railway up
```

Configure environment variables in Railway dashboard.

### Docker

```bash
docker build -t crav-mcp-vercel .
docker run -p 3002:3002 --env-file .env crav-mcp-vercel
```

## Monitoring

Check server health:
```bash
curl http://localhost:3002/health
```

## Error Handling

All endpoints return consistent error format:
```json
{
  "error": "Error description",
  "details": "Detailed message from Vercel API"
}
```

## Deployment Status States

- `INITIALIZING`: Deployment is being prepared
- `BUILDING`: Code is being built
- `DEPLOYING`: Built code is being deployed
- `READY`: Deployment is live and accessible
- `ERROR`: Deployment failed
- `CANCELED`: Deployment was cancelled

## Logs

- `combined.log`: All operations
- `error.log`: Errors only
- Console: Real-time colored output

## License

MIT - CR AudioViz AI
