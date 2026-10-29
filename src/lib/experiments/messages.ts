/**
 * Telegram texts for experiment decisions. Pure, so a spec can pin them.
 * HTML parse mode: everything that came from the database is escaped.
 */
import { escapeTelegram, escapeTelegramClipped } from '@/lib/notify/telegramMessage';
import type { Evaluation } from './evaluate';
import type { ExperimentRow } from './types';

function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(digits)}%`;
}

function label(row: Pick<ExperimentRow, 'variants'>, key: string): string {
  return row.variants.find((v) => v.key === key)?.label ?? key;
}

function armsLine(evaluation: Evaluation | null, metric: string): string {
  if (!evaluation) return '';
  const parts = evaluation.arms.map((a) => `${a.key} ${a.visitors} visitors, ${a.conversions} ${metric}`);
  return parts.length ? `\n${escapeTelegram(parts.join('; '))}` : '';
}

export function winnerProposedMessage(input: {
  row: Pick<ExperimentRow, 'key' | 'page' | 'variants' | 'control_key' | 'primary_metric'>;
  winnerKey: string;
  evaluation: Evaluation | null;
  promoteAfter: string;
  vetoUrl: string | null;
  by: string;
}): string {
  const { row, winnerKey, evaluation, promoteAfter, vetoUrl, by } = input;
  const arm = evaluation?.arms.find((a) => a.key === winnerKey);
  const stats = arm ? ` (chance it beats the control ${pct(arm.p_beat_control)}, expected loss ${pct(arm.expected_loss, 2)})` : '';
  return [
    `<b>Experiment winner</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}`,
    `Variant ${escapeTelegram(winnerKey)} "${escapeTelegramClipped(label(row, winnerKey), 120)}" beats control ${escapeTelegram(row.control_key)} "${escapeTelegramClipped(label(row, row.control_key), 120)}"${stats}.${armsLine(evaluation, row.primary_metric)}`,
    `It becomes the page default at ${escapeTelegram(promoteAfter.replace('T', ' ').slice(0, 16))} UTC unless vetoed. Proposed by ${escapeTelegram(by)}.`,
    vetoUrl ? `Veto: ${escapeTelegram(vetoUrl)}` : 'Veto link unavailable (INTERNAL_WEBHOOK_SECRET is not set): veto from the admin Experiments tab.',
  ].join('\n');
}

export function promotedMessage(row: Pick<ExperimentRow, 'key' | 'page' | 'variants'>, winnerKey: string, by: string): string {
  return `<b>Experiment promoted</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}. Variant ${escapeTelegram(winnerKey)} "${escapeTelegramClipped(label(row, winnerKey), 120)}" is now the page default (by ${escapeTelegram(by)}).`;
}

export function vetoedMessage(row: Pick<ExperimentRow, 'key' | 'page' | 'control_key'>, winnerKey: string, by: string): string {
  return `<b>Experiment vetoed</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}. Variant ${escapeTelegram(winnerKey)} was not promoted; control ${escapeTelegram(row.control_key)} stays and the experiment is concluded (by ${escapeTelegram(by)}).`;
}

export function concludedMessage(row: Pick<ExperimentRow, 'key' | 'page' | 'control_key'>, reason: string, by: string): string {
  return `<b>Experiment concluded</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}. Control ${escapeTelegram(row.control_key)} stays. ${escapeTelegramClipped(reason, 500)} (by ${escapeTelegram(by)})`;
}

export function retiredMessage(row: Pick<ExperimentRow, 'key' | 'page'>, reason: string, by: string): string {
  return `<b>Experiment retired</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}. The page shows its default again. ${escapeTelegramClipped(reason, 500)} (by ${escapeTelegram(by)})`;
}

export function losersRetiredMessage(row: Pick<ExperimentRow, 'key' | 'page'>, losers: string[]): string {
  return `<b>Experiment</b> ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}: variant${losers.length > 1 ? 's' : ''} ${escapeTelegram(losers.join(', '))} retired (5% or less chance of beating the control). The rest keep running.`;
}

export function startedMessage(row: Pick<ExperimentRow, 'key' | 'page' | 'element' | 'hypothesis' | 'expected_effect' | 'variants' | 'control_key' | 'min_visitors' | 'min_days' | 'primary_metric'>, by: string): string {
  const variants = row.variants.map((v) => `${v.key}${v.key === row.control_key ? ' (control)' : ''}: ${v.label}`).join('; ');
  return [
    `<b>Experiment started</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)} (${escapeTelegram(row.element)}), by ${escapeTelegram(by)}`,
    `Hypothesis: ${escapeTelegramClipped(row.hypothesis, 600)}`,
    row.expected_effect ? `Expected effect: ${escapeTelegramClipped(row.expected_effect, 400)}` : '',
    `Variants: ${escapeTelegramClipped(variants, 800)}`,
    `Judged on ${escapeTelegram(row.primary_metric)} per visitor; decides after ${row.min_visitors} visitors per variant and ${row.min_days} days.`,
  ].filter(Boolean).join('\n');
}
