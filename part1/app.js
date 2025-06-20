const express = require('express');
const mysql = require('mysql2/promise'); // Use mysql2 that supports async/await
const app = express();
var cookieParser = require('cookie-parser');
var logger = require('morgan');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({extended: false}));
app.use(cookieParser());

const PORT = 3000;

// Create a connection pool to the database
const pool = mysql.createPool({
    host: 'localhost',
    user: 'root',     //  DB username
    password: '123456',     // DB password
});

// Insert test data on startup
async function initializeDatabase() {
    const connection = await pool.getConnection();

    try {
        console.log("Dropping and recreating tables...");
        await connection.query("DROP DATABASE IF EXISTS DogWalkService");
        await connection.query("CREATE DATABASE DogWalkService");
        await connection.query("USE DogWalkService");

        // Recreate table structure
        await connection.query(`
            CREATE TABLE Users
            (
                user_id       INT AUTO_INCREMENT PRIMARY KEY,
                username      VARCHAR(50) UNIQUE  NOT NULL,
                email         VARCHAR(100) UNIQUE NOT NULL,
                password_hash VARCHAR(255)        NOT NULL,
                role          ENUM('owner',
                'walker'
            ) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
        `);
        await connection.query(`
            CREATE TABLE Dogs
            (
                dog_id   INT AUTO_INCREMENT PRIMARY KEY,
                owner_id INT         NOT NULL,
                name     VARCHAR(50) NOT NULL,
                size     ENUM('small',
                'medium',
                'large'
            ) NOT NULL,
        FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      )
        `);
        await connection.query(`
            CREATE TABLE WalkRequests
            (
                request_id       INT AUTO_INCREMENT PRIMARY KEY,
                dog_id           INT          NOT NULL,
                requested_time   DATETIME     NOT NULL,
                duration_minutes INT          NOT NULL,
                location         VARCHAR(255) NOT NULL,
                status           ENUM('open',
                'accepted',
                'completed',
                'cancelled'
            ) DEFAULT 'open',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      )
        `);
        // Add new table: WalkRatings
        await connection.query(` CREATE TABLE WalkRatings
                                 (
                                     rating_id  INT AUTO_INCREMENT PRIMARY KEY,
                                     request_id INT NOT NULL,
                                     walker_id  INT NOT NULL,
                                     owner_id   INT NOT NULL,
                                     rating     INT CHECK (rating BETWEEN 1 AND 5),
                                     comments   TEXT,
                                     rated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                                     FOREIGN KEY (request_id) REFERENCES WalkRequests (request_id),
                                     FOREIGN KEY (walker_id) REFERENCES Users (user_id),
                                     FOREIGN KEY (owner_id) REFERENCES Users (user_id),
                                     CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
                                 )
        `);

        // Insert test users
        await connection.query(`
            INSERT INTO Users (username, email, password_hash, role)
            VALUES ('alice123', 'alice@example.com', 'hashed123', 'owner'),
                   ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
                   ('carol123', 'carol@example.com', 'hashed789', 'owner'),
                   ('david456', 'david@example.com', 'hashed101', 'owner'),
                   ('eve789', 'eve@example.com', 'hashed202', 'walker'),
                   ('tom123', 'tom@example.com', 'hashed303', 'owner')
        `);

        // Insert test dogs
        await connection.query(`INSERT INTO Dogs (owner_id, name, size)
                                VALUES ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
                                       ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
                                       ((SELECT user_id FROM Users WHERE username = 'david456'), 'Rocky', 'large'),
                                       ((SELECT user_id FROM Users WHERE username = 'eve789'), 'Luna', 'small'),
                                       ((SELECT user_id FROM Users WHERE username = 'bobwalker'), 'Charlie',
                                        'medium'),
                                       ((SELECT user_id FROM Users WHERE username = 'tom123'), 'Canny',
                                        'large')`);

        // Insert walk requests
        await connection.query(`INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
                                VALUES ((SELECT dog_id FROM Dogs WHERE name = 'Max'),
                                        '2025-06-10 08:00:00',
                                        30,
                                        'Parklands',
                                        'open'),
                                       ((SELECT dog_id FROM Dogs WHERE name = 'Bella'),
                                        '2025-06-10 09:30:00',
                                        45,
                                        'Beachside Ave',
                                        'accepted'),
                                       ((SELECT dog_id FROM Dogs WHERE name = 'Rocky'),
                                        '2025-06-11 10:00:00',
                                        60,
                                        'Forest Trail',
                                        'open'),
                                       ((SELECT dog_id FROM Dogs WHERE name = 'Luna'),
                                        '2025-06-12 15:00:00',
                                        30,
                                        'Backyard',
                                        'completed'),
                                       ((SELECT dog_id FROM Dogs WHERE name = 'Charlie'),
                                        '2025-06-13 11:00:00',
                                        45,
                                        'City Park',
                                        'cancelled'),
                                       ((SELECT dog_id FROM Dogs WHERE name = 'Canny'),
                                        '2025-06-14 11:00:00',
                                        60,
                                        'City Park',
                                        'completed')
        `);
        // Insert ratings
        await connection.query(`INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
                                VALUES ((SELECT request_id
                                         FROM WalkRequests
                                         WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Canny')
                                         LIMIT 1),
                                        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                                        (SELECT user_id FROM Users WHERE username = 'tom123'),
                                        5,
                                        'Great job!'),
                                       ((SELECT request_id
                                         FROM WalkRequests
                                         WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name = 'Luna')
                                         LIMIT 1),
                                        (SELECT user_id FROM Users WHERE username = 'bobwalker'),
                                        (SELECT user_id FROM Users WHERE username = 'eve789'),
                                        4,
                                        'Good service.')`);
        console.log("Test data inserted successfully.");
    } catch (err) {
        console.error("Error initializing database:", err.message);
    } finally {
        connection.release();
    }
}


// GET /api/dogs
app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await pool.query(`      SELECT d.name     as dog_name,
                                                      d.size,
                                                      u.username AS owner_name
                                               FROM Dogs d
                                                        JOIN Users u ON d.owner_id = u.user_id
        `);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

// GET /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT wr.request_id       AS "request_id",
                   d.name              AS "dog_name",
                   wr.requested_time   AS "requested_time",
                   wr.duration_minutes AS "duration_minutes",
                   wr.location,
                   u.username          AS "owner_username"
            FROM WalkRequests wr
                     JOIN Dogs d ON wr.dog_id = d.dog_id
                     JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});

// GET /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [rows] = await pool.query(`
            SELECT u.username              AS "walker_username",
                   COUNT(r.rating_id)      AS "total_ratings",
                   ROUND(AVG(r.rating), 1) AS "average_rating",
                   COUNT(wr.request_id)    AS "completed_walks"
            FROM Users u
                     LEFT JOIN WalkRatings r ON u.user_id = r.walker_id
                     LEFT JOIN WalkRequests wr
                               ON wr.request_id = r.request_id AND wr.status = 'completed'
            WHERE u.role = 'walker'
            GROUP BY u.user_id, u.username
        `);
        return res.json(rows);
    } catch (err) {
        return res.status(500).json({error: err.message});
    }
});


// Start Server
async function startServer() {
    try {
        // Initialize database and insert test data
        await initializeDatabase();
        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error("Failed to start server:", err.message);
    }
}

startServer().then(r => {
});
