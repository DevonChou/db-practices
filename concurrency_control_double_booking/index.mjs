import express from 'express';
import pg from 'pg';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const pool = new pg.Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
  max: 20,
  connectionTimeoutMillis: 0,
  idleTimeoutMillis: 0,
});

const app = express();

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/index.html`);
});

// get all seats
app.get('/seats', async (req, res) => {
  const result = await pool.query('select * from seats');
  res.send(result.rows);
});

// book a seat give the seatId and your name
app.put('/:seatId/:name', async (req, res) => {
  const { seatId, name } = req.params;
  let connection;

  try {
    connection = await pool.connect();

    // begin transaction
    await connection.query('BEGIN TRANSACTION');

    // getting the row to make sure it is not booked
    const sql =
      'SELECT * FROM seats WHERE seat_id = $1 AND is_booked = false FOR UPDATE';
    const result = await connection.query(sql, [seatId]);
    // if no rows found then the operation should fail can't book
    if (result.rowCount === 0) {
      res.status(400).send({ error: 'Seat already booked' });
      return;
    }

    // if we get the row, we are safe to update
    const sqlU =
      'UPDATE seats SET is_booked = true, name = $2 WHERE seat_id = $1';
    const updateResult = await connection.query(sqlU, [seatId, name]);

    // end transaction
    await connection.query('COMMIT');
    res.send(updateResult);
  } catch (ex) {
    await connection.query('ROLLBACK');
    console.error(`something went wrong ${JSON.stringify(ex)}`);
    res.sendStatus(500);
  } finally {
    connection.release();
  }
});

app.listen(3000, () => console.log('Listening on port 3000...'));
