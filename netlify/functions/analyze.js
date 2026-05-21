exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  try {
    const { image_base64 } = JSON.parse(event.body);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: 'image/jpeg', data: image_base64 } },
              { text: `이 이미지가 운동 앱(삼성헬스, 애플피트니스, 나이키런클럽, 스트라바, 가민, 카카오헬스 등)의 운동 기록 스크린샷인지 판별하세요.

이미지에서 운동 날짜를 찾아주세요. 오늘 날짜는 ${todayStr}입니다.
날짜가 보이면 YYYY-MM-DD 형식으로 추출하고, 안 보이면 null로 하세요.

반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 없이 JSON만 출력하세요:
{"verified":true,"duration_minutes":45,"exercise_type":"러닝","exercise_date":"2025-05-21","reason":"운동 기록 화면 확인됨"}` }
            ]
          }],
          generationConfig: { temperature: 0 },
        })
      }
    );

    const d = await res.json();
    console.log('Gemini raw response:', JSON.stringify(d));

    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Raw text:', raw);

    let result;
    try {
      result = JSON.parse(raw.trim());
    } catch(e1) {
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        result = JSON.parse(cleaned);
      } catch(e2) {
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) result = JSON.parse(match[0]);
          else throw new Error('No JSON found');
        } catch(e3) {
          return {
            statusCode: 200,
            headers: CORS,
            body: JSON.stringify({
              verified: false,
              reason: 'AI 응답 파싱 실패. 원문: ' + raw.substring(0, 200)
            })
          };
        }
      }
    }

    // 날짜 검증: 운동 날짜가 오늘보다 미래면 오늘 날짜로 대체
    if (result.exercise_date) {
      const exDate = new Date(result.exercise_date);
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      if (exDate > now) {
        result.exercise_date = todayStr;
      }
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
