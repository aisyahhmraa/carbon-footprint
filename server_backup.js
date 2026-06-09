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
const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'green campus'
});

db.connect((err) => {
    if (err) {
        console.error('Database connection failed:', err);
    } else {
        console.log('✅ Connected to MySQL');
    }
});

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

// ======================
// LOGIN PROCESS
// ======================
app.post('/login', (req, res) => {

    const { username, password } = req.body;

    const sql = "SELECT * FROM users WHERE username = ?";

    db.query(sql, [username], async (err, result) => {

        if (err) return res.send("Server error");

        if (result.length === 0) {
            return res.send("<script>alert('Username tidak ditemukan'); window.location='/login';</script>");
        }

        const user = result[0];

        const match = await bcrypt.compare(password, user.password);

        if (match) {
            req.session.user = {
                 id: user.id,
                role: user.role
            };
            return res.redirect('/input');
        } else {
            return res.send("<script>alert('Password salah'); window.location='/login';</script>");
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

    res.sendFile(path.join(__dirname, 'public', 'input.html'));
});

// ======================
// SAVE CARBON DATA
// ======================
app.post('/save-carbon', (req, res) => {

    if (!req.session.user.id) {
        return res.status(401).send("Unauthorized");
    }

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
        INSERT INTO carbon_data 
        (user_id, electricity, bus_count, bus_trip, bus_distance,
        car_count, car_distance,
        motor_count, motor_distance,
        electricity_emission, bus_emission, car_emission, motor_emission, total_emission)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(sql, [
        req.session.user.id,
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
    ], (err, result) => {

        if (err) {
            console.error(err);
            return res.send("Database error");
        }

        res.send("Data berhasil disimpan!");
    });

});

// ======================
// GET HISTORY DATA
// ======================
app.get('/history', (req, res) => {

    if (!req.session.user) {
        return res.status(401).send("Unauthorized");
    }

    const sql = `
        SELECT * FROM carbon_data 
        WHERE user_id = ?
        ORDER BY created_at DESC
    `;

    db.query(sql, [req.session.user.id], (err, result) => {

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
        electricityEmission,
        busEmission,
        carEmission,
        motorEmission,
        totalEmission
    } = req.body;

    const sql = `
        UPDATE carbon_data
        SET 
            electricity_emission = ?,
            bus_emission = ?,
            car_emission = ?,
            motor_emission = ?,
            total_emission = ?
        WHERE id = ?
    `;

    db.query(sql, [
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