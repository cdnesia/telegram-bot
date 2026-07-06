const mysql = require('mysql2/promise');

// Konfigurasi dari .env
const pool = mysql.createPool({
    host:     process.env.DB_HOST || 'localhost',
    port:     parseInt(process.env.DB_PORT || '3306'),
    user:     process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bot_kampus',
    waitForConnections: true,
    connectionLimit: 10,
});

// Tes koneksi saat startup
async function initDB() {
    try {
        const conn = await pool.getConnection();
        console.log('🗄️  Terhubung ke MySQL:', process.env.DB_NAME || 'bot_kampus');
        conn.release();
    } catch (err) {
        console.error('❌ Gagal konek MySQL:', err.message);
        process.exit(1);
    }
}

module.exports = { pool, initDB };
