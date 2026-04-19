require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./config/db');

async function seed() {
  try {
    console.log('Running schema...');
    const schema = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
    await pool.query(schema);

    console.log('Running seed data...');
    const seedData = fs.readFileSync(path.join(__dirname, '..', 'seed.sql'), 'utf8');
    await pool.query(seedData);

    console.log('✅ Database seeded successfully.');
    console.log('Test user: testuser@example.com / Test@123');
  } catch (err) {
    console.error('Seed error:', err.message || err);
    if (err.code) console.error('DB error code:', err.code);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seed();
