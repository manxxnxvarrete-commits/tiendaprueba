const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL;
const usarSsl = process.env.DB_SSL === 'true' || connectionString?.includes('sslmode=require');

const pool = new Pool(
    connectionString
        ? {
            connectionString,
            ...(usarSsl ? { ssl: { rejectUnauthorized: false } } : {})
        }
        : {
            host: process.env.DB_HOST || process.env.PGHOST || 'localhost',
            port: Number(process.env.DB_PORT || process.env.PGPORT) || 5432,
            database: process.env.DB_NAME || process.env.PGDATABASE || 'tienda_victor',
            user: process.env.DB_USER || process.env.PGUSER || 'postgres',
            password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
            ...(process.env.DB_SSL === 'true' ? { ssl: { rejectUnauthorized: false } } : {})
        }
);

module.exports = pool;
