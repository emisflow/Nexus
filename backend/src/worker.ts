import 'dotenv/config';
import { startWorkers } from './jobs/queues.js';

startWorkers();
