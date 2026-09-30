import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

export const createEtherealTransporter = async () => {
  if (transporter) {
    return transporter;
  }

  const testAccount = await nodemailer.createTestAccount();

  console.log("📧 Ethereal account created");
  console.log("Ethereal user:", testAccount.user);

  transporter = nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });

  return transporter;
};

export const sendEmail = async ({
  from,
  to,
  subject,
  text,
}: {
  from: string;
  to: string;
  subject: string;
  text: string;
}) => {
  const mailer = await createEtherealTransporter();

  const info = await mailer.sendMail({
    from,
    to,
    subject,
    text,
  });

  const previewUrl = nodemailer.getTestMessageUrl(info);

  console.log("📨 Email sent");
  console.log("Message ID:", info.messageId);
  console.log("Preview URL:", previewUrl);

  return {
    messageId: info.messageId,
    previewUrl,
  };
};
