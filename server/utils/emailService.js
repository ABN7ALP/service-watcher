const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

exports.sendVerificationEmail = async (email, userId) => {
  try {
    const jwt = require('jsonwebtoken');

    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const verificationLink = `${process.env.FRONTEND_URL}/verify-email/${token}`;

    const { data, error } = await resend.emails.send({
      from: 'Battle Platform <noreply@yourdomain.com>',
      to: email,
      subject: '🔐 Verify Your Email - Battle Platform',
      html: `
        <!DOCTYPE html>
        <html dir="rtl" lang="ar">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
            <style>
                body { font-family: 'Cairo', Arial, sans-serif; background: #f5f7fa; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(45deg, #6a11cb, #2575fc); color: white; padding: 30px; text-align: center; }
                .content { padding: 40px; color: #333; }
                .button { display: inline-block; padding: 15px 30px; background: linear-gradient(45deg, #6a11cb, #2575fc); color: white; text-decoration: none; border-radius: 50px; font-weight: bold; margin: 20px 0; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎮 منصة التحديات</h1>
                    <p>تفعيل البريد الإلكتروني</p>
                </div>
                <div class="content">
                    <h2>مرحباً بك في منصة التحديات!</h2>
                    <p>شكراً لتسجيلك في منصتنا. لتفعيل حسابك، يرجى النقر على الرابط أدناه:</p>
                    
                    <div style="text-align: center;">
                        <a href="${verificationLink}" class="button">
                            🔗 تفعيل الحساب
                        </a>
                    </div>
                    
                    <p>إذا لم تقم بطلب هذا الرابط، يمكنك تجاهل هذا البريد.</p>
                    <p>هذا الرابط سينتهي خلال 24 ساعة.</p>
                    
                    <hr style="margin: 30px 0; border: 1px solid #eee;">
                    
                    <p style="color: #666; font-size: 14px;">
                        إذا واجهت مشكلة في النقر على الزر، يمكنك نسخ الرابط التالي ولصقه في المتصفح:<br>
                        <code style="background: #f8f9fa; padding: 10px; border-radius: 5px; display: block; margin: 10px 0; word-break: break-all;">
                            ${verificationLink}
                        </code>
                    </p>
                </div>
                <div class="footer">
                    <p>© ${new Date().getFullYear()} منصة التحديات. جميع الحقوق محفوظة.</p>
                    <p>هذا البريد مرسل تلقائياً، يرجى عدم الرد عليه.</p>
                </div>
            </div>
        </body>
        </html>
      `
    });

    if (error) {
      console.error('Email sending error:', error);
      return false;
    }

    console.log('✅ Verification email sent to:', email);
    return true;

  } catch (error) {
    console.error('Email service error:', error);
    return false;
  }
};

exports.sendPasswordResetEmail = async (email, token) => {
  try {
    const resetLink = `${process.env.FRONTEND_URL}/reset-password/${token}`;

    const { data, error } = await resend.emails.send({
      from: 'Battle Platform <noreply@yourdomain.com>',
      to: email,
      subject: '🔒 إعادة تعيين كلمة المرور',
      html: `
        <div style="font-family: 'Cairo', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #f5f7fa; padding: 20px;">
          <div style="background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1);">
            <div style="background: linear-gradient(45deg, #6a11cb, #2575fc); color: white; padding: 30px; text-align: center;">
              <h1 style="margin: 0;">🔒 إعادة تعيين كلمة المرور</h1>
            </div>
            <div style="padding: 40px; color: #333;">
              <h2>طلب إعادة تعيين كلمة المرور</h2>
              <p>لقد تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك.</p>
              <p>انقر على الزر أدناه لإعادة تعيين كلمة المرور:</p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" 
                   style="display: inline-block; padding: 15px 30px; background: linear-gradient(45deg, #6a11cb, #2575fc); 
                          color: white; text-decoration: none; border-radius: 50px; font-weight: bold;">
                  🔑 إعادة تعيين كلمة المرور
                </a>
              </div>
              
              <p>إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد.</p>
              <p>هذا الرابط صالح لمدة ساعة واحدة فقط.</p>
              
              <hr style="margin: 30px 0; border: 1px solid #eee;">
              
              <p style="color: #666; font-size: 14px;">
                إذا لم يعمل الزر، انسخ الرابط التالي:<br>
                <code style="background: #f8f9fa; padding: 10px; border-radius: 5px; display: block; margin: 10px 0;">
                  ${resetLink}
                </code>
              </p>
            </div>
            <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #666; font-size: 14px;">
              <p>© ${new Date().getFullYear()} منصة التحديات</p>
            </div>
          </div>
        </div>
      `
    });

    return !error;

  } catch (error) {
    console.error('Password reset email error:', error);
    return false;
  }
};

exports.sendAdminNotification = async (subject, message) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    
    if (!adminEmail) {
      console.error('Admin email not configured');
      return false;
    }

    const { data, error } = await resend.emails.send({
      from: 'Battle Platform Alerts <alerts@yourdomain.com>',
      to: adminEmail,
      subject: `⚠️ ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 10px; padding: 20px;">
            <h2 style="color: #856404; margin-top: 0;">⚠️ إشعار إداري</h2>
            <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
              <p style="color: #333; font-size: 16px; line-height: 1.6;">${message}</p>
            </div>
            <p style="color: #666; font-size: 14px;">
              الوقت: ${new Date().toLocaleString('ar-SA')}<br>
              النظام: Battle Platform
            </p>
          </div>
        </div>
      `
    });

    return !error;

  } catch (error) {
    console.error('Admin notification error:', error);
    return false;
  }
};

// Fallback email service for development
exports.sendFallbackEmail = async (email, subject, html) => {
  try {
    console.log('📧 [DEV] Email would be sent to:', email);
    console.log('📧 [DEV] Subject:', subject);
    console.log('📧 [DEV] HTML:', html.substring(0, 200) + '...');
    
    // In development, just log the email
    return true;
    
  } catch (error) {
    console.error('Fallback email error:', error);
    return false;
  }
};
