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
              { inline_data: { mime_type: 'image/jpeg', data: image_base64 } },
              { text: '이 이미지가 운동 앱(삼성헬스, 애플피트니스, 나이키런클럽, 스트라바, 가민, 카카오헬스 등)의 운동 기록 스크린샷인지 판별하세요. 아래 JSON 형식으로만 응답하고 다른 텍스트는 절대 포함하지 마세요:\n{"verified":true,"duration_minutes":45,"exercise_type":"러닝","reason":"나이키런클럽 러닝 기록 화면"}' }
            ]
          }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
          },
        })
      }
    );

    const d = await res.json();

    // Gemini 응답 파싱
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = raw.replace(/```json/g, '').replace(/```/g, '').trim();

    let result;
    try {
      result = JSON.parse(cleaned);
    } catch(e) {
      // JSON 파싱 실패 시 기본값
      result = { verified: false, reason: 'AI 응답을 파싱할 수 없어요. 다시 시도해주세요.' };
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ verified: false, reason: '서버 오류: ' + err.message }),
    };
  }
};
