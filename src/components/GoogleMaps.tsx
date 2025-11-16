import React from 'react';
import { LocationData } from '@/data/locationData';

interface GoogleMapsProps {
  location: LocationData;
  className?: string;
  height?: string;
}

const GoogleMaps: React.FC<GoogleMapsProps> = ({
  location,
  className = '',
  height = '300px'
}) => {
  const businessName = "La Vaca General Contractors";
  const businessAddress = `${location.name}, NJ ${location.zipCodes[0]}`;

  // Generate Google Maps embed URL
  const getMapSrc = () => {
    // Use basic Google Maps embed without API key for now
    const query = encodeURIComponent(`${businessName} ${businessAddress}`);
    return `https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3000!2d${location.coordinates.lng}!3d${location.coordinates.lat}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x0!2s${query}!5e0!3m2!1sen!2sus!4v1234567890123!5m2!1sen!2sus`;
  };

  // Generate directions link
  const getDirectionsLink = () => {
    const params = new URLSearchParams({
      destination: businessAddress,
      dir_action: 'navigate'
    });

    return `https://www.google.com/maps/dir/?${params.toString()}`;
  };

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
            href={getDirectionsLink()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            Get Directions
          </a>
          <a
            href="tel:2012124917"
            className="inline-flex items-center px-4 py-2 bg-secondary text-secondary-foreground rounded-lg hover:bg-secondary/90 transition-colors text-sm font-medium"
          >
            Call (201) 212-4917
          </a>
        </div>
      </div>

      {/* Map Embed */}
      <div className="relative overflow-hidden rounded-lg border">
        <iframe
          src={getMapSrc()}
          width="100%"
          height={height}
          style={{ border: 0 }}
          allowFullScreen
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          title={`Map of ${location.name}, NJ - La Vaca General Contractors service area`}
        />
      </div>

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
