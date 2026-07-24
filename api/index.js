// Vercel serverless entry point. server/app.js exports the configured Express app
// (no app.listen()) - Vercel's Node runtime handles the request/response cycle directly.
import app from '../server/app.js';

export default app;
