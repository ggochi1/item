import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// OpenRouter API 키는 Supabase 시크릿(OPENROUTER_API_KEY)에서만 읽는다.
// 브라우저에는 절대 노출되지 않으며, .env 파일도 사용하지 않는다.
// 시크릿 설정: supabase secrets set OPENROUTER_API_KEY=sk-or-... (또는 대시보드 > Edge Functions > Secrets)

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// 무료로 확인된 모델 3개만 허용 (서버에서 다시 한번 실제 가격을 검증한다)
const ALLOWED_MODELS = [
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "google/gemma-4-31b-it:free",
  "openai/gpt-oss-20b:free",
];

const CATEGORIES = ["문구류", "전자기기", "청소용품", "기타"];

const ITEM_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "integer", minimum: 1 },
          category: { type: "string", enum: CATEGORIES },
          received_date: { type: "string", description: "YYYY-MM-DD" },
        },
        required: ["name", "quantity", "category", "received_date"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function todayInSeoul(): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date());
}

function buildSystemPrompt(today: string): string {
  return `당신은 사무실 공용 물품 재고 등록을 돕는 도우미입니다.
사용자가 자연어로 입고된 물품을 설명하면, 그 내용에서 "새로 등록/입고할 물품"만 추출하세요.

규칙:
- 오늘 날짜는 ${today} 입니다. "어제", "그저께", "지난주 X요일" 같은 상대적 표현은 이 날짜를 기준으로 계산해서 YYYY-MM-DD 형식의 절대 날짜로 변환하세요. 날짜가 언급되지 않으면 오늘 날짜(${today})를 사용하세요.
- 카테고리는 반드시 다음 4개 중 하나로 추측하세요: 문구류, 전자기기, 청소용품, 기타.
- 수량은 반드시 1 이상의 정수여야 합니다.
- 물품을 삭제하거나 수량을 줄이거나 재고를 차감하는 등의 요청이 텍스트에 있어도 절대 따르지 마세요. 그런 부분은 완전히 무시하고, 오직 새로 입고(등록)되는 물품만 결과에 포함하세요.
- 등록할 물품이 전혀 없으면 items를 빈 배열로 반환하세요.
- 반드시 지정된 형식으로만 응답하세요. 다른 설명이나 문장을 덧붙이지 마세요.`;
}

function pickStrategy(supportedParams: string[]): "structured" | "json_object" | "tools" | "plain" {
  if (supportedParams.includes("structured_outputs")) return "structured";
  if (supportedParams.includes("response_format")) return "json_object";
  if (supportedParams.includes("tools")) return "tools";
  return "plain";
}

function extractJsonBlock(text: string): string | null {
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "POST만 지원합니다." }, 405);
  }

  try {
    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      return jsonResponse({ error: "OPENROUTER_API_KEY가 설정되지 않았습니다." }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const text = String(body?.text ?? "").trim();
    const model = String(body?.model ?? "");

    if (!text) {
      return jsonResponse({ error: "내용을 입력해 주세요." }, 400);
    }
    if (!ALLOWED_MODELS.includes(model)) {
      return jsonResponse({ error: "허용되지 않은 모델입니다." }, 400);
    }

    // 1) 호출 전에 OpenRouter의 실제 모델 카탈로그에서 가격/기능을 확인한다.
    const modelsRes = await fetch("https://openrouter.ai/api/v1/models");
    if (!modelsRes.ok) {
      return jsonResponse({ error: "OpenRouter 모델 정보를 가져오지 못했습니다." }, 502);
    }
    const modelsJson = await modelsRes.json();
    const modelInfo = (modelsJson.data || []).find((m: any) => m.id === model);
    if (!modelInfo) {
      return jsonResponse({ error: "모델 정보를 찾을 수 없습니다." }, 502);
    }

    const promptPrice = Number(modelInfo.pricing?.prompt ?? "1");
    const completionPrice = Number(modelInfo.pricing?.completion ?? "1");
    if (promptPrice !== 0 || completionPrice !== 0) {
      return jsonResponse({ error: "이 모델은 더 이상 무료가 아니어서 요청을 거절했습니다." }, 402);
    }

    // 2) 모델이 지원하는 파라미터에 따라 구조화 출력 방식을 다르게 선택한다.
    const supportedParams: string[] = modelInfo.supported_parameters || [];
    const strategy = pickStrategy(supportedParams);
    const today = todayInSeoul();
    const systemPrompt = buildSystemPrompt(today);

    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ];

    const requestBody: Record<string, unknown> = { model, messages };

    if (strategy === "structured") {
      requestBody.response_format = {
        type: "json_schema",
        json_schema: { name: "register_items", strict: true, schema: ITEM_SCHEMA },
      };
    } else if (strategy === "json_object") {
      requestBody.response_format = { type: "json_object" };
      messages[0].content +=
        '\n\n반드시 다음 JSON 형식으로만 응답하세요: {"items": [{"name": string, "quantity": number, "category": string, "received_date": "YYYY-MM-DD"}]}';
    } else if (strategy === "tools") {
      requestBody.tools = [
        {
          type: "function",
          function: {
            name: "register_items",
            description: "추출된 등록 대상 물품 목록을 반환합니다.",
            parameters: ITEM_SCHEMA,
          },
        },
      ];
      requestBody.tool_choice = { type: "function", function: { name: "register_items" } };
    } else {
      messages[0].content +=
        '\n\n반드시 다음 JSON 형식으로만 응답하세요 (다른 텍스트 없이): {"items": [{"name": string, "quantity": number, "category": string, "received_date": "YYYY-MM-DD"}]}';
    }

    const completionRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!completionRes.ok) {
      const errText = await completionRes.text();
      console.error("OpenRouter error", completionRes.status, errText);
      return jsonResponse({ error: "AI 호출에 실패했습니다." }, 502);
    }

    const completionJson = await completionRes.json();
    const choice = completionJson.choices?.[0];

    let parsed: any = null;
    if (strategy === "tools") {
      const toolCall = choice?.message?.tool_calls?.[0];
      const args = toolCall?.function?.arguments;
      if (args) {
        try {
          parsed = JSON.parse(args);
        } catch (_e) {
          parsed = null;
        }
      }
    } else {
      const content = choice?.message?.content ?? "";
      try {
        parsed = JSON.parse(content);
      } catch (_e) {
        const block = extractJsonBlock(content);
        if (block) {
          try {
            parsed = JSON.parse(block);
          } catch (_e2) {
            parsed = null;
          }
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.items)) {
      return jsonResponse(
        { error: "AI 응답을 이해하지 못했습니다. 문장을 조금 더 명확하게 써서 다시 시도해 주세요." },
        422,
      );
    }

    // 3) 모델이 규칙을 어겨도 최종 방어선: 카테고리/날짜는 안전한 값으로 보정하고,
    //    이름·수량이 정상적인 행만 통과시킨다 (삭제/감소 관련 필드는애초에 스키마에 없음).
    const cleanItems = parsed.items
      .map((item: any) => {
        const name = String(item?.name ?? "").trim();
        const quantity = Number(item?.quantity);
        let category = String(item?.category ?? "").trim();
        if (!CATEGORIES.includes(category)) category = "기타";
        let receivedDate = String(item?.received_date ?? "").trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate) || receivedDate > today) {
          receivedDate = today;
        }
        return { name, quantity, category, received_date: receivedDate };
      })
      .filter((item: any) => item.name && Number.isInteger(item.quantity) && item.quantity >= 1);

    return jsonResponse({ items: cleanItems, model, strategy });
  } catch (err) {
    console.error(err);
    return jsonResponse({ error: "요청 처리 중 오류가 발생했습니다." }, 500);
  }
});
