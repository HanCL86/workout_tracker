// analyze.js - Gemini 2.0 Flash 버전 (무료)
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const { image_base64 } = JSON.parse(event.body);

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                inline_data: {
                  mime_type: 'image/jpeg',
                  data: image_base64,
                }
              },
              {
                text: '이 이미지가 운동 앱(삼성헬스,애플피트니스,나이키런클럽,스트라바,가민,카카오헬스 등)의 운동 기록 스크린샷인지 판별하세요. 반드시 JSON으로만 응답:\n{"verified":true/false,"duration_minutes":정수또는null,"exercise_type":"종류"또는null,"reason":"이유한줄"}'
              }
            ]
          }],
          generationConfig: { temperature: 0 },
        })
      }
    );

    const d = await res.json();
    const text = (d.candidates?.[0]?.content?.parts?.[0]?.text || '')
      .replace(/```json|```/g, '').trim();
    const result = JSON.parse(text);

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ verified: false, reason: '서버 오류: ' + err.message }),
    };
  }
};
