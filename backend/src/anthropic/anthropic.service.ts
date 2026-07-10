import { Injectable, Logger } from '@nestjs/common';

export interface AiAnalysisResult {
  strengths: string;
  improvements: string;
  trends: string;
  summary: string;
  suggestedOpinion: string;
}

interface AnalysisInput {
  personName: string;
  areaName: string;
  positionName: string;
  finalScore: number;
  teamScore: number;
  managerScore: number;
  selfScore: number;
  npsScore: number;
  scoreBand: string;
  receivedComments: string[]; // comentários recebidos (colegas + gestor), já sem identificação
  selfComment: string | null;
}

/**
 * Geração da análise de IA do parecer do gestor (PRD seção 20).
 * Modelo lido de ANTHROPIC_MODEL via .env — nunca hardcoded (correção
 * obrigatória da Sprint 0). Chamada via fetch puro (sem SDK), já que o
 * ambiente de produção (Railway) tem acesso de rede irrestrito.
 */
@Injectable()
export class AnthropicService {
  private readonly logger = new Logger(AnthropicService.name);

  async generateAnalysis(input: AnalysisInput): Promise<AiAnalysisResult> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const model = process.env.ANTHROPIC_MODEL;

    if (!apiKey) {
      this.logger.warn('ANTHROPIC_API_KEY não configurada. Retornando análise de fallback.');
      return this.fallbackAnalysis(input);
    }

    const prompt = this.buildPrompt(input);

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      if (!response.ok) {
        this.logger.error(`Falha ao gerar análise preditiva (status ${response.status}). Usando fallback.`);
        return this.fallbackAnalysis(input);
      }

      const data = await response.json();
      const text = data.content?.map((c: { text?: string }) => c.text ?? '').join('\n') ?? '';
      const cleaned = text.replace(/```json|```/g, '').trim();

      const parsed = JSON.parse(cleaned);
      return {
        strengths: parsed.strengths ?? '',
        improvements: parsed.improvements ?? '',
        trends: parsed.trends ?? '',
        summary: parsed.summary ?? '',
        suggestedOpinion: parsed.suggestedOpinion ?? '',
      };
    } catch (err) {
      this.logger.error(`Falha ao gerar análise preditiva: ${(err as Error).message}. Usando fallback.`);
      return this.fallbackAnalysis(input);
    }
  }

  private buildPrompt(input: AnalysisInput): string {
    return `Você é um assistente de RH ajudando um gestor a preparar o parecer final de um ciclo de feedback 360°.

Dados do colaborador:
- Nome: ${input.personName}
- Área: ${input.areaName}
- Cargo: ${input.positionName}
- Score final: ${input.finalScore.toFixed(1)} (${input.scoreBand})
- Score da equipe: ${input.teamScore.toFixed(1)}
- Score do gestor: ${input.managerScore.toFixed(1)}
- Autoavaliação: ${input.selfScore.toFixed(1)}
- NPS (recomendação): ${input.npsScore.toFixed(1)}

Comentário da autoavaliação: ${input.selfComment ?? '(não informado)'}

Comentários recebidos de colegas e gestor (sem identificação):
${input.receivedComments.map((c, i) => `${i + 1}. ${c}`).join('\n')}

Com base nesses dados, responda APENAS com um JSON válido (sem markdown, sem texto antes ou depois), no formato exato:
{
  "strengths": "pontos fortes identificados, em português, 2-3 frases",
  "improvements": "pontos de melhoria, em português, 2-3 frases",
  "trends": "tendências observadas nos comentários, em português, 1-2 frases",
  "summary": "resumo geral da avaliação, em português, 2-3 frases",
  "suggestedOpinion": "um parecer final sugerido para o gestor revisar e ajustar, em português, 3-4 frases, tom profissional e construtivo"
}`;
  }

  private fallbackAnalysis(input: AnalysisInput): AiAnalysisResult {
    return {
      strengths: 'Não foi possível gerar a análise automática no momento. Revise os comentários recebidos manualmente.',
      improvements: 'Não foi possível gerar a análise automática no momento.',
      trends: 'Não foi possível gerar a análise automática no momento.',
      summary: `Score final: ${input.finalScore.toFixed(1)} (${input.scoreBand}). Análise preditiva ainda não configurada no ambiente do servidor.`,
      suggestedOpinion: '',
    };
  }
}
