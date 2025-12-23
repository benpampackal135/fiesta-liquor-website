require('dotenv').config();
const twilio = require('twilio');
const client = new twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

client.messages
  .create({
    from: process.env.TWILIO_FROM,
    to: process.env.OWNER_PHONE,
    body: 'Test message from Twilio!'
  })
  .then(msg => console.log('Message sent:', msg.sid))
  .catch(err => console.error('Error:', err.message));
