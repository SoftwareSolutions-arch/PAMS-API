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
  <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif; background-color: #f4f7fb; padding: 48px 16px; text-align: center; line-height: 1.5;">
    <div style="max-width: 640px; margin: 0 auto; background: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden;">
      
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #1e3a8a 0%, #3b82f6 100%); padding: 32px 24px; text-align: center;">
        <img src="${process.env.APP_URL}/logo.png" alt="PAMS Logo" style="width: 140px; height: auto; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.1));">
      </div>

      <!-- Body -->
      <div style="padding: 40px 32px; text-align: left; color: #1f2a44;">
        ${title ? `<h2 style="color: #1e3a8a; font-size: 24px; font-weight: 700; margin: 0 0 20px; letter-spacing: -0.5px;">${title}</h2>` : ""}
        ${greeting ? `<p style="font-size: 16px; line-height: 1.7; color: #374151; margin: 0 0 16px;">${greeting}</p>` : ""}
        ${message ? `<p style="font-size: 16px; line-height: 1.7; color: #374151; margin: 0 0 24px;">${message}</p>` : ""}

        ${
          highlight
            ? `
          <div style="text-align: center; margin: 32px 0;">
            <div style="background: #eff6ff; display: inline-block; padding: 16px 32px; border-radius: 8px; border: 1px solid #dbeafe; transition: transform 0.2s ease-in-out;">
              <span style="font-size: 22px; font-weight: 600; color: #1e3a8a; letter-spacing: 0.5px;">${highlight}</span>
            </div>
          </div>`
            : ""
        }

        ${
          actionUrl
            ? `
          <div style="text-align: center; margin: 32px 0;">
            <a href="${actionUrl}" style="background: linear-gradient(90deg, #2563eb, #1e40af); color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 600; display: inline-block; transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out; box-shadow: 0 2px 8px rgba(0,0,0,0.15);" onmouseover="this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.2)'" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.15)'">
              ${actionText || "Take Action"}
            </a>
          </div>`
            : ""
        }

        ${
          footerNote
            ? `<p style="font-size: 14px; color: #6b7280; line-height: 1.6; margin: 24px 0 0;">${footerNote}</p>`
            : ""
        }
      </div>

      <!-- Signature -->
      <div style="border-top: 1px solid #e5e7eb; padding: 24px 32px; background: #f9fafb; text-align: left; font-size: 14px; color: #4b5563;">
        <p style="margin: 0 0 8px; font-weight: 500;">Best regards,</p>
        <p style="margin: 0; font-weight: 600; color: #1e3a8a;">PAMS Security Team</p>
        <p style="margin: 4px 0 0; color: #6b7280; font-style: italic;">Safeguarding your digital journey</p>
        <div style="margin-top: 16px; color: #9ca3af; font-size: 12px;">
          <p style="margin: 0;">© ${currentYear} PAMS Technologies Pvt. Ltd. All rights reserved.</p>
          <p style="margin: 4px 0 0;">This is an automated message. Please do not reply directly to this email.</p>
        </div>
      </div>
    </div>
  </div>
  `;
};