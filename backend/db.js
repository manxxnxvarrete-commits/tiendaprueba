const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'tienda_victor',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD
});

module.exports = pool;
