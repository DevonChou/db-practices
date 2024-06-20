const amqp = require('amqplib');
const { Pool } = require('pg');

const RABBITMQ_URL = 'amqp://localhost';
const orderQueue = 'order';
const inventoryQueue = 'inventory';

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

async function consumeOrderQueue() {
  const mqConnection = await amqp.connect(RABBITMQ_URL);
  const channel = await mqConnection.createChannel();
  await channel.assertQueue(orderQueue, { durable: true });
  await channel.assertQueue(inventoryQueue, { durable: true });

  console.log('Order service is up and running, waiting for order...');

  channel.consume(
    orderQueue,
    async (msg) => {
      const order = JSON.parse(msg.content.toString());
      console.log('Received order:', order);

      try {
        const result = await pool.query(
          'INSERT INTO orders (user_id, product_id, quantity, shipping_address, status) VALUES ($1, $2, $3, $4, $5) RETURNING order_id',
          [order.userId, order.productId, order.quantity, order.shippingAddress, 'received']
        );
        console.log('Order stored in database.');

        const orderId = result.rows[0].order_id;
        order.orderId = orderId;
        channel.sendToQueue(inventoryQueue, Buffer.from(JSON.stringify(order)), {
          persistent: true,
        });
        console.log('Order sent to inventory queue.');
        channel.ack(msg);
      } catch (err) {
        console.error('Error storing order in database:', err);
        channel.nack(msg);
      }
    },
    { noAck: false }
  );
}

consumeOrderQueue();
