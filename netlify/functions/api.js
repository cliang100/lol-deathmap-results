import serverless from 'serverless-http';
import app from '../../expressApp.js';

export const handler = serverless(app, { basePath: '/.netlify/functions' });
