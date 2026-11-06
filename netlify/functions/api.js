import serverless from 'serverless-http';
import * as expressAppModule from '../../expressApp.js';

let app = expressAppModule.default ?? expressAppModule;
if (typeof app !== 'function' && app && typeof app.default === 'function') {
  app = app.default;
}

console.log('api.js app shape', {
  moduleKeys: Object.keys(expressAppModule),
  appType: typeof app,
  hasHandle: typeof app?.handle,
});

export const handler = serverless(app, { basePath: '/.netlify/functions' });
