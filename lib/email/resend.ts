import { Resend } from 'resend';

let _resend: Resend | null = null;
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

export async function sendEmail(to: string, subject: string, html: string, text: string) {
  console.log(`[email] Sending to=${to} subject="${subject}"`);
  const result = await getResend().emails.send({
    from: 'Divyanshu from Supermission <divyanshu@updates.supermission.fun>',
    to,
    subject,
    html,
    text,
    headers: {
      'List-Unsubscribe': '<mailto:divyanshu@supermission.fun?subject=Unsubscribe>',
    },
  });
  console.log(`[email] Result:`, JSON.stringify(result));
  return result;
}
