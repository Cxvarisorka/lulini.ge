'use strict';

const nodemailer = require('nodemailer');

// ---------------------------------------------------------------------------
// Transporter (lazy-initialized)
// ---------------------------------------------------------------------------

let transporter = null;

function getTransporter() {
    if (transporter) return transporter;

    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('[EmailService] SMTP not configured — emails will be skipped');
        return null;
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '465', 10),
        secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
        },
    });

    return transporter;
}

// ---------------------------------------------------------------------------
// Translations
// ---------------------------------------------------------------------------

const i18n = {
    en: {
        verificationTitle: 'Email Verification',
        hello: 'Hello',
        verifyPrompt: 'Please use the following code to verify your email address:',
        expiresIn: 'This code expires in <strong>10 minutes</strong>.',
        ignoreNotice: 'If you didn\u2019t request this, you can safely ignore this email.',
        receiptTitle: 'Ride Receipt',
        greeting: 'Thanks for riding with Lulini! Here\u2019s your trip receipt.',
        totalFare: 'Total Fare',
        route: 'Route',
        pickup: 'Pickup',
        dropoff: 'Dropoff',
        stop: 'Stop',
        tripDetails: 'Trip Details',
        date: 'Date',
        distance: 'Distance',
        duration: 'Duration',
        driver: 'Driver',
        vehicle: 'Vehicle',
        licensePlate: 'License Plate',
        fareBreakdown: 'Fare Breakdown',
        baseFare: 'Base Fare',
        distanceCharge: 'Distance Charge',
        waitingFee: 'Waiting Fee',
        total: 'Total',
        receiptId: 'Receipt ID',
        cash: 'Cash',
        card: 'Card',
        taxiService: 'Taxi Service',
        subjectCode: (code) => `${code} — Your Lulini Verification Code`,
        subjectReceipt: (fare) => `Your Lulini Ride Receipt — ${fare} GEL`,
    },
    ka: {
        verificationTitle: 'ელ. ფოსტის დადასტურება',
        hello: 'გამარჯობა',
        verifyPrompt: 'გთხოვთ გამოიყენოთ შემდეგი კოდი ელ. ფოსტის დასადასტურებლად:',
        expiresIn: 'კოდის მოქმედების ვადაა <strong>10 წუთი</strong>.',
        ignoreNotice: 'თუ თქვენ არ მოითხოვეთ ეს კოდი, უბრალოდ უგულებელყოთ ეს შეტყობინება.',
        receiptTitle: 'მგზავრობის ქვითარი',
        greeting: 'მადლობა რომ Lulini-ს სერვისით ისარგებლეთ! აქ არის თქვენი მგზავრობის ქვითარი.',
        totalFare: 'ჯამური ფასი',
        route: 'მარშრუტი',
        pickup: 'აყვანა',
        dropoff: 'ჩამოსვლა',
        stop: 'გაჩერება',
        tripDetails: 'მგზავრობის დეტალები',
        date: 'თარიღი',
        distance: 'მანძილი',
        duration: 'ხანგრძლივობა',
        driver: 'მძღოლი',
        vehicle: 'ავტომობილი',
        licensePlate: 'სანომრე ნიშანი',
        fareBreakdown: 'ფასის დეტალები',
        baseFare: 'საბაზისო ფასი',
        distanceCharge: 'მანძილის ფასი',
        waitingFee: 'ლოდინის ფასი',
        total: 'ჯამი',
        receiptId: 'ქვითრის ID',
        cash: 'ნაღდი',
        card: 'ბარათი',
        taxiService: 'ტაქსის სერვისი',
        subjectCode: (code) => `${code} — Lulini-ს დადასტურების კოდი`,
        subjectReceipt: (fare) => `Lulini-ს მგზავრობის ქვითარი — ${fare} GEL`,
    },
};

function t(lang) {
    return i18n[lang] || i18n.en;
}

// ---------------------------------------------------------------------------
// Shared HTML layout
// ---------------------------------------------------------------------------

function wrapLayout(title, bodyHtml, lang = 'en') {
    const strings = t(lang);
    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#faf5ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf5ff;padding:40px 20px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(91,33,182,0.10);">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#5b21b6 0%,#7c3aed 100%);padding:32px 40px;text-align:center;">
      <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">Lulini</h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.75);font-size:13px;letter-spacing:1px;text-transform:uppercase;">${title}</p>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="padding:36px 40px;">
      ${bodyHtml}
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="padding:24px 40px;background-color:#f5f3ff;border-top:1px solid #ede9fe;text-align:center;">
      <p style="margin:0 0 4px;color:#8b5cf6;font-size:12px;">&copy; ${new Date().getFullYear()} Lulini &mdash; ${strings.taxiService}</p>
      <p style="margin:0;color:#a78bfa;font-size:11px;">info@lulini.ge &middot; +995 322 118 811</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Email: Verification Code
// ---------------------------------------------------------------------------

function buildVerificationEmail(userName, code, lang = 'en') {
    const strings = t(lang);
    const body = `
      <p style="margin:0 0 8px;color:#1a1a1a;font-size:15px;line-height:1.6;">
        ${strings.hello}${userName ? ` <strong>${userName}</strong>` : ''},
      </p>
      <p style="margin:0 0 28px;color:#525f7f;font-size:15px;line-height:1.6;">
        ${strings.verifyPrompt}
      </p>

      <!-- OTP Code Box -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        <tr><td align="center">
          <div style="display:inline-block;background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:12px;padding:20px 48px;margin-bottom:28px;">
            <span style="font-size:36px;font-weight:700;letter-spacing:12px;color:#ffffff;font-family:'Courier New',monospace;">${code}</span>
          </div>
        </td></tr>
      </table>

      <p style="margin:0 0 6px;color:#8898aa;font-size:13px;line-height:1.5;text-align:center;">
        ${strings.expiresIn}
      </p>
      <p style="margin:0;color:#8898aa;font-size:13px;line-height:1.5;text-align:center;">
        ${strings.ignoreNotice}
      </p>`;

    return wrapLayout(strings.verificationTitle, body, lang);
}

// ---------------------------------------------------------------------------
// Email: Ride Receipt
// ---------------------------------------------------------------------------

function buildReceiptEmail(receipt, lang = 'en') {
    const strings = t(lang);
    const { ride, driver, passenger, fare, timestamps } = receipt;

    const dateLocale = lang === 'ka' ? 'ka-GE' : 'en-GB';
    const fmtDate = (iso) => {
        if (!iso) return '—';
        const d = new Date(iso);
        return d.toLocaleDateString(dateLocale, { day: 'numeric', month: 'short', year: 'numeric' })
            + ' · '
            + d.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' });
    };

    const fmtCurrency = (amount) => `${Number(amount || 0).toFixed(2)} GEL`;

    const vehicleLabels = {
        economy: lang === 'ka' ? 'ეკონომი' : 'Economy',
        comfort: lang === 'ka' ? 'კომფორტი' : 'Comfort',
        business: lang === 'ka' ? 'ბიზნესი' : 'Business',
        van: lang === 'ka' ? 'მინივენი' : 'Van',
        minibus: lang === 'ka' ? 'მინიბუსი' : 'Minibus',
    };

    const paymentLabel = fare.paymentMethod === 'cash' ? strings.cash
        : fare.paymentMethod === 'card' ? strings.card
        : fare.paymentMethod;

    const stopsHtml = (ride.stops && ride.stops.length > 0)
        ? ride.stops.map((s, i) => `
          <tr>
            <td style="padding:10px 0;vertical-align:top;width:28px;">
              <div style="width:10px;height:10px;border-radius:50%;background-color:#f59e0b;border:2px solid #d97706;margin:4px auto 0;"></div>
            </td>
            <td style="padding:10px 0;padding-left:12px;">
              <p style="margin:0;color:#8898aa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${strings.stop} ${i + 1}</p>
              <p style="margin:2px 0 0;color:#1a1a1a;font-size:14px;">${s.address || '—'}</p>
            </td>
          </tr>`).join('')
        : '';

    const body = `
      <!-- Greeting -->
      <p style="margin:0 0 4px;color:#1a1a1a;font-size:15px;line-height:1.6;">
        ${strings.hello}${passenger.name ? ` <strong>${passenger.name}</strong>` : ''},
      </p>
      <p style="margin:0 0 28px;color:#525f7f;font-size:15px;line-height:1.6;">
        ${strings.greeting}
      </p>

      <!-- Total Fare Card -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr><td align="center">
          <div style="background:linear-gradient(135deg,#5b21b6,#7c3aed);border-radius:14px;padding:28px 24px;text-align:center;width:100%;box-sizing:border-box;">
            <p style="margin:0 0 6px;color:rgba(255,255,255,0.75);font-size:12px;text-transform:uppercase;letter-spacing:1px;">${strings.totalFare}</p>
            <p style="margin:0;color:#ffffff;font-size:42px;font-weight:700;letter-spacing:-1px;">${fmtCurrency(fare.total)}</p>
            <p style="margin:8px 0 0;color:rgba(255,255,255,0.65);font-size:13px;">
              ${vehicleLabels[ride.vehicleType] || ride.vehicleType} &middot; ${paymentLabel}
            </p>
          </div>
        </td></tr>
      </table>

      <!-- Route -->
      <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${strings.route}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;border-left:2px solid #ede9fe;margin-left:13px;">
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <div style="width:12px;height:12px;border-radius:50%;background-color:#10b981;border:2px solid #059669;margin:3px auto 0;margin-left:-7px;"></div>
          </td>
          <td style="padding:10px 0;padding-left:12px;">
            <p style="margin:0;color:#8898aa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${strings.pickup}</p>
            <p style="margin:2px 0 0;color:#1a1a1a;font-size:14px;">${ride.pickup.address || '—'}</p>
          </td>
        </tr>
        ${stopsHtml}
        <tr>
          <td style="padding:10px 0;vertical-align:top;width:28px;">
            <div style="width:12px;height:12px;border-radius:50%;background-color:#ef4444;border:2px solid #dc2626;margin:3px auto 0;margin-left:-7px;"></div>
          </td>
          <td style="padding:10px 0;padding-left:12px;">
            <p style="margin:0;color:#8898aa;font-size:11px;text-transform:uppercase;letter-spacing:0.5px;">${strings.dropoff}</p>
            <p style="margin:2px 0 0;color:#1a1a1a;font-size:14px;">${ride.dropoff.address || '—'}</p>
          </td>
        </tr>
      </table>

      <!-- Trip Details -->
      <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${strings.tripDetails}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.date}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${fmtDate(timestamps.rideCompleted || timestamps.requested)}</span>
          </td>
        </tr>
        ${ride.distance.formatted ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.distance}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${ride.distance.formatted}</span>
          </td>
        </tr>` : ''}
        ${ride.duration.formatted ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.duration}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${ride.duration.formatted}</span>
          </td>
        </tr>` : ''}
        ${driver ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.driver}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${driver.name}</span>
          </td>
        </tr>` : ''}
        ${driver && driver.vehicle ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.vehicle}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${driver.vehicle.color || ''} ${driver.vehicle.make || ''} ${driver.vehicle.model || ''}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.licensePlate}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:600;letter-spacing:1px;">${driver.vehicle.licensePlate || '—'}</span>
          </td>
        </tr>` : ''}
      </table>

      <!-- Fare Breakdown -->
      <p style="margin:0 0 12px;color:#1a1a1a;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${strings.fareBreakdown}</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.baseFare}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${fmtCurrency(fare.breakdown.baseFare)}</span>
          </td>
        </tr>
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.distanceCharge}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${fmtCurrency(fare.breakdown.distanceCharge)}</span>
          </td>
        </tr>
        ${fare.breakdown.waitingFee > 0 ? `
        <tr>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;">
            <span style="color:#8898aa;font-size:13px;">${strings.waitingFee}</span>
          </td>
          <td style="padding:10px 0;border-bottom:1px solid #f5f3ff;text-align:right;">
            <span style="color:#1a1a1a;font-size:13px;font-weight:500;">${fmtCurrency(fare.breakdown.waitingFee)}</span>
          </td>
        </tr>` : ''}
        <tr>
          <td style="padding:14px 0 0;">
            <span style="color:#5b21b6;font-size:15px;font-weight:700;">${strings.total}</span>
          </td>
          <td style="padding:14px 0 0;text-align:right;">
            <span style="color:#5b21b6;font-size:15px;font-weight:700;">${fmtCurrency(fare.total)}</span>
          </td>
        </tr>
      </table>

      <!-- Receipt ID -->
      <p style="margin:0;color:#a78bfa;font-size:11px;text-align:center;">
        ${strings.receiptId}: ${receipt.receiptId}
      </p>`;

    return wrapLayout(strings.receiptTitle, body, lang);
}

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

async function sendVerificationEmail(toEmail, userName, code, lang = 'en') {
    const tr = getTransporter();
    if (!tr) return null;

    const strings = t(lang);
    const html = buildVerificationEmail(userName, code, lang);

    return tr.sendMail({
        from: `"Lulini" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: toEmail,
        subject: strings.subjectCode(code),
        html,
    });
}

async function sendReceiptEmail(toEmail, receipt, lang = 'en') {
    const tr = getTransporter();
    if (!tr) return null;

    const strings = t(lang);
    const html = buildReceiptEmail(receipt, lang);
    const fare = Number(receipt.fare?.total || 0).toFixed(2);

    return tr.sendMail({
        from: `"Lulini" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
        to: toEmail,
        subject: strings.subjectReceipt(fare),
        html,
    });
}

module.exports = {
    sendVerificationEmail,
    sendReceiptEmail,
    // Exposed for testing
    buildVerificationEmail,
    buildReceiptEmail,
};
