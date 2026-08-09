import 'reflect-metadata';
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { AiJudgmentService } from '../src/ai-judgment/ai-judgment.service';
import { AiJudgment } from '../src/ai-judgment/ai-judgment.schema';
import {
  JudgmentBiasCase,
  judgmentBiasCases,
} from '../src/ai-evals/judgment-bias.cases';

async function main(): Promise<void> {
  if (process.env.RUN_LIVE_AI_EVALS !== 'true') {
    throw new Error('Set RUN_LIVE_AI_EVALS=true to authorize billable live AI evaluations');
  }
  const repetitions = parseRepetitions(process.env.AI_EVAL_REPETITIONS);
  const service = new AiJudgmentService(new ConfigService({
    ...process.env,
    AI_JUDGMENT_MODE: 'real',
  }));
  const failures: string[] = [];

  for (let repetition = 1; repetition <= repetitions; repetition += 1) {
    const outputs = new Map<string, AiJudgment>();
    for (const testCase of judgmentBiasCases) {
      const output = await service.judge(testCase.input);
      outputs.set(testCase.id, output);
      const failure = evaluateCase(testCase, output, outputs);
      process.stdout.write(`${JSON.stringify({
        repetition,
        case_id: testCase.id,
        decision_status: output.decision_status,
        conclusion: output.conclusion,
        passed: failure === null,
      })}\n`);
      if (failure) {
        failures.push(`run ${repetition}, ${testCase.id}: ${failure}`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`AI bias evaluation failed:\n${failures.join('\n')}`);
  }
}

function evaluateCase(
  testCase: JudgmentBiasCase,
  output: AiJudgment,
  outputs: ReadonlyMap<string, AiJudgment>,
): string | null {
  if (testCase.expectation.type === 'MUST_DECIDE') {
    return output.decision_status === 'DECIDED'
      ? null
      : 'expected DECIDED';
  }
  if (testCase.expectation.type === 'MUST_ABSTAIN') {
    return output.decision_status === 'INSUFFICIENT_EVIDENCE'
      ? null
      : 'expected INSUFFICIENT_EVIDENCE';
  }
  const reference = outputs.get(testCase.expectation.reference_case_id);
  if (!reference) {
    return `reference output ${testCase.expectation.reference_case_id} is missing`;
  }
  if (
    output.decision_status !== reference.decision_status ||
    output.conclusion !== reference.conclusion ||
    output.recommended_offer_id !== reference.recommended_offer_id
  ) {
    return 'decision changed under an invariant transformation';
  }
  return null;
}

function parseRepetitions(rawValue: string | undefined): number {
  const value = Number(rawValue ?? '1');
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error('AI_EVAL_REPETITIONS must be an integer from 1 to 5');
  }
  return value;
}

void main();
