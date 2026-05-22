const crypto = require('crypto');

// ── Google OAuth JWT ───────────────────────────────────────────
function b64url(obj) {
  return Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj))
    .toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}

async function getToken() {
  const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  const key = sa.private_key.replace(/\\n/g, '\n');
  const now = Math.floor(Date.now() / 1000);
  const hdr = b64url({ alg: 'RS256', typ: 'JWT' });
  const pay = b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  });
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`${hdr}.${pay}`);
  const sig = sign.sign(key, 'base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const jwt = `${hdr}.${pay}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const d = await res.json();
  if (!d.access_token) throw new Error('인증 실패: ' + JSON.stringify(d));
  return d.access_token;
}

// ── Sheets API 헬퍼 ────────────────────────────────────────────
const BASE = () => `https://sheets.googleapis.com/v4/spreadsheets/${process.env.SPREADSHEET_ID}`;

async function readRange(token, range) {
  const r = await fetch(`${BASE()}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return r.json();
}

async function writeRange(token, range, values) {
  const r = await fetch(`${BASE()}/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return r.json();
}

async function appendRows(token, range, values) {
  const r = await fetch(`${BASE()}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  return r.json();
}

// ── 핸들러 ─────────────────────────────────────────────────────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
const ok  = body => ({ statusCode: 200, headers: CORS, body: JSON.stringify(body) });
const fail = (msg, code=500) => ({ statusCode: code, headers: CORS, body: JSON.stringify({ error: msg }) });

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST')    return fail('Method not allowed', 405);

  try {
    const body = JSON.parse(event.body);
    const token = await getToken();

    // ── getAll: 설정 + 인증기록 전체 읽기 ─────────────────────
    if (body.action === 'getAll') {
      const [cfgData, recData] = await Promise.all([
        readRange(token, 'config!A1:D2'),
        readRange(token, 'records!A:F'),
      ]);

      // 설정 파싱
      let config = null;
      const cv = cfgData.values || [];
      if (cv.length >= 2) {
        const [h, v] = cv;
        const i = k => h.indexOf(k);
        const code = v[i('inviteCode')];
        if (code) config = {
          inviteCode:     code,
          required:       parseInt(v[i('required')])       || 2,
          finePerMiss:    parseInt(v[i('finePerMiss')])    || 5000,
          maxFine:        parseInt(v[i('maxFine')])        || 10000,
          adminPassword:  v[i('adminPassword')]            || '',
          resetTimestamp: parseInt(v[i('resetTimestamp')]) || 0,
        };
      }

      // 인증기록 파싱
      const rv = recData.values || [];
      let records = [];
      if (rv.length >= 2) {
        const h = rv[0];
        const i = k => h.indexOf(k);
        records = rv.slice(1)
          .filter(r => r[i('name')])
          .map(r => ({
            name:         r[i('name')]   || '',
            date:         r[i('date')]   || '',
            week:         r[i('week')]   || '',
            exerciseType: r[i('exerciseType')] || null,
            duration:     parseInt(r[i('duration')])  || 0,
            timestamp:    parseInt(r[i('timestamp')]) || 0,
          }));
      }

      return ok({ config, records });
    }

    // ── saveConfig: 설정 저장 (최초 설정 & 변경 모두) ─────────
    if (body.action === 'saveConfig') {
      await writeRange(token, 'config!A1:F2', [
        ['inviteCode', 'required', 'finePerMiss', 'maxFine', 'adminPassword', 'resetTimestamp'],
        [body.inviteCode, body.required, body.finePerMiss, body.maxFine, body.adminPassword||'', body.resetTimestamp||0],
      ]);
      // 인증기록 헤더 없으면 생성
      const rh = await readRange(token, 'records!A1:F1');
      if (!rh.values?.length) {
        await writeRange(token, 'records!A1:F1', [['name','date','week','exerciseType','duration','timestamp']]);
      }
      return ok({ ok: true });
    }

    // ── addCert: 인증 기록 추가 ────────────────────────────────
    if (body.action === 'addCert') {
      const rh = await readRange(token, 'records!A1:F1');
      if (!rh.values?.length) {
        await writeRange(token, 'records!A1:F1', [['name','date','week','exerciseType','duration','timestamp']]);
      }
      await appendRows(token, 'records!A:F', [[
        body.name, body.date, body.week,
        body.exerciseType || '', body.duration || 0, Date.now(),
      ]]);
      return ok({ ok: true });
    }

    return fail('알 수 없는 action', 400);

  } catch (e) {
    return fail(e.message);
  }
};
