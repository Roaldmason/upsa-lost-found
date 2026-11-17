'use strict';
/*
  SMS sender. app.js only calls  sms.send(phone, text)  and never knows which
  company delivers the message, so you can swap providers by editing this file.

  SMS_PROVIDER in .env picks the sender:
    console  (default) prints the message in the server terminal. Free, no
             account needed, perfect for building and testing.
    arkesel  sends a real text through https://arkesel.com (Ghana).
             Needs ARKESEL_API_KEY and ARKESEL_SENDER_ID in .env.

  `phone` always arrives in international form without a plus: 233241234567
*/

function consoleSender() {
  return {
    name: 'console',
    async send(phone, text) {
      console.log('[SMS to +' + phone + '] ' + text);
    }
  };
}

function arkeselSender(env) {
  const key = env.ARKESEL_API_KEY, sender = env.ARKESEL_SENDER_ID;
  if (!key || !sender) throw new Error('SMS_PROVIDER=arkesel needs ARKESEL_API_KEY and ARKESEL_SENDER_ID in .env.');
  return {
    name: 'arkesel',
    async send(phone, text) {
      const r = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
        method: 'POST',
        headers: { 'api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender: sender, message: text, recipients: [phone] }),
        signal: AbortSignal.timeout(10000)
      });
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        throw new Error('Arkesel refused the message (' + r.status + '): ' + detail.slice(0, 200));
      }
    }
  };
}

function createSender(env) {
  const which = String((env && env.SMS_PROVIDER) || 'console').toLowerCase();
  if (which === 'arkesel') return arkeselSender(env);
  if (which === 'console') return consoleSender();
  throw new Error('Unknown SMS_PROVIDER "' + which + '". Use console or arkesel.');
}

module.exports = { createSender };
