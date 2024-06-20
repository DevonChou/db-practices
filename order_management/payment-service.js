const amqp = require('amqplib');
const { Pool } = require('pg');

const RABBITMQ_URL = 'amqp://localhost';
const paymentQueue = 'payment';
const shipmentQueue = 'shipment';
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

async function updateOrderStatus(orderId, status, dbConnection) {
  try {
    await dbConnection.query(
      'UPDATE orders SET status = $1 WHERE order_id = $2',
      [status, orderId]
    );
  } catch (err) {
    throw err;
  }
}

async function releaseLockedStock(productId, requiredStock, dbConnection) {
  try {
    await dbConnection.query(
      'SELECT locked_stock FROM inventory WHERE product_id = $1 FOR UPDATE',
      [productId]
    );

    await dbConnection.query(
      'UPDATE inventory SET locked_stock = locked_stock - $1 WHERE product_id = $2',
      [requiredStock, productId]
    );
  } catch (err) {
    throw err;
  }
}

async function deductTotalAndLockedStock(productId, requiredStock, dbConnection) {
  try {
    await dbConnection.query(
      'SELECT total_stock, locked_stock FROM inventory WHERE product_id = $1 FOR UPDATE',
      [productId]
    );

    await dbConnection.query(
      'UPDATE inventory SET total_stock = total_stock - $1, locked_stock = locked_stock - $1 WHERE product_id = $2',
      [requiredStock, productId]
    );
  } catch (err) {
    throw err;
  }
}

async function consumePaymentQueue() {
  const mqConnection = await amqp.connect(RABBITMQ_URL);
  const channel = await mqConnection.createChannel();
  await channel.assertQueue(paymentQueue, { durable: true });
  await channel.assertQueue(shipmentQueue, { durable: true });
  await channel.assertQueue(failureQueue, { durable: true });

  console.log('Payment service is up and running, waiting for order...');

  channel.consume(
    paymentQueue,
    async (msg) => {
      const order = JSON.parse(msg.content.toString());
      console.log('Received order:', order);

      let dbConnection;
      try {
        // Process the payment transaction.
        const isPaid = true;

        dbConnection = await pool.connect();
        await dbConnection.query('BEGIN');

        if (isPaid) {
          console.log('Payment was successful.');

          await updateOrderStatus(order.orderId, 'paid', dbConnection);
          await deductTotalAndLockedStock(order.productId, order.quantity, dbConnection);
          await dbConnection.query('COMMIT');
          console.log('The order status has been updated to \'Paid\'.');
          console.log(`Deducted ${order.quantity} items of product ${order.productId} from total and locked stock.`);

          channel.sendToQueue(shipmentQueue, Buffer.from(JSON.stringify(order)), {
            persistent: true,
          });
          console.log('Order sent to shipment queue.');
        } else {
          console.log('Payment has failed.');

          await releaseLockedStock(order.productId, order.quantity, dbConnection);
          await dbConnection.query('COMMIT');
          console.log(`Released ${order.quantity} items of product ${order.productId} from locked stock.`);

          order.failureReason = 'Payment failure';
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

consumePaymentQueue();
