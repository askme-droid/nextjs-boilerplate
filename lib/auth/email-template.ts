/**
 * Shared branded layout for the three auth emails Better-Auth sends
 * (lib/auth/auth.ts) — a simple header, heading, message, a real button
 * (styled `<a>`, since `<button>` doesn't render reliably in email clients),
 * a plain-URL fallback for clients that strip buttons/links, and a
 * plain-text alternative for clients that don't render HTML at all.
 */
export function renderAuthEmail({
  heading,
  message,
  buttonLabel,
  buttonUrl,
  footnote,
}: {
  heading: string;
  message: string;
  buttonLabel: string;
  buttonUrl: string;
  footnote?: string;
}): { html: string; text: string } {
  const html = `
<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:20px 32px;background-color:#18181b;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.02em;">FD.SG</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#18181b;">${heading}</h1>
                <p style="margin:0 0 24px;font-size:14px;line-height:1.6;color:#3f3f46;">${message}</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:6px;background-color:#18181b;">
                      <a href="${buttonUrl}" style="display:inline-block;padding:12px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">${buttonLabel}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#71717a;">
                  If the button doesn't work, copy and paste this link into your browser:<br>
                  <a href="${buttonUrl}" style="color:#3f3f46;word-break:break-all;">${buttonUrl}</a>
                </p>
                ${footnote ? `<p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:#a1a1aa;">${footnote}</p>` : ""}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  const text = [
    "FD.SG",
    "",
    heading,
    "",
    message,
    "",
    `${buttonLabel}: ${buttonUrl}`,
    ...(footnote ? ["", footnote] : []),
  ].join("\n");

  return { html, text };
}
