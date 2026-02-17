'use client'

import React from 'react'
import Image from 'next/image'
import logo from '@/assets/logo.png'
import CallTrackingWrapper from '@/components/CallTrackingWrapper'
import { Phone } from 'lucide-react'

const LandingPageHeader: React.FC = () => {
  return (
    <>
      {/* Trust Bar */}
      <div className="bg-secondary text-secondary-foreground py-2 text-sm">
        <div className="container mx-auto px-4 text-center">
          <span className="font-medium">Licensed, Bonded, &amp; Insured | HIC# 13VH13373800</span>
        </div>
      </div>

      {/* Minimal Header — logo + phone only */}
      <header className="bg-background border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16 md:h-20">
            <div className="flex items-center space-x-2">
              <Image
                src={logo}
                alt="La Vaca General Contractors"
                className="h-10 md:h-14 w-auto"
                priority
              />
              <div className="text-left">
                <span className="font-bold text-sm md:text-base text-text-primary block leading-tight">La Vaca</span>
                <p className="text-xs md:text-sm text-text-muted -mt-0.5">General Contractors</p>
              </div>
            </div>

            <CallTrackingWrapper
              href="tel:2012124917"
              className="flex items-center gap-2 text-primary font-semibold text-sm md:text-base hover:text-primary-dark transition-colors"
            >
              <Phone className="h-4 w-4" />
              <span className="hidden sm:inline">(201) 212-4917</span>
              <span className="sm:hidden">Call Now</span>
            </CallTrackingWrapper>
          </div>
        </div>
      </header>
    </>
  )
}

export default LandingPageHeader
