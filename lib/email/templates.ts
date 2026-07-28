const baseStyle = ``;

const socialLinks = `
  <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
    <tr>
      <td style="padding:0 14px;">
        <a href="https://supermission.fun" style="color:#4a4540;font-size:11px;font-weight:500;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Website</a>
      </td>
      <td style="color:#2a2520;font-size:8px;">&#9670;</td>
      <td style="padding:0 14px;">
        <a href="https://x.com/missiondotfun" style="color:#4a4540;font-size:11px;font-weight:500;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Twitter</a>
      </td>
      <td style="color:#2a2520;font-size:8px;">&#9670;</td>
      <td style="padding:0 14px;">
        <a href="https://t.me/supermissiondotfun" style="color:#4a4540;font-size:11px;font-weight:500;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Telegram</a>
      </td>
      <td style="color:#2a2520;font-size:8px;">&#9670;</td>
      <td style="padding:0 14px;">
        <a href="https://www.linkedin.com/company/supermission" style="color:#4a4540;font-size:11px;font-weight:500;text-decoration:none;letter-spacing:1.2px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,sans-serif;">LinkedIn</a>
      </td>
    </tr>
  </table>
`;

function layout(content: string) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <title>Supermission</title>
  ${baseStyle}
</head>
<body style="margin:0;padding:0;background-color:#080808;font-family:'Bricolage Grotesque',system-ui,-apple-system,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#080808;padding:48px 20px;">
    <tr>
      <td align="center">
        <!-- Outer glow wrapper -->
        <table width="560" cellpadding="0" cellspacing="0" style="overflow:hidden;">
          <!-- Main card -->
          <tr>
            <td>
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0e0e0e;border-radius:20px;border:1px solid #1a1816;overflow:hidden;">
                <!-- Top gradient accent — luminous gold thread -->
                <tr>
                  <td style="height:2px;background:linear-gradient(90deg, #0e0e0e 0%, #3d3225 25%, #c9b99a 50%, #3d3225 75%, #0e0e0e 100%);font-size:0;line-height:0;">&nbsp;</td>
                </tr>
                <!-- Logo with radial glow -->
                <tr>
                  <td align="center" style="padding:52px 48px 0;background:radial-gradient(ellipse at center top, rgba(201,185,154,0.08) 0%, transparent 70%);">
                    <img src="https://supermission.fun/new-white.png" alt="Supermission" width="140" height="140" style="display:block;width:140px;height:140px;border:0;outline:none;text-decoration:none;" />
                  </td>
                </tr>
                <!-- Decorative divider -->
                <tr>
                  <td align="center" style="padding:32px 80px 0;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="height:1px;background:linear-gradient(90deg, transparent 0%, #2a2520 50%, transparent 100%);font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Content area -->
                <tr>
                  <td style="padding:36px 52px 48px;">
                    ${content}
                  </td>
                </tr>
                <!-- Bottom divider -->
                <tr>
                  <td align="center" style="padding:0 52px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="height:1px;background:linear-gradient(90deg, transparent 0%, #1a1816 50%, transparent 100%);font-size:0;line-height:0;">&nbsp;</td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <!-- Social links -->
                <tr>
                  <td align="center" style="padding:28px 48px 32px;">
                    ${socialLinks}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table width="560" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" style="padding:28px 48px 0;">
              <p style="margin:0;font-size:10px;color:#2a2520;letter-spacing:1px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,sans-serif;">
                &copy; 2026 Supermission &mdash; All rights reserved
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function waitlistConfirmationEmailText(position: number) {
  return `You're on the Supermission waitlist!

Your position: #${position}

You're one step closer to the agentic future. We onboard in waves and will send you an invite access code when it's your turn.

While you wait, watch the Supermission walkthrough:
https://www.youtube.com/watch?v=q7QCb79GBWA

---
Supermission — https://supermission.fun
Twitter: https://x.com/missiondotfun
Telegram: https://t.me/supermissiondotfun

To unsubscribe, email divyanshu@supermission.fun with subject: Unsubscribe
© 2026 Supermission`;
}

export function waitlistConfirmationEmail(position: number) {
  return layout(`
    <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#c9b99a;text-transform:uppercase;letter-spacing:3px;font-family:'Bricolage Grotesque',system-ui,sans-serif;">
      Waitlist Confirmed
    </p>
    <h1 style="margin:0 0 32px;font-size:32px;font-weight:400;color:#f5f0e8;line-height:1.15;font-family:'Instrument Serif',Georgia,serif;font-style:italic;">
      You're on the list.
    </h1>
    <!-- Position card -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
      <tr>
        <td style="padding:28px 28px;background:linear-gradient(135deg, #141210 0%, #0a0908 100%);border-radius:14px;border:1px solid #1a1816;">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td valign="top">
                <p style="margin:0 0 6px;font-size:10px;color:#6b6050;text-transform:uppercase;letter-spacing:2px;font-weight:600;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Position</p>
                <p style="margin:0;font-size:48px;font-weight:700;color:#f5f0e8;letter-spacing:-2px;line-height:1;font-family:'Bricolage Grotesque',system-ui,sans-serif;">#${position}</p>
              </td>
              <td align="right" valign="bottom">
                <table cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="padding:6px 14px;border:1px solid #2a2520;border-radius:20px;">
                      <p style="margin:0;font-size:10px;color:#6b6050;text-transform:uppercase;letter-spacing:1px;font-weight:500;font-family:'Bricolage Grotesque',system-ui,sans-serif;">In queue</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.8;color:#7a7060;">
      You're one step closer to the agentic future. We onboard in waves and will send you an <strong style="color:#c9b99a;">invite access code</strong> when it's your turn.
    </p>
    <p style="margin:0 0 28px;font-size:13px;line-height:1.6;color:#4a4540;font-style:italic;font-family:'Instrument Serif',Georgia,serif;">
      Sit tight &mdash; your code is on the way.
    </p>
    <!-- Walkthrough video -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        <td>
          <p style="margin:0 0 12px;font-size:10px;font-weight:600;color:#6b6050;text-transform:uppercase;letter-spacing:2px;font-family:'Bricolage Grotesque',system-ui,sans-serif;">While you wait</p>
          <a href="https://www.youtube.com/watch?v=q7QCb79GBWA" style="display:block;text-decoration:none;border-radius:12px;overflow:hidden;border:1px solid #1a1816;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg, #141210 0%, #0a0908 100%);border-radius:12px;padding:24px;text-align:center;">
                  <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                    <tr>
                      <td style="width:48px;height:48px;background:rgba(201,185,154,0.12);border:1px solid #2a2520;border-radius:50%;text-align:center;vertical-align:middle;">
                        <span style="font-size:18px;color:#c9b99a;line-height:48px;">&#9654;</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;font-weight:600;color:#f5f0e8;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Watch the Supermission Walkthrough</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#4a4540;font-family:'Bricolage Grotesque',system-ui,sans-serif;">See what's coming &rarr; youtube.com</p>
                </td>
              </tr>
            </table>
          </a>
        </td>
      </tr>
    </table>
  `);
}

export function approvalWelcomeEmailText() {
  return `Welcome to Supermission — Access Granted

You've been approved. The agentic future awaits — step inside and see what's possible.

Get started: https://supermission.fun/waitlist

Watch the walkthrough to get started faster:
https://www.youtube.com/watch?v=q7QCb79GBWA

---
Supermission — https://supermission.fun
Twitter: https://x.com/missiondotfun
Telegram: https://t.me/supermissiondotfun

To unsubscribe, email divyanshu@supermission.fun with subject: Unsubscribe
© 2026 Supermission`;
}

export function approvalWelcomeEmail() {
  return layout(`
    <p style="margin:0 0 10px;font-size:11px;font-weight:600;color:#c9b99a;text-transform:uppercase;letter-spacing:3px;font-family:'Bricolage Grotesque',system-ui,sans-serif;">
      Access Granted
    </p>
    <h1 style="margin:0 0 16px;font-size:34px;font-weight:400;color:#f5f0e8;line-height:1.15;font-family:'Instrument Serif',Georgia,serif;">
      Welcome to<br/>Supermission
    </h1>
    <p style="margin:0 0 36px;font-size:15px;line-height:1.8;color:#7a7060;">
      You've been approved. The agentic future awaits &mdash; step inside and see what's possible.
    </p>
    <!-- CTA Button -->
    <table cellpadding="0" cellspacing="0">
      <tr>
        <td align="center" style="border-radius:12px;background:linear-gradient(135deg, #c9b99a 0%, #a89878 100%);">
          <a href="https://supermission.fun/waitlist" style="display:inline-block;padding:16px 44px;color:#0a0908;font-size:13px;font-weight:700;text-decoration:none;letter-spacing:0.8px;text-transform:uppercase;font-family:'Bricolage Grotesque',system-ui,-apple-system,sans-serif;">
            Get Started &nbsp;&rarr;
          </a>
        </td>
      </tr>
    </table>
    <p style="margin:24px 0 28px;font-size:12px;line-height:1.6;color:#3a3530;font-style:italic;font-family:'Instrument Serif',Georgia,serif;">
      Your journey into autonomous intelligence begins now.
    </p>
    <!-- Walkthrough video -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 8px;">
      <tr>
        <td>
          <p style="margin:0 0 12px;font-size:10px;font-weight:600;color:#6b6050;text-transform:uppercase;letter-spacing:2px;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Get started faster</p>
          <a href="https://www.youtube.com/watch?v=q7QCb79GBWA" style="display:block;text-decoration:none;border-radius:12px;overflow:hidden;border:1px solid #1a1816;">
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="background:linear-gradient(135deg, #141210 0%, #0a0908 100%);border-radius:12px;padding:24px;text-align:center;">
                  <table cellpadding="0" cellspacing="0" style="margin:0 auto 12px;">
                    <tr>
                      <td style="width:48px;height:48px;background:rgba(201,185,154,0.12);border:1px solid #2a2520;border-radius:50%;text-align:center;vertical-align:middle;">
                        <span style="font-size:18px;color:#c9b99a;line-height:48px;">&#9654;</span>
                      </td>
                    </tr>
                  </table>
                  <p style="margin:0;font-size:13px;font-weight:600;color:#f5f0e8;font-family:'Bricolage Grotesque',system-ui,sans-serif;">Watch the Supermission Walkthrough</p>
                  <p style="margin:4px 0 0;font-size:11px;color:#4a4540;font-family:'Bricolage Grotesque',system-ui,sans-serif;">See what's possible &rarr; youtube.com</p>
                </td>
              </tr>
            </table>
          </a>
        </td>
      </tr>
    </table>
  `);
}
