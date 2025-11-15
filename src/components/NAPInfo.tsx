import React from 'react';
import { Phone, Mail, MapPin } from 'lucide-react';

interface NAPInfoProps {
  location?: string;
  variant?: 'full' | 'compact' | 'footer';
  className?: string;
}

const NAPInfo: React.FC<NAPInfoProps> = ({ 
  location, 
  variant = 'full',
  className = ''
}) => {
  const businessInfo = {
    name: "La Vaca General Contractors, LLC",
    phone: "(201) 212-4917",
    email: "alex@lavacagc.com",
    address: "West Orange, NJ",
    fullAddress: location 
      ? `${location}, NJ and surrounding areas`
      : "West Orange, NJ and surrounding areas",
    licenseNumber: "HIC# 13VH13373800",
    insuranceInfo: "Licensed, Bonded & Insured"
  };

  if (variant === 'compact') {
    return (
      <div className={`nap-info-compact ${className}`}>
        <div className="flex items-center gap-2 text-sm">
          <Phone className="h-4 w-4" />
          <a href="tel:2012124917" className="hover:text-primary transition-colors">
            {businessInfo.phone}
          </a>
        </div>
      </div>
    );
  }

  if (variant === 'footer') {
    return (
      <div className={`nap-info-footer ${className}`}>
        <div className="space-y-3">
          <h3 className="font-bold text-lg text-text-primary">
            {businessInfo.name}
          </h3>
          
          <div className="space-y-2">
            <div className="flex items-start gap-3">
              <MapPin className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-text-secondary">
                  {businessInfo.fullAddress}
                </p>
                <p className="text-sm text-text-muted">
                  {businessInfo.licenseNumber} • {businessInfo.insuranceInfo}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Phone className="h-5 w-5 text-primary" />
              <a 
                href="tel:2012124917"
                className="text-text-secondary hover:text-primary transition-colors"
              >
                {businessInfo.phone}
              </a>
            </div>
            
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <a 
                href="mailto:alex@lavacagc.com"
                className="text-text-secondary hover:text-primary transition-colors"
              >
                {businessInfo.email}
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full variant
  return (
    <div className={`nap-info-full ${className}`}>
      <div className="bg-card border rounded-lg p-6">
        <h3 className="font-bold text-xl text-text-primary mb-4">
          Contact {businessInfo.name}
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <MapPin className="h-6 w-6 text-primary mt-1 flex-shrink-0" />
            <div>
              <p className="font-medium text-text-primary">Service Area</p>
              <p className="text-text-secondary">
                {businessInfo.fullAddress}
              </p>
              <p className="text-sm text-text-muted mt-1">
                {businessInfo.licenseNumber}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Phone className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-text-primary">Phone</p>
              <a 
                href="tel:2012124917"
                className="text-text-secondary hover:text-primary transition-colors"
              >
                {businessInfo.phone}
              </a>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Mail className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-text-primary">Email</p>
              <a 
                href="mailto:alex@lavacagc.com"
                className="text-text-secondary hover:text-primary transition-colors"
              >
                {businessInfo.email}
              </a>
            </div>
          </div>
        </div>
        
        <div className="mt-6 p-4 bg-muted rounded-lg">
          <p className="text-sm text-text-secondary">
            <strong>{businessInfo.insuranceInfo}</strong> • 
            Free estimates available • 24-hour response time
          </p>
        </div>
      </div>
    </div>
  );
};

export default NAPInfo;