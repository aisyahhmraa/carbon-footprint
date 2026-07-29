const express = require('express');
const path = require('path');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;

// ======================
// DATABASE CONNECTION
// ======================
const db = mysql.createPool({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: Number(process.env.MYSQLPORT),

    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

(async () => {
    try {
        const connection = await db.promise().getConnection();

        console.log('✅ Connected to MySQL');

        await connection.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                username VARCHAR(255) UNIQUE,
                password TEXT NOT NULL,
                role ENUM('admin','user') DEFAULT 'user'
            )
        `);

        const adminPassword = await bcrypt.hash('ais123', 10);

        await connection.query(
            `INSERT IGNORE INTO users(username,password,role)
            VALUES (?,?,?)`,
            ['admin', adminPassword, 'admin']
        );

        await connection.query(`
            CREATE TABLE IF NOT EXISTS carbon_data (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT,
                university_name VARCHAR(255),
                month VARCHAR(20),
                year INT,
                electricity FLOAT,
                bus_count INT,
                bus_trip FLOAT,
                bus_distance FLOAT,
                car_count INT,
                car_distance FLOAT,
                motor_count INT,
                motor_distance FLOAT,
                electricity_emission FLOAT,
                bus_emission FLOAT,
                car_emission FLOAT,
                motor_emission FLOAT,
                total_emission FLOAT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        await connection.query(`
            CREATE TABLE IF NOT EXISTS electricity_details (
                id INT AUTO_INCREMENT PRIMARY KEY,
                carbon_id INT,
                building_name VARCHAR(255),
                electricity FLOAT
            )
        `);

        connection.release();

    } catch (err) {
        console.error('Database connection failed:', err);
    }
})();

// ======================
// MIDDLEWARE
// ======================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'green-campus-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// ======================
// ROUTES
// ======================

// Landing Page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Halaman User
app.get('/history-page', (req, res) => {

    if (!req.session.user) {
        return res.send("Please login first.");
    }

    res.sendFile(path.join(__dirname, 'public', 'user-dashboard.html'));
});

// ======================
// REGISTER PAGE
// ======================
app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

// ======================
// REGISTER PROCESS
// ======================
app.post('/register', async (req, res) => {

    const { username, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const sql = "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')";

    db.query(sql, [username, hashedPassword], (err) => {

        if (err) {
            console.error(err);
            if (err.code === 'ER_DUP_ENTRY') {
                return res.send("<script>alert('Username sudah digunakan!'); window.location='/register';</script>");
            }

            return res.send("Terjadi kesalahan server");
        }

        res.send("<script>alert('Register berhasil!'); window.location='/login';</script>");
    });
});

// ======================
// LOGIN PROCESS
// ======================
app.post('/login', (req, res) => {

    const { username, password } = req.body;

    const sql = "SELECT * FROM users WHERE username = ?";

    db.query(sql, [username], async (err, result) => {

        if (err) {
            console.error("LOGIN DB ERROR:", err);
            return res.status(500).send("Server error");
        }

        if (result.length === 0) {
            return res.send("<script>alert('Username tidak ditemukan. Silakan lakukan registrasi terlebih dahulu'); window.location='/login';</script>");
        }

        try {

            const user = result[0];

            console.log("User ditemukan:", user.username);
            console.log("Role:", user.role);

            const match = await bcrypt.compare(password, user.password);

            console.log("Password cocok:", match);

            if (match) {

                req.session.user = {
                    id: user.id,
                    role: user.role
                };

                if (user.role === 'admin') {
                    return res.redirect('/input');
                } else {
                    return res.redirect('/history-page');
                }

            } else {
                return res.send("<script>alert('Password salah'); window.location='/login';</script>");
            }

        } catch (e) {
            console.error("LOGIN ERROR:", e);
            return res.status(500).send("Server error");
        }

    });

});

// ======================
// PROTECTED INPUT PAGE
// ======================
app.get('/input', (req, res) => {

    if (!req.session.user) {
        return res.send("Please login first.");
    }

    // 🔥 BATASI ROLE
    if (req.session.user.role !== 'admin') {
        return res.send("Akses ditolak. Hanya admin.");
    }

    res.sendFile(path.join(__dirname, 'public', 'input.html'));
});

// ======================
// SAVE CARBON DATA
// ======================
app.post('/save-carbon', (req, res) => {

    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    if (req.session.user.role !== 'admin') {
        return res.status(403).send("Hanya admin yang bisa input data");
    }

    const {
        universityName,
        month,
        electricity,
        electricityDetails,
        workingDays,

        busGate1,
        busGate2,
        busGate3,
        busPalasari,
        busCount,
        busTrip,
        busDistance,

        carGate1,
        carGate2,
        carGate3,
        carPalasari,
        carCount,
        carDistance,

        motorGate1,
        motorGate4,
        motorPalasari,
        motorCount,
        motorDistance,

        electricityEmission,
        busEmission,
        carEmission,
        motorEmission,
        totalEmission
    } = req.body;

    const year = new Date().getFullYear();

    const sql = `
        INSERT INTO carbon_data
        (
            user_id,
            university_name,
            month,
            year,
            electricity,
            working_days,
            bus_gate1,
            bus_gate2,
            bus_gate3,
            bus_palasari,
            bus_count,
            bus_trip,
            bus_distance,
            car_gate1,
            car_gate2,
            car_gate3,
            car_palasari,
            car_count,
            car_distance,
            motor_gate1,
            motor_gate4,
            motor_palasari,
            motor_count,
            motor_distance,
            electricity_emission,
            bus_emission,
            car_emission,
            motor_emission,
            total_emission
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        req.session.user.id,
        universityName,
        month,
        year,
        electricity,
        workingDays,

        busGate1,
        busGate2,
        busGate3,
        busPalasari,
        busCount,
        busTrip,
        busDistance,

        carGate1,
        carGate2,
        carGate3,
        carPalasari,
        carCount,
        carDistance,

        motorGate1,
        motorGate4,
        motorPalasari,
        motorCount,
        motorDistance,

        electricityEmission,
        busEmission,
        carEmission,
        motorEmission,
        totalEmission

    ], (err, result) => {

        if (err) {
            console.error(err);
            return res.status(500).send("Database error");
        }

        const carbonId = result.insertId;

        // Kalau tidak ada detail gedung
        if (!electricityDetails || electricityDetails.length === 0) {
            return res.send("Data berhasil disimpan!");
        }

        const detailValues = electricityDetails.map(item => [
            carbonId,
            item.building_name,
            item.electricity
        ]);

        db.query(
            `INSERT INTO electricity_details (carbon_id, building_name, electricity)
             VALUES ?`,
            [detailValues],
            (detailErr) => {

                if (detailErr) {
                    console.error(detailErr);
                    return res.status(500).send("Gagal menyimpan detail listrik");
                }

                res.send("Data berhasil disimpan!");

            }
        );

    });

});

// ======================
// GET HISTORY DATA
// ======================
app.get('/history', (req, res) => {
    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }
    const userId = req.session.user.id;
    const { type, value } = req.query;
    let sql = `SELECT * FROM carbon_data WHERE 1=1`;
    let params = [];
    if(type === "monthly"){ sql += " AND month = ?"; params.push(value); }
    db.query(sql, params, (err, result) => {
        if (err) {
            console.error(err);
            return res.send("Database error");
        }
        res.json(result);
    });

});

// ======================
// DELETE CARBON DATA
// ======================
app.delete('/delete-carbon/:id', (req, res) => {

    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    // kalau mau khusus admin (opsional, tapi bagus buat TA)
    if (req.session.user.role !== 'admin') {
        return res.status(403).send("Hanya admin yang bisa hapus data");
    }

    const { id } = req.params;

    const sql = "DELETE FROM carbon_data WHERE id = ?";

    db.query(sql, [id], (err) => {

        if (err) {
            console.error(err);
            return res.send("Database error");
        }

        res.send("Data berhasil dihapus!");
    });

});

// ======================
// UPDATE CARBON DATA
// ======================
app.put('/update-carbon/:id', (req, res) => {

    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    if (req.session.user.role !== 'admin') {
        return res.status(403).send("Hanya admin yang bisa edit data");
    }

    const { id } = req.params;

    const {

        electricity,
        busCount,
        busTrip,
        busDistance,

        carCount,
        carDistance,

        motorCount,
        motorDistance,

        electricityEmission,
        busEmission,
        carEmission,
        motorEmission,
        totalEmission

    } = req.body;

    const sql = `
        UPDATE carbon_data
        SET

            electricity = ?,
            bus_count = ?,
            bus_trip = ?,
            bus_distance = ?,

            car_count = ?,
            car_distance = ?,

            motor_count = ?,
            motor_distance = ?,

            electricity_emission = ?,
            bus_emission = ?,
            car_emission = ?,
            motor_emission = ?,
            total_emission = ?

        WHERE id = ?
    `;

    db.query(sql, [

        electricity,
        busCount,
        busTrip,
        busDistance,

        carCount,
        carDistance,

        motorCount,
        motorDistance,

        electricityEmission,
        busEmission,
        carEmission,
        motorEmission,
        totalEmission,

        id

    ], (err) => {

        if (err) {
            console.error(err);
            return res.send("Database error");
        }

        res.send("Data berhasil diupdate!");

    });

});

// ======================
// STATIC
// ======================
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});