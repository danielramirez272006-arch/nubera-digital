import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(__dirname, '../../../prompts');

let cachedRegistry = null;
const cachedPromptTexts = new Map();

export async function getPromptRegistry() {
  if (cachedRegistry) return cachedRegistry;
  try {
    const raw = await fs.readFile(path.join(PROMPTS_DIR, 'registry.json'), 'utf8');
    cachedRegistry = JSON.parse(raw);
    return cachedRegistry;
  } catch {
    return {
      orchestrator: { version: '1.2.0', file: 'orchestrator_v1.md' },
      policy_agent: { version: '1.2.0', file: 'policy_agent_v1.md' },
      employee_agent: { version: '1.1.0', file: 'employee_agent_v1.md' },
      analyst_agent: { version: '1.1.0', file: 'analyst_agent_v1.md' },
    };
  }
}

export async function getPromptVersion(agentKey = 'orchestrator') {
  const reg = await getPromptRegistry();
  return reg?.[agentKey]?.version || '1.2.0';
}

export async function loadPromptText(agentKey, fallbackText = '') {
  if (cachedPromptTexts.has(agentKey)) {
    return cachedPromptTexts.get(agentKey);
  }
  const reg = await getPromptRegistry();
  const file = reg?.[agentKey]?.file;
  if (!file) return fallbackText;
  try {
    const text = await fs.readFile(path.join(PROMPTS_DIR, file), 'utf8');
    const trimmed = text.trim();
    cachedPromptTexts.set(agentKey, trimmed);
    return trimmed;
  } catch {
    return fallbackText;
  }
}
