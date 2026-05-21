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
              { text: '이 이미지가 운동 앱의 운동 기록 스크린샷인지 판별해서 반드시 아래 JSON 형식으로만 답하세요. 다른 텍스트 없이 JSON만 출력하세요.\n{"verified":true,"duration_minutes":45,"exercise_type":"러닝","reason":"운동 기록 화면 확인됨"}' }
            ]
          }],
          generationConfig: { temperature: 0 },
        })
      }
    );

    const d = await res.json();
    console.log('Gemini raw response:', JSON.stringify(d));

    // 응답에서 텍스트 추출
    const raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log('Raw text:', raw);

    // JSON 추출 시도 (여러 방법)
    let result;

    // 방법 1: 직접 파싱
    try {
      result = JSON.parse(raw.trim());
    } catch(e1) {
      // 방법 2: 코드블록 제거 후 파싱
      try {
        const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        result = JSON.parse(cleaned);
      } catch(e2) {
        // 방법 3: JSON 부분만 추출
        try {
          const match = raw.match(/\{[\s\S]*\}/);
          if (match) result = JSON.parse(match[0]);
          else throw new Error('No JSON found');
        } catch(e3) {
          // 모두 실패 시 원문 반환 (디버깅용)
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

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };

  } catch (err) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ verified: false, reason: '서버 오류: ' + err.message }),
    };
  }
};
  
