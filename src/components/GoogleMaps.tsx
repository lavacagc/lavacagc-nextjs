'use client';

import React, { useState } from 'react';
import { MapPin, Navigation, Phone } from 'lucide-react';
import { LocationData } from '@/data/locationData';

/**
 * Service-area map for the location pages.
 *
 * WHY THIS IS A FACADE, not an iframe.
 *
 * This component used to render an iframe pointing at a HAND-CRAFTED
 * `google.com/maps/embed?pb=...` URL. That `pb` string is an opaque, generated
 * parameter, and the one here was assembled from placeholders: `1s0x0%3A0x0`
 * for the place id and `4v1234567890123` for the build timestamp, with no API
 * key. Google never resolves it, so the iframe's load never completes - and
 * because a pending iframe keeps the document's load event pending, the window
 * `load` event never fired on any of the ~90 location pages.
 *
 * Two things broke as a result:
 *  - Playwright's default `page.goto` waits for `load`, so the smoke test
 *    "location service subpages work" timed out at 30s. That is why pushes
 *    needed --no-verify.
 *  - Real visitors waited on it too: anything deferred until onload (analytics,
 *    lazy work) was held back on every location page.
 *
 * The fix is a click-to-load facade rather than a fixed embed URL: nothing
 * third-party is requested until the visitor asks for the map, so there is no
 * pending frame, no API key to leak or rotate, and no render-blocking work.
 * The real embed loads on click via `maps.google.com/maps?q=...&output=embed`,
 * which needs no key. The "Open in Google Maps" link is always present, so the
 * map is reachable even if the embed is blocked or the visitor never clicks.
 */

interface GoogleMapsProps {
  location: LocationData;
  className?: string;
  height?: string;
}

const BUSINESS_NAME = 'La Vaca GC';

const GoogleMaps: React.FC<GoogleMapsProps> = ({
  location,
  className = '',
  height = '300px',
}) => {
  const [mapLoaded, setMapLoaded] = useState(false);

  const businessAddress = `${location.name}, NJ ${location.zipCodes[0]}`;
  const mapQuery = encodeURIComponent(`${BUSINESS_NAME} ${businessAddress}`);

  /** Key-free embed. Only ever requested after a click. */
  const embedSrc = `https://maps.google.com/maps?q=${mapQuery}&output=embed`;
  /** Always available, whether or not the embed is ever loaded. */
  const mapsLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const directionsLink = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(businessAddress)}`;

  return (
    <div className={`google-maps-container ${className}`}>
      <div className="mb-4">
        <h3 className="text-xl font-bold text-text-primary mb-2">
          Find Us in {location.name}
        </h3>
        <p className="text-text-secondary mb-3">
          Serving {location.name}, {location.county} and surrounding areas
        </p>

        {/* Driving Directions */}
        <div className="bg-muted p-4 rounded-lg mb-4">
          <h4 className="font-semibold text-text-primary mb-2">Driving Directions:</h4>
          <p className="text-text-secondary text-sm leading-relaxed">
            {location.drivingDirections}
          </p>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 mb-4">
          <a
            href={directionsLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Navigation className="mr-2 h-4 w-4" aria-hidden="true" />
            Get Directions
          </a>
          <a
            href="tel:2012124917"
            className="inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors text-sm font-medium"
          >
            <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
            Call (201) 212-4917
          </a>
        </div>
      </div>

      {/* Map: facade until asked for. Nothing third-party loads before the click. */}
      <div className="relative overflow-hidden rounded-lg border" style={{ minHeight: height }}>
        {mapLoaded ? (
          <iframe
            src={embedSrc}
            width="100%"
            height={height}
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            title={`Map of ${location.name}, NJ - ${BUSINESS_NAME} service area`}
          />
        ) : (
          <button
            type="button"
            onClick={() => setMapLoaded(true)}
            style={{ height }}
            className="flex w-full flex-col items-center justify-center gap-2 bg-muted/60 px-4 py-8 text-center transition-colors hover:bg-muted"
            aria-label={`Load the map of ${location.name}, NJ`}
          >
            <MapPin className="h-8 w-8 text-primary" aria-hidden="true" />
            <span className="font-semibold text-text-primary">
              {location.name}, NJ {location.zipCodes[0]}
            </span>
            <span className="text-sm text-text-secondary">
              Tap to load the map
            </span>
          </button>
        )}
      </div>
      <p className="mt-2 text-sm">
        <a
          href={mapsLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary underline hover:no-underline"
        >
          Open in Google Maps
        </a>
      </p>

      {/* Service Area Info */}
      <div className="mt-4 p-4 bg-background-subtle rounded-lg">
        <h4 className="font-semibold text-text-primary mb-2">
          We Also Serve These {location.county} Areas:
        </h4>
        <div className="flex flex-wrap gap-2">
          {location.nearbyAreas.map((area, index) => (
            <span
              key={index}
              className="px-3 py-1 bg-card border rounded-full text-sm text-text-secondary"
            >
              {area}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default GoogleMaps;
