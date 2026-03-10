'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const towns = [
  { name: 'Alpine', slug: 'alpine' },
  { name: 'Bloomfield', slug: 'bloomfield' },
  { name: 'Caldwell', slug: 'caldwell' },
  { name: 'Clifton', slug: 'clifton' },
  { name: 'Essex Fells', slug: 'essex-fells' },
  { name: 'Fort Lee', slug: 'fort-lee' },
  { name: 'Ho-Ho-Kus', slug: 'ho-ho-kus' },
  { name: 'Livingston', slug: 'livingston' },
  { name: 'Madison', slug: 'madison' },
  { name: 'Maplewood', slug: 'maplewood' },
  { name: 'Millburn', slug: 'millburn' },
  { name: 'Montclair', slug: 'montclair' },
  { name: 'Morristown', slug: 'morristown' },
  { name: 'Parsippany', slug: 'parsippany' },
  { name: 'Saddle River', slug: 'saddle-river' },
  { name: 'Short Hills', slug: 'short-hills' },
  { name: 'Verona', slug: 'verona' },
  { name: 'West Caldwell', slug: 'west-caldwell' },
  { name: 'West Orange', slug: 'west-orange' },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
    },
  },
}

const item = {
  hidden: { opacity: 0, scale: 0.8 },
  show: { opacity: 1, scale: 1 },
}

export default function ServiceAreasRedesign() {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-5xl font-bold text-text-primary mb-4">
            Serving Northern New Jersey&apos;s{' '}
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              Finest Communities
            </span>
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Premium renovations for Bergen, Essex, Morris, and Passaic County homeowners
          </p>
        </motion.div>

        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
          className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto"
        >
          {towns.map((town) => (
            <motion.div key={town.slug} variants={item}>
              <Link
                href={`/locations/${town.slug}`}
                className="inline-flex items-center px-5 py-2.5 bg-card border border-border/50 rounded-full text-text-secondary hover:text-primary hover:border-primary/40 hover:bg-primary/5 transition-all duration-300 text-sm md:text-base cursor-pointer"
              >
                <svg className="w-3.5 h-3.5 mr-2 text-primary/50" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                </svg>
                {town.name}, NJ
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
