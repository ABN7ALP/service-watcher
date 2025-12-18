const Resend = require('resend');
const jwt = require('jsonwebtoken');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.sendVerificationEmail = async (email, userId) => {
  try {
    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;

    await resend.emails.send({
      from: 'noreply@yourdomain.com',
      to: email,
      subject: 'Verify Your Email',
      html: `
        <h1>Welcome to Battle Platform!</h1>
        <p>Please verify your email by clicking the link below:</p>
        <a href="${verificationLink}" style="
          display: inline-block;
          padding: 10px 20px;
          background-color: #007bff;
          color: white;
          text-decoration: none;
          border-radius: 5px;
          margin: 10px 0;
        ">
          Verify Email
        </a>
        <p>This link will expire in 24 hours.</p>
      `
    });

    return true;
  } catch (error) {
    console.error('Email sending error:', error);
    return false;
  }
};

exports.sendPasswordResetEmail = async (email, token) => {
  // Similar implementation for password reset
};

exports.sendAdminNotification = async (subject, message) => {
  // For admin notifications
};
