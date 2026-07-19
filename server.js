import { createApp } from './server/app.js';

const app = createApp();
await app.start();

process.on('SIGINT', app.shutdown);
process.on('SIGTERM', app.shutdown);
