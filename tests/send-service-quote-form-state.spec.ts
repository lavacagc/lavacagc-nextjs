import { test, expect, type BrowserContext, type Page } from '@playwright/test';

/**
 * The quote form's per-customer state, driven in a real browser.
 *
 * Everything this page writes onto a visit comes out of a control on it, and
 * three of those controls decide what the CREW and the CUSTOMER are told: the
 * ticked services, the address, and the sub. This spec drives the three failure
 * modes that made those controls lie, against the real component with the two
 * admin reads mocked at the network layer:
 *
 *   AC101 - a lookup that leaves the previous customer's name, address, scope
 *           and services on screen, so the booking writes THEIR services at
 *           THEIR address onto this customer's window.
 *   AC99  - a booked window re-saved against the customer's last REQUEST rather
 *           than what the window actually holds.
 *   AC100 - a sub the box could not read, sent as an explicit clear.
 *
 * The same fabricated cookie the other /vaca-mgmt specs use, against the shared
 * GoTrue stub playwright.config.ts starts for the run: NEXT_PUBLIC_SUPABASE_URL
 * is baked to 127.0.0.1:9099 at build time, so middleware's getUser() is
 * satisfied by any authenticated answer from it.
 */

interface Task { key: string; title: string; season: string }
interface StubBooking {
  start: string;
  end: string | null;
  address: string | null;
  tasks: Task[];
  dispatch?: { state: string; confirmedBy: string[]; flags: { by: string; note: string | null }[] };
  sub?: { read: 'ok' | 'unavailable'; name: string | null };
}
interface StubIntake {
  services: { key: string; title: string; blurb: string; priority: number }[];
  requests: {
    id: string; createdAt: string; source: string | null; name: string;
    phone: string | null; address: string | null; city: string | null; zip: string | null;
    taskKeys: string[]; services: { key: string; title: string }[];
  }[];
  history: Record<string, never>;
  homeowner: null | {
    id: string; first_name: string | null; phone: string | null;
    address: string | null; city: string | null; zip: string | null; status: string;
  };
  bookings: StubBooking[];
  bookingsRead: 'ok' | 'unavailable';
}

const CATALOG = [
  { key: 'gutters', title: 'Clean gutters', blurb: '', priority: 3 },
  { key: 'dryer_vent', title: 'Clear the dryer vent', blurb: '', priority: 2 },
  { key: 'furnace', title: 'Furnace tune-up', blurb: '', priority: 1 },
];

const blankIntake = (): StubIntake => ({
  services: CATALOG, requests: [], history: {}, homeowner: null, bookings: [], bookingsRead: 'ok',
});

/** A window on the books, Eastern, so the date/time inputs can name it. */
function easternWindow(day: string, fromHour: number, toHour: number) {
  // August is EDT (-04:00) and the page builds its instants the same way.
  const iso = (h: number) => `${day}T${String(h).padStart(2, '0')}:00:00-04:00`;
  return { start: new Date(iso(fromHour)).toISOString(), end: new Date(iso(toHour)).toISOString() };
}

test.describe('send-service-quote form state', () => {
  async function signInAsAdmin(context: BrowserContext, baseURL: string) {
    const session = {
      access_token: 'stub-access-token', refresh_token: 'stub-refresh-token',
      token_type: 'bearer', expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: '00000000-0000-0000-0000-000000000001', aud: 'authenticated', role: 'authenticated' },
    };
    await context.addCookies([{
      name: 'sb-127-auth-token',
      value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
      url: baseURL,
    }]);
  }

  /** The two reads the form opens with, plus a capture of what it POSTs. */
  async function mockAdminApis(page: Page, intakeFor: (email: string) => StubIntake) {
    await page.route('**/api/admin/crew', (route) => route.fulfill({
      json: { recipients: [{ id: '11111111-1111-1111-1111-111111111111', name: 'Alex', email: 'alex@lavacagc.com', active: true }] },
    }));
    await page.route('**/api/admin/service-quote/intake**', (route) => {
      const email = new URL(route.request().url()).searchParams.get('email') ?? '';
      return route.fulfill({ json: intakeFor(email) });
    });
    const posted: Record<string, unknown>[] = [];
    await page.route('**/api/admin/service-quote/schedule', (route) => {
      posted.push(route.request().postDataJSON());
      return route.fulfill({
        json: {
          status: 'scheduled', icsUrl: '/api/ics/x', homeownerId: '22222222-2222-2222-2222-222222222222',
          reminder: 'queued', dispatch: 'sent', dispatchedTo: ['Alex'],
          dispatchRecorded: 'ok', dispatchSubRecorded: 'ok',
        },
      });
    });
    return posted;
  }

  const open = async (page: Page, context: BrowserContext, baseURL: string) => {
    await signInAsAdmin(context, baseURL);
    await page.goto('/vaca-mgmt/send-service-quote');
    await expect(page.getByText('Send a service quote')).toBeVisible();
  };

  test('AC101 a second lookup cannot leave the first customer on screen', async ({ page, context, baseURL }) => {
    // Customer A has a past request with task keys. Customer B is a walk-in:
    // no homeowner record, and a lead whose message named no tasks - the exact
    // pair that skipped BOTH reset branches.
    const alice: StubIntake = {
      ...blankIntake(),
      requests: [{
        id: 'r1', createdAt: '2026-07-01T12:00:00Z', source: 'web', name: 'Alice Adams',
        phone: '555-0100', address: '14 Maple Ave', city: 'West Orange', zip: '07052',
        taskKeys: ['gutters'], services: [{ key: 'gutters', title: 'Clean gutters' }],
      }],
    };
    const bob: StubIntake = { ...blankIntake() };
    await mockAdminApis(page, (email) => (email === 'alice@example.com' ? alice : bob));
    await open(page, context, baseURL!);

    await page.getByTestId('sq-email').fill('alice@example.com');
    await page.getByTestId('sq-lookup').click();
    await expect(page.getByTestId('sq-scope')).toHaveValue('Clean gutters');
    await expect(page.getByTestId('sq-address')).toHaveValue('14 Maple Ave, West Orange, 07052');
    await expect(page.getByRole('checkbox').first()).toBeChecked();

    await page.getByTestId('sq-email').fill('bob@example.com');
    await page.getByTestId('sq-lookup').click();

    // Nothing of Alice's survives: not the scope sentence the quote mails, not
    // the address the window is booked at, not the services it is booked onto.
    await expect(page.getByTestId('sq-scope')).toHaveValue('');
    await expect(page.getByTestId('sq-address')).toHaveValue('');
    await expect(page.locator('#sq-name')).toHaveValue('');
    for (const box of await page.getByRole('checkbox').all()) await expect(box).not.toBeChecked();
    // ...and with nothing ticked the booking cannot be made at all.
    await expect(page.getByTestId('sq-schedule')).toBeDisabled();
  });

  test('AC99 re-saving a booked window sends what the window holds, not the last request', async ({ page, context, baseURL }) => {
    // The window holds gutters AND the dryer vent; the lead only ever asked for
    // gutters. Re-saving it - the documented way to add a crew member - used to
    // mail the crew and re-queue the customer "Clean gutters" alone.
    const win = easternWindow('2026-08-05', 8, 11);
    const intake: StubIntake = {
      ...blankIntake(),
      homeowner: { id: '22222222-2222-2222-2222-222222222222', first_name: 'Carla', phone: null, address: '9 Oak St', city: 'Montclair', zip: '07042', status: 'active' },
      requests: [{
        id: 'r1', createdAt: '2026-07-01T12:00:00Z', source: 'web', name: 'Carla Cruz',
        phone: null, address: '9 Oak St', city: 'Montclair', zip: '07042',
        taskKeys: ['gutters'], services: [{ key: 'gutters', title: 'Clean gutters' }],
      }],
      bookings: [{
        ...win, address: '9 Oak St, Montclair, 07042',
        tasks: [{ key: 'gutters', title: 'Clean gutters', season: 'fall' }, { key: 'dryer_vent', title: 'Clear the dryer vent', season: 'fall' }],
        dispatch: { state: 'awaiting', confirmedBy: [], flags: [] },
        sub: { read: 'ok', name: null },
      }],
    };
    const posted = await mockAdminApis(page, () => intake);
    await open(page, context, baseURL!);

    await page.getByTestId('sq-email').fill('carla@example.com');
    await page.getByTestId('sq-lookup').click();
    // Before the window is named, the request's own selection stands.
    await expect(page.getByTestId('sq-scope')).toHaveValue('Clean gutters');

    // Aim the form at the booked window.
    await page.getByTestId('sq-date').fill('2026-08-05');
    await page.locator('#sq-from').fill('08:00');
    await page.locator('#sq-to').fill('11:00');

    // The ticks now follow the visit, and the screen says what it holds where
    // the window is named - the checkboxes are a card away.
    await expect(page.getByTestId('sq-tasks-stored'))
      .toContainText('on the books for Clean gutters, Clear the dryer vent');
    await expect(page.getByRole('checkbox').nth(0)).toBeChecked();
    await expect(page.getByRole('checkbox').nth(1)).toBeChecked();

    await page.getByTestId('sq-schedule').click();
    await expect.poll(() => posted.length).toBe(1);
    expect((posted[0].taskKeys as string[]).sort()).toEqual(['dryer_vent', 'gutters']);
  });

  test('AC100 a sub that could not be read is left alone, and a typed one still wins', async ({ page, context, baseURL }) => {
    // The dispatch-row read failed, so the box has nothing to show. Sending its
    // empty value would DELETE the stored sub - and the write would succeed, so
    // nothing downstream could report it.
    const win = easternWindow('2026-08-05', 8, 11);
    const intake: StubIntake = {
      ...blankIntake(),
      homeowner: { id: '22222222-2222-2222-2222-222222222222', first_name: 'Dana', phone: null, address: '9 Oak St', city: 'Montclair', zip: '07042', status: 'active' },
      bookings: [{
        ...win, address: '9 Oak St, Montclair, 07042',
        tasks: [{ key: 'gutters', title: 'Clean gutters', season: 'fall' }],
        dispatch: { state: 'unknown', confirmedBy: [], flags: [] },
        sub: { read: 'unavailable', name: null },
      }],
    };
    const posted = await mockAdminApis(page, () => intake);
    await open(page, context, baseURL!);

    await page.getByTestId('sq-email').fill('dana@example.com');
    await page.getByTestId('sq-lookup').click();
    // Awaited: the lookup lands by clearing the form and filling it from this
    // customer, and one of the things it clears is a typed sub (AC98).
    await expect(page.getByTestId('sq-address')).toHaveValue('9 Oak St, Montclair, 07042');
    await page.getByTestId('sq-date').fill('2026-08-05');
    await page.locator('#sq-from').fill('08:00');
    await page.locator('#sq-to').fill('11:00');

    await expect(page.getByTestId('sq-sub-unread')).toBeVisible();
    await expect(page.getByTestId('sq-sub')).toHaveValue('');

    await page.getByTestId('sq-schedule').click();
    await expect.poll(() => posted.length).toBe(1);
    // ABSENT, not '' - `ensureVisitDispatch` leaves the stored sub alone.
    expect(posted[0]).not.toHaveProperty('subName');
    await expect(page.getByText('The sub was left as it is').first()).toBeVisible();

    // Typing makes the edit real, so a DELIBERATE sub still reaches the row -
    // and so would a deliberate clear.
    await page.getByTestId('sq-sub').fill('Ramirez Exteriors');
    await page.getByTestId('sq-schedule').click();
    await expect.poll(() => posted.length).toBe(2);
    expect(posted[1].subName).toBe('Ramirez Exteriors');
  });

  test('AC98 a time correction keeps the typed sub; retargeting a window with one does not', async ({ page, context, baseURL }) => {
    // Typing a sub and then noticing the From time is wrong is ordinary, and
    // dropping the edit on every keystroke threw the admin's input away.
    const nine = easternWindow('2026-08-05', 9, 12);
    const intake: StubIntake = {
      ...blankIntake(),
      homeowner: { id: '22222222-2222-2222-2222-222222222222', first_name: 'Eve', phone: null, address: '9 Oak St', city: 'Montclair', zip: '07042', status: 'active' },
      bookings: [{
        ...nine, address: '9 Oak St, Montclair, 07042',
        tasks: [{ key: 'gutters', title: 'Clean gutters', season: 'fall' }],
        dispatch: { state: 'awaiting', confirmedBy: [], flags: [] },
        sub: { read: 'ok', name: 'Ramirez Exteriors' },
      }],
    };
    await mockAdminApis(page, () => intake);
    await open(page, context, baseURL!);

    await page.getByTestId('sq-email').fill('eve@example.com');
    await page.getByTestId('sq-lookup').click();
    await expect(page.getByTestId('sq-address')).toHaveValue('9 Oak St, Montclair, 07042');
    await page.getByTestId('sq-date').fill('2026-08-06');
    await page.locator('#sq-from').fill('08:00');
    await page.getByTestId('sq-sub').fill('Delgado Roofing');
    // A correction onto a window with nothing booked keeps what was typed.
    await page.locator('#sq-from').fill('10:00');
    await expect(page.getByTestId('sq-sub')).toHaveValue('Delgado Roofing');

    // Retargeting onto a window that carries its own sub hands the box back, so
    // a sub typed for one visit can never overwrite another's.
    await page.getByTestId('sq-date').fill('2026-08-05');
    await page.locator('#sq-from').fill('09:00');
    await expect(page.getByTestId('sq-sub')).toHaveValue('Ramirez Exteriors');
    await expect(page.getByTestId('sq-sub-stored')).toContainText('Stored on this visit: Ramirez Exteriors');
  });
});
