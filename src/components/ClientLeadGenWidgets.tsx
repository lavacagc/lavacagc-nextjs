'use client'

import dynamic from 'next/dynamic'

const ExitIntentPopup = dynamic(() => import('@/components/ExitIntentPopup'), { ssr: false })
const SocialProofPopup = dynamic(() => import('@/components/SocialProofPopup'), { ssr: false })

export function ClientLeadGenWidgets() {
  return (
    <>
      <ExitIntentPopup />
      <SocialProofPopup />
    </>
  )
}
