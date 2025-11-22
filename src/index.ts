import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';

dotenv.config();

// Logger configuration
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 1000,
  message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// API Key authentication middleware
const authenticateAPI = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.MCP_API_KEY) {
    logger.warn('Unauthorized API access attempt', {
      ip: req.ip,
      path: req.path
    });
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// Apply auth to all routes except health
app.use((req, res, next) => {
  if (req.path === '/health') {
    return next();
  }
  authenticateAPI(req, res, next);
});

// Initialize Vercel API client
const getVercelClient = (): AxiosInstance => {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    throw new Error('VERCEL_TOKEN not configured');
  }
  
  return axios.create({
    baseURL: 'https://api.vercel.com',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });
};

// Health check endpoint
app.get('/health', async (req: Request, res: Response) => {
  try {
    const client = getVercelClient();
    const response = await client.get('/v2/user');
    
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      vercel: {
        connected: true,
        user: response.data.user.username
      }
    });
  } catch (error) {
    logger.error('Health check failed', { error });
    res.status(503).json({
      status: 'unhealthy',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      vercel: {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

// Trigger deployment
app.post('/api/deploy', async (req: Request, res: Response) => {
  try {
    const { name, gitSource, envVariables, buildCommand, framework } = req.body;
    
    if (!name) {
      return res.status(400).json({ error: 'Project name is required' });
    }
    
    if (!gitSource || !gitSource.repo) {
      return res.status(400).json({ error: 'Git source is required' });
    }
    
    const client = getVercelClient();
    
    logger.info('Triggering deployment', {
      name,
      repo: gitSource.repo,
      ref: gitSource.ref || 'main'
    });
    
    const deploymentData: any = {
      name,
      gitSource: {
        type: gitSource.type || 'github',
        repo: gitSource.repo,
        ref: gitSource.ref || 'main'
      },
      target: 'preview' // Always start with preview
    };
    
    if (framework) {
      deploymentData.framework = framework;
    }
    
    if (buildCommand) {
      deploymentData.buildCommand = buildCommand;
    }
    
    if (envVariables && Array.isArray(envVariables)) {
      deploymentData.env = envVariables.reduce((acc: any, env: any) => {
        acc[env.key] = env.value;
        return acc;
      }, {});
    }
    
    const response = await client.post('/v13/deployments', deploymentData);
    
    logger.info('Deployment triggered successfully', {
      deploymentId: response.data.id,
      url: response.data.url
    });
    
    res.json({
      success: true,
      deployment: {
        id: response.data.id,
        url: `https://${response.data.url}`,
        status: response.data.readyState,
        inspectorUrl: response.data.inspectorUrl
      }
    });
  } catch (error: any) {
    logger.error('Failed to trigger deployment', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to trigger deployment',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Get deployment status
app.get('/api/deploy/:id/status', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getVercelClient();
    
    const response = await client.get(`/v13/deployments/${id}`);
    const deployment = response.data;
    
    res.json({
      success: true,
      deployment: {
        id: deployment.id,
        url: `https://${deployment.url}`,
        status: deployment.readyState,
        state: deployment.state,
        ready: deployment.ready,
        createdAt: deployment.createdAt,
        buildingAt: deployment.buildingAt,
        readyAt: deployment.readyAt,
        creator: deployment.creator?.username,
        meta: {
          githubCommitRef: deployment.meta?.githubCommitRef,
          githubCommitMessage: deployment.meta?.githubCommitMessage,
          githubCommitAuthorName: deployment.meta?.githubCommitAuthorName
        }
      }
    });
  } catch (error: any) {
    logger.error('Failed to get deployment status', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to get deployment status',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Get deployment logs
app.get('/api/deploy/:id/logs', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getVercelClient();
    
    const response = await client.get(`/v2/deployments/${id}/events`);
    
    const logs = response.data.map((event: any) => ({
      timestamp: event.created,
      type: event.type,
      payload: event.payload
    }));
    
    res.json({
      success: true,
      logs
    });
  } catch (error: any) {
    logger.error('Failed to get deployment logs', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to get deployment logs',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Promote deployment to production
app.post('/api/deploy/:id/promote', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getVercelClient();
    
    logger.info('Promoting deployment to production', { deploymentId: id });
    
    // Get deployment details first
    const deployment = await client.get(`/v13/deployments/${id}`);
    const projectId = deployment.data.projectId;
    
    // Promote to production by setting as the production deployment
    await client.patch(`/v9/projects/${projectId}`, {
      framework: deployment.data.framework
    });
    
    logger.info('Deployment promoted successfully', { deploymentId: id });
    
    res.json({
      success: true,
      message: 'Deployment promoted to production',
      deploymentId: id
    });
  } catch (error: any) {
    logger.error('Failed to promote deployment', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to promote deployment',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Cancel deployment
app.delete('/api/deploy/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getVercelClient();
    
    logger.info('Cancelling deployment', { deploymentId: id });
    
    await client.patch(`/v12/deployments/${id}/cancel`);
    
    logger.info('Deployment cancelled successfully', { deploymentId: id });
    
    res.json({
      success: true,
      message: 'Deployment cancelled',
      deploymentId: id
    });
  } catch (error: any) {
    logger.error('Failed to cancel deployment', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to cancel deployment',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// List all projects
app.get('/api/projects', async (req: Request, res: Response) => {
  try {
    const client = getVercelClient();
    const response = await client.get('/v9/projects');
    
    const projects = response.data.projects.map((project: any) => ({
      id: project.id,
      name: project.name,
      framework: project.framework,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      link: project.link,
      latestDeployments: project.latestDeployments?.map((d: any) => ({
        id: d.id,
        url: `https://${d.url}`,
        ready: d.ready,
        createdAt: d.createdAt
      }))
    }));
    
    res.json({
      success: true,
      projects
    });
  } catch (error: any) {
    logger.error('Failed to list projects', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to list projects',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Manage environment variables
app.post('/api/env', async (req: Request, res: Response) => {
  try {
    const { projectId, env } = req.body;
    
    if (!projectId || !env) {
      return res.status(400).json({
        error: 'Project ID and environment variables are required'
      });
    }
    
    const client = getVercelClient();
    
    logger.info('Setting environment variables', {
      projectId,
      count: Object.keys(env).length
    });
    
    const promises = Object.entries(env).map(([key, value]) => 
      client.post(`/v9/projects/${projectId}/env`, {
        key,
        value,
        type: 'encrypted',
        target: ['production', 'preview']
      })
    );
    
    await Promise.all(promises);
    
    logger.info('Environment variables set successfully', { projectId });
    
    res.json({
      success: true,
      message: 'Environment variables set successfully'
    });
  } catch (error: any) {
    logger.error('Failed to set environment variables', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to set environment variables',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Configure domain
app.post('/api/projects/:id/domain', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { domain } = req.body;
    
    if (!domain) {
      return res.status(400).json({ error: 'Domain is required' });
    }
    
    const client = getVercelClient();
    
    logger.info('Adding domain to project', { projectId: id, domain });
    
    await client.post(`/v9/projects/${id}/domains`, { name: domain });
    
    logger.info('Domain added successfully', { projectId: id, domain });
    
    res.json({
      success: true,
      message: 'Domain added successfully',
      domain
    });
  } catch (error: any) {
    logger.error('Failed to add domain', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to add domain',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Parse build errors from logs
app.get('/api/deploy/:id/errors', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const client = getVercelClient();
    
    const response = await client.get(`/v2/deployments/${id}/events`);
    
    const errors = response.data
      .filter((event: any) => 
        event.type === 'stderr' || 
        (event.payload?.text && event.payload.text.toLowerCase().includes('error'))
      )
      .map((event: any) => ({
        timestamp: event.created,
        message: event.payload?.text || event.payload?.message || 'Unknown error'
      }));
    
    res.json({
      success: true,
      errors,
      hasErrors: errors.length > 0
    });
  } catch (error: any) {
    logger.error('Failed to parse build errors', {
      error: error.response?.data || error.message
    });
    res.status(500).json({
      error: 'Failed to parse build errors',
      details: error.response?.data?.error?.message || error.message
    });
  }
});

// Error handling middleware
app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: error.message,
    stack: error.stack,
    path: req.path
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Vercel MCP Server running on port ${PORT}`);
  logger.info('Endpoints: /health, /api/deploy/*, /api/projects, /api/env');
});

export default app;
