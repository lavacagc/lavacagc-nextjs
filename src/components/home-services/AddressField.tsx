'use client';

import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/lib/home-services/catalog';
import { s } from '@/lib/home-services/i18n';

export interface AddressValue {
  address: string;
  zip: string;
  town: string;
}

const PLACES_KEY = process.env.NEXT_PUBLIC_GOOGLE_PLACES_API_KEY || '';
const SCRIPT_ID = 'google-places-script';

interface PlaceComponent {
  long_name: string;
  short_name: string;
  types: string[];
}
interface PlacesAutocomplete {
  addListener: (event: string, cb: () => void) => void;
  getPlace: () => { formatted_address?: string; address_components?: PlaceComponent[] };
}
type PlacesWindow = Window & {
  google?: { maps?: { places?: { Autocomplete: new (input: HTMLInputElement, opts: unknown) => PlacesAutocomplete } } };
};

/** Load the Maps JS Places library once, on demand. Resolves false when it cannot load (network, CSP, bad key). */
function loadPlaces(): Promise<boolean> {
  return new Promise((resolve) => {
    const w = window as PlacesWindow;
    if (w.google?.maps?.places) return resolve(true);
    let script = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = SCRIPT_ID;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(PLACES_KEY)}&libraries=places`;
      script.async = true;
      document.head.appendChild(script);
    }
    const timer = setTimeout(() => resolve(Boolean(w.google?.maps?.places)), 8000);
    script.addEventListener('load', () => {
      clearTimeout(timer);
      resolve(Boolean(w.google?.maps?.places));
    }, { once: true });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      resolve(false);
    }, { once: true });
  });
}

const inputClass =
  'mt-1.5 block min-h-[48px] w-full rounded-xl border-2 border-border bg-card px-4 py-3 text-base text-text-primary placeholder:text-text-muted focus:border-secondary focus:outline-none focus:ring-2 focus:ring-secondary/30 aria-[invalid=true]:border-red-600';

/**
 * Property address (RF3). With NEXT_PUBLIC_GOOGLE_PLACES_API_KEY set, one field
 * wired to Places Autocomplete (US only) that fills ZIP and town. Without a
 * key - or when the Places script cannot load - a street field and a ZIP field.
 * The ZIP field also appears in Places mode whenever no ZIP has been resolved,
 * so a failed lookup can never leave the homeowner stuck.
 */
export default function AddressField({
  lang,
  value,
  onChange,
  onZipBlur,
  addressError,
  zipError,
}: {
  lang: Lang;
  value: AddressValue;
  onChange: (next: AddressValue) => void;
  onZipBlur: (zip: string) => void;
  addressError?: string | null;
  zipError?: string | null;
}) {
  const [placesReady, setPlacesReady] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!PLACES_KEY || !inputRef.current) return;
    let cancelled = false;
    void loadPlaces().then((ok) => {
      const w = window as PlacesWindow;
      if (cancelled || !ok || !inputRef.current || !w.google?.maps?.places) return;
      const ac = new w.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'us' },
        fields: ['address_components', 'formatted_address'],
        types: ['address'],
      });
      ac.addListener('place_changed', () => {
        const place = ac.getPlace();
        const parts = place.address_components ?? [];
        const find = (type: string) => parts.find((c) => c.types.includes(type))?.long_name ?? '';
        const zip = find('postal_code');
        const town = find('locality') || find('sublocality') || find('postal_town') || find('administrative_area_level_3');
        const next = { address: place.formatted_address || valueRef.current.address, zip: zip || valueRef.current.zip, town };
        onChange(next);
        if (next.zip) onZipBlur(next.zip);
      });
      setPlacesReady(true);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wire the widget once
  }, []);

  const showZip = !placesReady || !value.zip || Boolean(zipError);

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="hs-address" className="text-[15px] font-bold text-text-primary">
          {s('addressLabel', lang)}
        </label>
        <input
          ref={inputRef}
          id="hs-address"
          name="street-address"
          autoComplete="street-address"
          placeholder={s('addressPlaceholder', lang)}
          value={value.address}
          onChange={(e) => onChange({ ...value, address: e.target.value })}
          aria-invalid={Boolean(addressError)}
          aria-describedby={addressError ? 'hs-address-error' : undefined}
          className={inputClass}
        />
        {addressError && (
          <p id="hs-address-error" className="mt-1.5 text-sm font-semibold text-red-700">
            {addressError}
          </p>
        )}
      </div>
      {showZip && (
        <div className="max-w-[12rem]">
          <label htmlFor="hs-zip" className="text-[15px] font-bold text-text-primary">
            {s('zipLabel', lang)}
          </label>
          <input
            id="hs-zip"
            name="postal-code"
            autoComplete="postal-code"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            value={value.zip}
            onChange={(e) => onChange({ ...value, zip: e.target.value.replace(/\D/g, '').slice(0, 5) })}
            onBlur={(e) => onZipBlur(e.target.value)}
            aria-invalid={Boolean(zipError)}
            aria-describedby={zipError ? 'hs-zip-error' : undefined}
            className={inputClass}
          />
        </div>
      )}
      {zipError && (
        <p id="hs-zip-error" role="alert" className="text-sm font-semibold text-red-700" data-testid="zip-error">
          {zipError}
        </p>
      )}
    </div>
  );
}
