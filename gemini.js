// Vercel Serverless Function: /api/gemini
// Configure a variável de ambiente GEMINI_API_KEY no painel da Vercel.

const MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
}

module.exports = async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const apiKey = (process.env.GEMINI_API_KEY || '').trim();

  // Health check usado pelo app para detectar se o proxy está ativo
  if (req.method === 'GET') {
    return res.status(200).json({
      ok: true,
      configured: Boolean(apiKey),
      provider: 'Vercel'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Método não permitido.' });
  }

  if (!apiKey) {
    return res.status(503).json({
      ok: false,
      error: 'Variável GEMINI_API_KEY não configurada no servidor Vercel.'
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (_) {
      return res.status(400).json({ ok: false, error: 'JSON inválido.' });
    }
  }

  const parts = Array.isArray(body && body.parts) ? body.parts : null;
  if (!parts || parts.length === 0) {
    return res.status(400).json({ ok: false, error: 'Campo "parts" obrigatório.' });
  }

  const expectJson = body.expectJson !== false;
  const temperature = typeof body.temperature === 'number' ? body.temperature : 0.4;

  const payload = {
    contents: [{ parts }],
    generationConfig: expectJson
      ? { responseMimeType: 'application/json', temperature }
      : { temperature }
  };

  let lastError = 'Falha ao consultar a IA Gemini.';

  for (const model of MODELS) {
    try {
      const upstream = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }
      );

      const data = await upstream.json().catch(() => ({}));
      if (!upstream.ok) {
        lastError = (data && data.error && data.error.message) || `Erro HTTP ${upstream.status}`;
        continue;
      }

      const text = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
      if (text && text.trim()) {
        return res.status(200).json({
          ok: true,
          model,
          text: text.trim()
        });
      }
    } catch (err) {
      lastError = (err && err.message) || 'Erro de conexão com a API Gemini.';
    }
  }

  return res.status(502).json({ ok: false, error: lastError });
};
