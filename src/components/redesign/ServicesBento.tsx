'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'

const services = [
  {
    title: 'Kitchen Remodeling',
    description: 'Custom cabinets, quartz countertops, modern fixtures. Designed around your vision and budget.',
    href: '/services/kitchen-remodeling',
    image: '/images/kitchen-hero.jpg',
    className: 'md:col-span-2 md:row-span-2',
  },
  {
    title: 'Bathroom Renovation',
    description: 'Marble tile, frameless glass, heated floors. From outdated to extraordinary.',
    href: '/services/bathroom-renovation',
    image: '/images/bathroom-hero.jpg',
    className: 'md:col-span-1 md:row-span-1',
  },
  {
    title: 'Basement Finishing',
    description: 'Add valuable living space with professional basement finishing.',
    href: '/services/basement-finishing',
    image: '/images/basement-hero.jpg',
    className: 'md:col-span-1 md:row-span-1',
  },
  {
    title: 'Home Additions',
    description: 'Expand your home with seamless, custom-designed additions.',
    href: '/services/home-additions',
    image: '/images/addition-hero.jpg',
    className: 'md:col-span-2 md:row-span-1',
  },
]

export default function ServicesBento() {
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
            Our Premium{' '}
            <span className="text-transparent bg-gradient-to-r from-primary to-accent-sunset bg-clip-text">
              Services
            </span>
          </h2>
          <p className="text-lg text-text-secondary max-w-2xl mx-auto">
            Specialized in luxury home renovations for Northern New Jersey&apos;s most distinguished communities
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[250px]">
          {services.map((service, i) => (
            <motion.div
              key={service.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className={service.className}
            >
              <Link href={service.href} className="group block relative h-full rounded-2xl overflow-hidden cursor-pointer">
                {/* Background image */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110"
                  style={{ backgroundImage: `url(${service.image})` }}
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent transition-colors duration-300 group-hover:from-black/70" />
                {/* Content */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-2 transition-transform duration-300 group-hover:-translate-y-1">
                    {service.title}
                  </h3>
                  <p className="text-white/70 text-sm md:text-base max-w-md transition-all duration-300 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0">
                    {service.description}
                  </p>
                  <div className="flex items-center gap-1 mt-3 text-primary font-medium opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0">
                    Learn More
                    <svg className="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
