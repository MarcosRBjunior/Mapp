import { createRuntime } from '../src/bootstrap.js';
import { loadEnv } from '../src/config/env.js';

// Vercel function (api/ is Vercel's folder for functions; vercel.json sends every path here).
// Built once per instance; an invalid environment fails the instance at load, like the server.
const { app } = createRuntime(loadEnv());

export default app;
