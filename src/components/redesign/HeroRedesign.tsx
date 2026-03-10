'use client'

import { useRef } from 'react'
import { motion, useScroll, useTransform } from 'framer-motion'
import Link from 'next/link'

export default function HeroRedesign() {
  const ref = useRef<HTMLDivElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start start', 'end start'],
  })
  const scale = useTransform(scrollYProgress, [0, 1], [1, 1.15])
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0])
  const y = useTransform(scrollYProgress, [0, 1], [0, 100])

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      {/* Background image with scroll zoom */}
      <motion.div
        style={{ scale }}
        className="absolute inset-0"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: 'url(/images/hero-kitchen.jpg)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />
      </motion.div>

      {/* Content */}
      <motion.div
        style={{ opacity, y }}
        className="relative z-10 flex flex-col items-center justify-center h-full px-4 text-center"
      >
        {/* Shimmer headline */}
        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="text-4xl md:text-6xl lg:text-7xl font-bold text-white mb-6 max-w-5xl leading-tight"
        >
          Premium Home Remodeling
          <br />
          <span className="relative inline-block">
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-transparent bg-[length:200%_100%] animate-shimmer">
              Northern New Jersey
            </span>
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-lg md:text-xl text-white/80 mb-10 max-w-2xl"
        >
          Transform Your Kitchen, Bathroom, Basement, or Entire Home
          with Northern NJ&apos;s Trusted Renovation Experts
        </motion.p>

        {/* CTA Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <Link
            href="#estimate"
            className="group relative inline-flex items-center gap-2 px-8 py-4 bg-primary text-white text-lg font-semibold rounded-lg overflow-hidden transition-all duration-300 hover:shadow-[0_0_30px_rgba(var(--color-primary-rgb),0.4)] cursor-pointer"
          >
            <span className="relative z-10">Get Your Free Estimate</span>
            <svg
              className="relative z-10 w-5 h-5 transition-transform duration-300 group-hover:translate-x-1"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent-sunset opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1 }}
          className="flex flex-wrap justify-center gap-6 md:gap-10 mt-12"
        >
          {[
            { icon: '🛡️', text: 'Licensed & Insured' },
            { icon: '⭐', text: '5.0 Google Rating' },
            { icon: '👨‍👩‍👦', text: 'Family-Owned & Operated' },
            { icon: '⚡', text: '24hr Response' },
          ].map((badge) => (
            <div
              key={badge.text}
              className="flex items-center gap-2 text-white/70 text-sm md:text-base"
            >
              <span className="text-lg">{badge.icon}</span>
              <span>{badge.text}</span>
            </div>
          ))}
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2"
        >
          <div className="w-1.5 h-1.5 bg-white/60 rounded-full" />
        </motion.div>
      </motion.div>
    </section>
  )
}
