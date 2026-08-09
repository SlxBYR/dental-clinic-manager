import { AiAnswerCitation, AiAnswerResult, AiSettings, RagSearchHit } from '../types';
import { ragStorage, RAG_AI_SETTINGS_STORE_KEY } from './ragStorage';

const DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_SYSTEM_PROMPT = '你是口腔诊所管理系统内的资料归纳助手。';
const SAFETY_REQUIREMENTS = [
  '只能根据用户提供的引用片段回答。',
  '回答必须包含引用编号，例如 [1]、[2]。',
  '如果引用片段不足以回答，直接说明没有足够依据。',
  '不要输出诊断结论，不要编造患者信息。'
].join('\n');
const clampSystemPrompt = (value: string) => value.trim().slice(0, 4000);

const DEFAULT_AI_SETTINGS: AiSettings = {
  enabled: false,
  provider: 'openai-compatible',
  baseUrl: DEFAULT_AI_BASE_URL,
  apiKey: '',
  model: '',
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  sendPatientInfo: false,
  redactionMode: 'strict',
  maxContextChunks: 6
};

const clampContextChunks = (value: number) => Math.min(12, Math.max(1, Number(value) || DEFAULT_AI_SETTINGS.maxContextChunks));

const normalizeBaseUrl = (value: string) => value.trim().replace(/\/+$/, '') || DEFAULT_AI_BASE_URL;

const maskPhone = (value: string, strict: boolean) => {
  if (strict) return value.replace(/\d/g, '*');
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return value.replace(/\d/g, '*');
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
};

const redactContent = (content: string, hit: RagSearchHit, settings: AiSettings, citationIndex: number) => {
  if (settings.sendPatientInfo && settings.redactionMode === 'off') return content;

  const strict = !settings.sendPatientInfo || settings.redactionMode === 'strict';
  let redacted = content;

  if (hit.patientName) {
    const replacement = strict ? `患者${citationIndex}` : hit.patientName;
    redacted = redacted.split(hit.patientName).join(replacement);
  }

  redacted = redacted.replace(/(电话[:：]\s*)([^\n]+)/g, (_match, label, phone) => `${label}${maskPhone(phone, strict)}`);
  redacted = redacted.replace(/\b1[3-9]\d{9}\b/g, value => maskPhone(value, strict));
  return redacted;
};

const buildCitation = (hit: RagSearchHit, index: number): AiAnswerCitation => ({
  index,
  chunkId: hit.id,
  sourceType: hit.sourceType,
  title: hit.title,
  patientId: hit.patientId,
  patientName: hit.patientName,
  externalSourceName: hit.externalSourceName,
  externalId: hit.externalId
});

const getUsedCitationIndexes = (answer: string) => Array.from(answer.matchAll(/\[(\d+)\]/g))
  .map(match => Number(match[1]))
  .filter(index => Number.isSafeInteger(index) && index > 0);

class AiService {
  private settings: AiSettings = { ...DEFAULT_AI_SETTINGS };

  async initialize() {
    this.settings = this.parseSettings(await ragStorage.getItem(RAG_AI_SETTINGS_STORE_KEY));
  }

  private parseSettings(stored: string | null): AiSettings {
    if (!stored) return DEFAULT_AI_SETTINGS;
    try {
      const parsed = JSON.parse(stored) as Partial<AiSettings>;
      return {
        ...DEFAULT_AI_SETTINGS,
        ...parsed,
        provider: 'openai-compatible',
        baseUrl: typeof parsed.baseUrl === 'string' ? normalizeBaseUrl(parsed.baseUrl) : DEFAULT_AI_SETTINGS.baseUrl,
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        model: typeof parsed.model === 'string' ? parsed.model : '',
        systemPrompt: typeof parsed.systemPrompt === 'string'
          ? clampSystemPrompt(parsed.systemPrompt) || DEFAULT_SYSTEM_PROMPT
          : DEFAULT_SYSTEM_PROMPT,
        maxContextChunks: clampContextChunks(Number(parsed.maxContextChunks)),
        redactionMode: parsed.redactionMode === 'off' || parsed.redactionMode === 'basic' || parsed.redactionMode === 'strict'
          ? parsed.redactionMode
          : DEFAULT_AI_SETTINGS.redactionMode
      };
    } catch {
      return DEFAULT_AI_SETTINGS;
    }
  }

  getSettings(): AiSettings {
    return this.settings;
  }

  async updateSettings(settings: AiSettings) {
    const nextSettings: AiSettings = {
      ...settings,
      provider: 'openai-compatible',
      baseUrl: normalizeBaseUrl(settings.baseUrl),
      apiKey: settings.apiKey.trim(),
      model: settings.model.trim(),
      systemPrompt: clampSystemPrompt(settings.systemPrompt) || DEFAULT_SYSTEM_PROMPT,
      maxContextChunks: clampContextChunks(settings.maxContextChunks),
      redactionMode: settings.redactionMode
    };
    this.settings = nextSettings;
    await ragStorage.setItem(RAG_AI_SETTINGS_STORE_KEY, JSON.stringify(nextSettings));
  }

  async generateAnswer(query: string, hits: RagSearchHit[]): Promise<AiAnswerResult> {
    const settings = this.getSettings();
    if (!settings.enabled) return { success: false, message: 'AI 回答未启用。' };
    if (!settings.apiKey.trim()) return { success: false, message: '请先在设置中填写 AI API Key。' };
    if (!settings.model.trim()) return { success: false, message: '请先在设置中填写模型名称。' };
    if (!query.trim()) return { success: false, message: '请先输入检索问题。' };
    if (hits.length === 0) return { success: false, message: '没有可引用的检索片段，无法生成 AI 回答。' };

    const contextHits = hits.slice(0, clampContextChunks(settings.maxContextChunks));
    const citations = contextHits.map((hit, index) => buildCitation(hit, index + 1));
    const context = contextHits.map((hit, index) => {
      const citationIndex = index + 1;
      const source = hit.externalSourceName
        ? `${hit.externalSourceName}${hit.externalId ? ` / ${hit.externalId}` : ''}`
        : hit.patientName || hit.title;
      return [
        `[${citationIndex}] ${hit.title}`,
        `来源：${source}`,
        redactContent(hit.content, hit, settings, citationIndex)
      ].join('\n');
    }).join('\n\n');

    const systemPrompt = [settings.systemPrompt, SAFETY_REQUIREMENTS].join('\n\n');

    const userPrompt = [
      `问题：${query.trim()}`,
      '',
      '可引用片段：',
      context
    ].join('\n');

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30000);

    try {
      const response = await fetch(`${normalizeBaseUrl(settings.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey.trim()}`
        },
        body: JSON.stringify({
          model: settings.model.trim(),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.2
        }),
        signal: controller.signal
      });

      if (!response.ok) {
        return { success: false, message: `AI 服务返回 ${response.status} ${response.statusText || ''}`.trim(), citations };
      }

      const payload = await response.json();
      const answer = payload?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) {
        return { success: false, message: 'AI 服务没有返回可用回答。', citations };
      }

      const usedCitationIndexes = Array.from(new Set(getUsedCitationIndexes(answer)));
      if (usedCitationIndexes.length === 0) {
        return {
          success: false,
          message: 'AI 回答缺少引用编号，已拦截展示。',
          citations
        };
      }

      const citationMap = new Map(citations.map(citation => [citation.index, citation]));
      if (usedCitationIndexes.some(index => !citationMap.has(index))) {
        return {
          success: false,
          message: 'AI 回答包含无法对应到检索片段的引用，已拦截展示。',
          citations
        };
      }

      return {
        success: true,
        message: 'AI 回答已生成。',
        answer: answer.trim(),
        citations: usedCitationIndexes.map(index => citationMap.get(index) as AiAnswerCitation)
      };
    } catch (error) {
      const message = error instanceof DOMException && error.name === 'AbortError'
        ? 'AI 请求超时。'
        : 'AI 请求失败，请检查接口地址、Key、模型和网络。';
      return { success: false, message, citations };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }
}

export const aiService = new AiService();
