/*
  WebCraft Email Server
  Deploy this ONCE on Railway. All your clients use it.
  Clients only need to fill in their own email address.
  You fill in your Resend API key once as an environment variable.
*/

import express from 'express';
import cors    from 'cors';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const app    = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.send('WebCraft Email Server running ✅'));

app.post('/contact', async (req, res) => {
  const { to, senderEmail, message } = req.body;

  if (!to || !senderEmail || !message) {
    return res.status(400).json({ ok: false, error: 'Missing fields' });
  }

  /* Basic email validation */
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to) || !emailRegex.test(senderEmail)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address' });
  }

  try {
    const { error } = await resend.emails.send({
      from:     'WebCraft Contact <onboarding@resend.dev>',
      to:       [to],
      reply_to: senderEmail,
      subject:  'Nieuw bericht via contactformulier',
      html:     `<p><strong>Van:</strong> ${senderEmail}</p>
                 <p><strong>Bericht:</strong></p>
                 <p>${message.replace(/\n/g, '<br/>')}</p>`,
      text:     `Van: ${senderEmail}\n\n${message}`,
    });

    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('Mail error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`✅ WebCraft email server on port ${PORT}`));