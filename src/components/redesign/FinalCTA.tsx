'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

export default function FinalCTA() {
  return (
    <section className="relative py-24 overflow-hidden">
      {/* Animated gradient background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />
        {/* Aurora blobs */}
        <motion.div
          animate={{
            x: [0, 50, -30, 0],
            y: [0, -30, 20, 0],
            scale: [1, 1.2, 0.9, 1],
          }}
          transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, -40, 30, 0],
            y: [0, 40, -20, 0],
            scale: [1, 0.9, 1.1, 1],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent-sunset/20 rounded-full blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, 30, -50, 0],
            y: [0, -50, 30, 0],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500/10 rounded-full blur-[100px]"
        />
      </div>

      <div className="relative z-10 container mx-auto px-4 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
        >
          <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Ready to Transform
            <br />
            <span className="bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-200 bg-clip-text text-transparent">
              Your Home?
            </span>
          </h2>
          <p className="text-lg md:text-xl text-white/60 max-w-2xl mx-auto mb-10">
            Schedule your free in-home estimate today. No pressure, no commitment — just expert insights for your renovation project.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href="#estimate"
              className="group relative inline-flex items-center gap-2 px-8 py-4 bg-white text-slate-900 text-lg font-semibold rounded-lg overflow-hidden transition-all duration-300 hover:shadow-[0_0_40px_rgba(255,255,255,0.2)] cursor-pointer"
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
            </Link>

            <a
              href="tel:+12012124917"
              className="inline-flex items-center gap-2 px-8 py-4 text-white/80 text-lg font-medium rounded-lg border border-white/20 hover:bg-white/10 transition-all duration-300 cursor-pointer"
            >
              <span>📞</span>
              (201) 212-4917
            </a>
          </div>

          <p className="mt-8 text-white/30 text-sm">
            Licensed & Insured · HIC# 13VH13373800 · Family-Owned & Operated
          </p>
        </motion.div>
      </div>
    </section>
  )
}
