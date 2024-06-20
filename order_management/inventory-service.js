const amqp = require('amqplib');
const { Pool } = require('pg');

const RABBITMQ_URL = 'amqp://localhost';
const inventoryQueue = 'inventory';
const paymentQueue = 'payment';
const failureQueue = 'failure';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
  max: 20,
  connectionTimeoutMillis: 0,
  idleTimeoutMillis: 0,
});

async function checkAndLockInventory(productId, requiredStock, dbConnection) {
  try {
    const result = await dbConnection.query(
      'SELECT total_stock, locked_stock FROM inventory WHERE product_id = $1 FOR UPDATE',
      [productId]
    );

    const { total_stock, locked_stock } = result.rows[0];
    const availableStock = total_stock - locked_stock;
    if (availableStock >= requiredStock) {
      await dbConnection.query(
        'UPDATE inventory SET locked_stock = locked_stock + $1 WHERE product_id = $2',
        [requiredStock, productId]
      );
      return true;
    } else {
      return false;
    }
  } catch (err) {
    throw err;
  }
}

async function consumeInventoryQueue() {
  const mqConnection = await amqp.connect(RABBITMQ_URL);
  const channel = await mqConnection.createChannel();
  await channel.assertQueue(inventoryQueue, { durable: true });
  await channel.assertQueue(paymentQueue, { durable: true });
  await channel.assertQueue(failureQueue, { durable: true });

  console.log('Inventory service is up and running, waiting for order...');

  channel.consume(
    inventoryQueue,
    async (msg) => {
      const order = JSON.parse(msg.content.toString());
      console.log('Received order:', order);
      console.log('Check inventory...');

      let dbConnection;
      try {
        dbConnection = await pool.connect();
        await dbConnection.query('BEGIN');

        const isInventoryLocked = await checkAndLockInventory(order.productId, order.quantity, dbConnection);
        await dbConnection.query('COMMIT');

        if (isInventoryLocked) {
          console.log('Sufficient inventory. Inventory locked.');
          channel.sendToQueue(paymentQueue, Buffer.from(JSON.stringify(order)), {
            persistent: true,
          });
          console.log('Order sent to payment queue.');
        } else {
          console.log('Failed due to lack of inventory.');
          order.failureReason = 'Insufficient inventory';
          channel.sendToQueue(failureQueue, Buffer.from(JSON.stringify(order)), {
            persistent: true,
          });
          console.log('Order sent to failure queue.');
        }

        channel.ack(msg);
      } catch (err) {
        console.error('Something went wrong:', err);
        await dbConnection.query('ROLLBACK');
        channel.nack(msg);
      } finally {
        dbConnection.release();
      }
    },
    { noAck: false }
  );
}

consumeInventoryQueue();
