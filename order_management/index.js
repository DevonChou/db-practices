const express = require('express');
const amqp = require('amqplib');

const app = express();

const RABBITMQ_URL = 'amqp://localhost';
const orderQueue = 'order';

let connection;
let channel;

async function connectToRabbitMQ() {
  try {
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(orderQueue, { durable: true });
    console.log('Successfully connected to RabbitMQ');
  } catch (err) {
    console.error('Unable to establish a connection to RabbitMQ:', err);
  }
}

app.use(express.json());

app.post('/order', async (req, res) => {
  const order = req.body;

  try {
    channel.sendToQueue(orderQueue, Buffer.from(JSON.stringify(order)), {
      persistent: true,
    });

    console.log('Order sent to order queue:', order);
    res.send('Order received');
  } catch (err) {
    console.error('Error sending order to queue:', err);
    res.sendStatus(500);
  }
});

app.listen(3000, async () => {
  console.log('Listening on port 3000...');
  await connectToRabbitMQ();
});
