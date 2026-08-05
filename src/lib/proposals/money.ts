/**
 * Proposal Pod - one way to render integer cents as money.
 *
 * Shared by the client page, the owner alert and the tests, because the whole
 * pod turns on the browser's running total and the server's re-sum agreeing to
 * the cent - and two formatters are two chances to disagree about what a number
 * looks like at the moment somebody is reading both.
 *
 * Always two decimals. This is an estimate a client signs off and an owner
 * transcribes into QuickBooks; a rounded dollar figure is a number that has to
 * be checked against another one.
 */
export function usd(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
