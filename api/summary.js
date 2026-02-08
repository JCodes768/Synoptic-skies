import Anthropic from '@anthropic-ai/sdk';

const SYSTEM_PROMPT = `You are a helpful weather assistant for a website called Synoptic Skies. Your job is to summarize NWS Area Forecast Discussions (AFDs) for a general audience.

Rules:
- Write 3-5 sentences that capture the key weather story
- Use plain language — avoid jargon, or briefly explain it if necessary
- Lead with what matters most to someone planning their day or week
- Mention any notable weather hazards or changes
- Be conversational but accurate — like a knowledgeable friend explaining the weather
- Do NOT use bullet points or markdown formatting
- Do NOT include greetings or sign-offs`;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key before doing anything
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY is not configured on the server.' });
  }

  const { afdText, afdId } = req.body || {};

  if (!afdText || typeof afdText !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid afdText' });
  }

  if (afdText.length > 15000) {
    return res.status(400).json({ error: 'AFD text too long' });
  }

  try {
    const client = new Anthropic();

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please summarize this Area Forecast Discussion:\n\n${afdText}`
        }
      ]
    });

    const summary = message.content[0]?.text || 'Unable to generate summary.';

    // Set cache headers — cache for 10 minutes on CDN
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=300');

    return res.status(200).json({ summary, afdId: afdId || null });
  } catch (err) {
    console.error('Summary generation error:', err);
    const msg = err.message || 'Failed to generate summary';
    return res.status(500).json({ error: msg });
  }
}
