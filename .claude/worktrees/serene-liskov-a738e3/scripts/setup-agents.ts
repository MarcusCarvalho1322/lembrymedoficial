/**
 * @module Setup Managed Agents
 * @description Cria environment + agente de onboarding na Anthropic.
 * Executar UMA VEZ: npx tsx scripts/setup-agents.ts
 * Salvar os IDs no .env
 */

import Anthropic from '@anthropic-ai/sdk';
import { ONBOARDING_SYSTEM_PROMPT } from '../apps/api/src/prompts/onboarding.prompt';
import { ONBOARDING_CUSTOM_TOOLS } from '../apps/api/src/prompts/onboarding.tools';

const client = new Anthropic();
const BETA = { 'anthropic-beta': 'managed-agents-2026-04-01' };

async function setup() {
  console.log('═══ LEMBRYMED — Setup Managed Agents ═══\n');

  // 1. Criar environment
  console.log('1. Criando environment...');
  const env = await (client.beta as any).environments.create({
    name: 'lembrymed-production',
    config: {
      type: 'cloud',
      networking: { type: 'unrestricted' },
    },
  }, { headers: BETA });

  console.log(`   ✅ MANAGED_AGENT_ENV_ID=${env.id}\n`);

  // 2. Criar agente de onboarding
  console.log('2. Criando agente de onboarding (claude-sonnet-4-6)...');
  const agent = await (client.beta as any).agents.create({
    name: 'Lembrymed Onboarding',
    model: 'claude-sonnet-4-6',
    system: ONBOARDING_SYSTEM_PROMPT,
    tools: [
      {
        type: 'agent_toolset_20260401',
        default_config: { enabled: false },
      },
      ...ONBOARDING_CUSTOM_TOOLS,
    ],
  }, { headers: BETA });

  console.log(`   ✅ ONBOARDING_AGENT_ID=${agent.id}\n`);

  // 3. Resumo
  console.log('═══ CONFIGURAÇÃO CONCLUÍDA ═══');
  console.log('Adicione ao seu .env:\n');
  console.log(`MANAGED_AGENT_ENV_ID=${env.id}`);
  console.log(`ONBOARDING_AGENT_ID=${agent.id}`);
  console.log('\n═══ Próximo passo: configure as demais env vars e faça deploy ═══');
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
