// Netlify Function: auth-lookup
// URL: /.netlify/functions/auth-lookup

exports.handler = async (event, context) => {
  // CORS: allow your Shopify domain(s)
  const origin = event.headers.origin || '';
  const allowedOrigins = [
    'https://shop.championscircleuofm.com',
    'https://championscircleuofm.com'
    // add any preview domains if needed
  ];

  const allowOrigin = allowedOrigins.includes(origin)
    ? origin
    : allowedOrigins[0];

  const corsHeaders = {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, message: 'Method not allowed' }),
    };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const authCode = (body.auth_code || '').trim();
    const recaptchaToken = body.recaptcha;

    if (!authCode || !recaptchaToken) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Missing authentication number or reCAPTCHA token.',
        }),
      };
    }

    // 1) Verify reCAPTCHA with Google
    const recaptchaResp = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          secret: process.env.RECAPTCHA_SECRET_KEY,
          response: recaptchaToken,
        }),
      }
    );

    const recaptchaJson = await recaptchaResp.json();

    if (!recaptchaJson.success) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'reCAPTCHA verification failed.',
        }),
      };
    }

    // 2) Look up in Baserow
    const tableId = process.env.BASEROW_TABLE_ID;
    const apiToken = process.env.BASEROW_API_TOKEN;

    if (!tableId || !apiToken) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Server not configured correctly.',
        }),
      };
    }

  // Replace 123456 with the numeric part of your Auth Code field id (e.g. field_123456 → use 123456)
const authFieldId = 'field_6853241';

const baserowUrl = `https://api.baserow.io/api/database/rows/table/${tableId}/?user_field_names=true&filter__field_${authFieldId}__equal=${encodeURIComponent(
  authCode
)}`;

    const baserowResp = await fetch(baserowUrl, {
      headers: {
        Authorization: `Token ${apiToken}`,
      },
    });

    if (!baserowResp.ok) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message: 'Error contacting authentication database.',
        }),
      };
    }

    const baserowJson = await baserowResp.json();

    if (!baserowJson.count || baserowJson.count === 0) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          message:
            'No record found for that authentication number. Please check the number and try again.',
        }),
      };
    }

    const row = baserowJson.results[0];

    // Image Proof: Baserow file fields are arrays of objects with .url
let imageUrl = null;
const imageField = row['Image Proof'];
if (Array.isArray(imageField) && imageField.length > 0) {
  imageUrl = imageField[0].url;
}

// Unwrap single select fields (Baserow sends them as objects)
const rawItemType = row['Item Type'];
const rawStatus = row['Authentication Status'];

const itemType =
  rawItemType && typeof rawItemType === 'object'
    ? rawItemType.value || rawItemType.name || ''
    : rawItemType;

const status =
  rawStatus && typeof rawStatus === 'object'
    ? rawStatus.value || rawStatus.name || ''
    : rawStatus;

const responseData = {
  success: true,
  item: {
    auth_code: row['Auth Code'],
    item_type: itemType,
    athletes: row['Athlete(s)'],
    status: status,
    image_url: imageUrl,
  },
};

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(responseData),
    };
  } catch (err) {
    console.error('Auth lookup error:', err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        message: 'Server error. Please try again later.',
      }),
    };
  }
};
