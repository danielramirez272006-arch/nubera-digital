import 'dotenv/config';
import { generateChatCompletion } from '../src/agents/llmClient.js';

const provider = process.env.LLM_PROVIDER || 'none';
const model = process.env.LLM_MODEL || 'deepseek-chat';
const hasKey = Boolean(process.env.DEEPSEEK_API_KEY);

console.log(`Proveedor configurado: ${provider} | Modelo: ${model} | DEEPSEEK_API_KEY: ${hasKey ? 'definida' : 'VACÍA'}`);

if (provider !== 'deepseek' || !hasKey) {
  console.error('Configura LLM_PROVIDER=deepseek y DEEPSEEK_API_KEY en backend/.env');
  process.exit(1);
}

const t0 = performance.now();
const reply = await generateChatCompletion({
  systemPrompt: 'Responde en español de forma breve.',
  userPrompt: 'Confirma con una frase corta que la conexión con DeepSeek funciona.',
  maxTokens: 60,
});
const ms = Math.round(performance.now() - t0);

if (!reply) {
  console.error('DeepSeek no devolvió respuesta.');
  process.exit(1);
}

console.log(`DeepSeek OK (${ms} ms): ${reply}`);
