import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);

app.post('/api/coach-advice', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(400).json({
      error: 'Clé API Gemini non configurée. Ajoutez GEMINI_API_KEY dans Settings > Secrets pour activer le Coach Tactique IA.',
    });
    return;
  }

  const { question, starters, coachStyle, opponentFocus } = req.body ?? {};
  if (!question || typeof question !== 'string' || !question.trim()) {
    res.status(400).json({ error: 'Veuillez poser une question tactique.' });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const rosterSummary = Array.isArray(starters)
      ? starters
          .map(
            (p: { name?: string; position?: string; ovr?: number; role?: string }) =>
              `${p.name ?? 'Joueur'} (${p.position ?? 'G'}, ${p.ovr ?? 90} OVR, rôle ${p.role ?? 'polyvalent'})`
          )
          .join(', ')
      : 'Cinq majeur standard';

    const prompt = `Cinq majeur actuel : ${rosterSummary}.
Système du coach : ${coachStyle ?? 'Run & Gun'}.
Adversaire / Contexte : ${opponentFocus ?? 'Match compétitif 5v5 / 3v3'}.
Question du manager : ${question.trim()}`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: prompt,
      config: {
        systemInstruction:
          'Tu es un coach tactique élite de basketball professionnel dans Hoop Legends. Réponds en français de manière directe, structurée et actionnable en 3 à 4 points courts maximum (ajustement du 5 majeur, schémas offensifs, plan défensif).',
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.HIGH,
        },
      },
    });

    res.json({ advice: response.text ?? 'Analyse terminée.' });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Erreur lors de la consultation du Coach IA.';
    res.status(502).json({ error: msg });
  }
});

async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Hoop Legends server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
