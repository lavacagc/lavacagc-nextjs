/**
 * Telegram texts for experiment decisions. Pure, so a spec can pin them.
 * HTML parse mode: everything that came from the database is escaped.
 */
import { escapeTelegram, escapeTelegramClipped } from '@/lib/notify/telegramMessage';
import type { Evaluation } from './evaluate';
import { runLabel } from './schedule';
import type { ExperimentRow } from './types';

function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined ? 'n/a' : `${(value * 100).toFixed(digits)}%`;
}

/** A Monte Carlo estimate is never certain: 1.0 reads "more than 99.9%", 0 reads "less than 0.1%". */
export function chance(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'n/a';
  if (value > 0.999) return 'more than 99.9%';
  if (value < 0.001) return 'less than 0.1%';
  return `${(value * 100).toFixed(1)}%`;
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
  /** The daily run that promotes it if this message is the one delivered. */
  promoteAt: string;
  vetoUrl: string | null;
  by: string;
}): string {
  const { row, winnerKey, evaluation, promoteAt, vetoUrl, by } = input;
  const arm = evaluation?.arms.find((a) => a.key === winnerKey);
  const stats = arm ? ` (chance it beats the control ${chance(arm.p_beat_control)}, expected loss ${pct(arm.expected_loss, 2)})` : '';
  return [
    `<b>Experiment winner</b>: ${escapeTelegram(row.key)} on ${escapeTelegram(row.page)}`,
    `Variant ${escapeTelegram(winnerKey)} "${escapeTelegramClipped(label(row, winnerKey), 120)}" beats control ${escapeTelegram(row.control_key)} "${escapeTelegramClipped(label(row, row.control_key), 120)}"${stats}.${armsLine(evaluation, row.primary_metric)}`,
    `Unless you veto it, the daily run on ${escapeTelegram(runLabel(promoteAt))} makes variant ${escapeTelegram(winnerKey)} the page default (24 hours after this message). Proposed by ${escapeTelegram(by)}.`,
    vetoUrl ? `Veto: ${escapeTelegram(vetoUrl)}` : 'Veto link unavailable (INTERNAL_WEBHOOK_SECRET is unset or under 32 characters): veto from the admin Experiments tab.',
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
