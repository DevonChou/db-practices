const amqp = require('amqplib');
const { Pool } = require('pg');

const RABBITMQ_URL = 'amqp://localhost';
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

async function consumeFailureQueue() {
  const mqConnection = await amqp.connect(RABBITMQ_URL);
  const channel = await mqConnection.createChannel();
  await channel.assertQueue(failureQueue, { durable: true });

  console.log('Failure service is up and running, waiting for order...');

  channel.consume(
    failureQueue,
    async (msg) => {
      const order = JSON.parse(msg.content.toString());
      console.log('Received order:', order);

      try {
        console.log(`The order was cancelled due to ${order.failureReason}.`);

        await pool.query(
          'UPDATE orders SET status=$1 WHERE order_id=$2',
          ['cancelled', order.orderId]
        );
        console.log('The order status has been updated to \'Cancelled\'.');

        // do something like sending email to user
        console.log('An email has been sent to the user.');
        channel.ack(msg);
      } catch (err) {
        console.error('Something went wrong:', err);
        channel.nack(msg);
      }
    },
    { noAck: false }
  );
}

consumeFailureQueue();
