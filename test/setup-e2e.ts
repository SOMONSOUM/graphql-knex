import { config } from 'dotenv';

// .env.test wins over .env; real environment variables (CI) win over both.
config({ path: '.env.test' });
process.env.NODE_ENV = 'test';
