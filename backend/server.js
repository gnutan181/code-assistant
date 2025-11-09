
import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { GoogleGenAI } from "@google/genai";

const app = express();
app.use(cors());
app.use(bodyParser.json());



const MODEL = "gemini-2.5-flash";


app.post("/api/code-assist", async (req, res) => {
  try {
    const { userPrompt, repoContext, apiKey } = req.body;
const ai = new GoogleGenAI({
  apiKey: apiKey,
});
    const systemInstruction = `
You are a senior AI coding assistant. Your response must be valid JSON that includes:
- code: The source code string
- language: Programming language identifier
- explanation: Brief explanation of the code
Return ONLY the JSON object, no other text or markdown.
`;

    const userMessage = `
User prompt: ${userPrompt}
Context: ${repoContext || "none"}
`;

    const response = await ai.models.generateContent({
      model: MODEL,
      contents: [
        { role: "model", parts: [{ text: systemInstruction }] },
        { role: "user", parts: [{ text: userMessage }] }
      ],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 1024,
      }
    });

    const rawText = response?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    
    // Clean up the response text
    let jsonStr = rawText;
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    let structured = null;
    try {
      structured = JSON.parse(jsonStr);
    } catch (err) {
      console.error("JSON parsing error:", err);
      console.log("Raw text received:", rawText);
      return res.status(500).json({
        ok: false,
        error: "Failed to parse response as JSON",
        raw: rawText
      });
    }

    return res.json({ ok: true, result: structured });
  } catch (err) {
    console.error("AI call error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});
const PORT = 8080;
app.listen(PORT, () =>
  console.log(`🚀 Code assistant server running at http://localhost:${PORT}`)
);
