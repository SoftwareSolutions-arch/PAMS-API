// utils/emailTemplate.js

export const generateEmailTemplate = ({
  title,
  greeting,
  message,
  highlight,
  actionText,
  actionUrl,
  footerNote,
}) => {
  const currentYear = new Date().getFullYear();

  return `
  <div style="font-family: 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f7f8fa; padding: 40px 0; text-align: center;">
    <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.05); overflow: hidden;">
      
      <!-- Header -->
      <div style="background-color: #003366; padding: 24px;">
        <img src="${process.env.APP_URL}/logo.png" alt="PAMS Logo" style="width: 120px; height: auto;">
      </div>

      <!-- Body -->
      <div style="padding: 32px; text-align: left; color: #333;">
        ${title ? `<h2 style="color: #003366; margin-bottom: 16px;">${title}</h2>` : ""}
        ${greeting ? `<p style="font-size: 15px; line-height: 1.6;">${greeting}</p>` : ""}
        ${message ? `<p style="font-size: 15px; line-height: 1.6; margin-top: 10px;">${message}</p>` : ""}

        ${
          highlight
            ? `
          <div style="text-align: center; margin: 32px 0;">
            <div style="background-color: #eaf2ff; display: inline-block; padding: 16px 32px; border-radius: 6px;">
              <span style="font-size: 24px; font-weight: 700; letter-spacing: 4px; color: #0056b3;">${highlight}</span>
            </div>
          </div>`
            : ""
        }

        ${
          actionUrl
            ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${actionUrl}" style="background-color: #0056b3; color: #ffffff; padding: 12px 24px; border-radius: 4px;
                  text-decoration: none; font-weight: 600; font-size: 15px; display: inline-block;">
              ${actionText || "View Details"}
            </a>
          </div>`
            : ""
        }

        ${
          footerNote
            ? `<p style="font-size: 14px; color: #666; margin-top: 10px;">${footerNote}</p>`
            : ""
        }
      </div>

      <!-- Signature -->
      <div style="border-top: 1px solid #eee; padding: 20px 32px; background-color: #fafafa; text-align: left; font-size: 14px; color: #555;">
        <p style="margin: 0 0 6px;">Warm regards,</p>
        <p style="margin: 0;"><strong>PAMS Security Team</strong></p>
        <p style="margin: 2px 0 0; color: #888;">Protecting your digital workspace</p>
        <div style="margin-top: 12px; color: #aaa; font-size: 12px;">
          <p style="margin: 0;">© ${currentYear} PAMS Technologies Pvt. Ltd.</p>
          <p style="margin: 0;">This is an automated message. Please do not reply.</p>
        </div>
      </div>
    </div>
  </div>
  `;
};
